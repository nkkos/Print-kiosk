import { readFile, writeFile, unlink, rm, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { eq, and, asc, lt } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { db } from './db/client.js';
import { copySessions, copyPages } from './db/schema.js';
import { warpAndCleanPage, InvalidCornersError, type Corners } from './scanProcessor.js';
import { addFile as addUploadedFile, uploadsDir } from './uploadStore.js';

// Copy (docs/copy-upload-requirements.md, docs/screens/copy-spec.md) —
// reuses Scan's own capture pipeline (server/scanProcessor.ts for the actual
// warp+cleanup) but has no delivery step: once the person taps "Finish," the
// captured pages are combined into one PDF and handed straight to
// server/uploadStore.ts's real, already-built session-scoped upload store —
// from that point on a Copy result is just a normal uploaded file, printed
// through the exact same Print Order Configuration -> Cart -> Payment Status
// -> Print Status path any other upload already goes through. This is why
// there's no equivalent of scanStore.ts's markDelivered/deliveryMethods here.

const serverDir = dirname(fileURLToPath(import.meta.url));
export const copiesDir = join(serverDir, 'copies');

export interface CopyPageRow {
  id: string;
  pageNumber: number;
  status: 'processing' | 'ready' | 'failed';
}

export interface CopySessionRow {
  id: string;
  sessionId: string;
  resultFileId: string | null;
  resultPageCount: number | null;
}

function processedPagePath(copySessionId: string, pageId: string): string {
  return join(copiesDir, copySessionId, `processed-${pageId}.jpg`);
}

export async function createCopySession(sessionId: string): Promise<{ id: string }> {
  const [row] = await db.insert(copySessions).values({ sessionId }).returning({
    id: copySessions.id,
  });
  return row;
}

async function updatePageStatus(
  pageId: string,
  status: CopyPageRow['status'],
  processedStoragePath?: string,
) {
  await db
    .update(copyPages)
    .set({ status, ...(processedStoragePath ? { processedStoragePath } : {}) })
    .where(eq(copyPages.id, pageId));
}

async function processPage(
  copySessionId: string,
  pageId: string,
  rawPath: string,
  corners: Corners,
) {
  try {
    const rawBuffer = await readFile(rawPath);
    const processedBuffer = await warpAndCleanPage(rawBuffer, corners);
    const outPath = processedPagePath(copySessionId, pageId);
    await writeFile(outPath, processedBuffer);
    await updatePageStatus(pageId, 'ready', outPath);
  } catch (err) {
    if (err instanceof InvalidCornersError) {
      console.error('[copyStore] Page processing failed — invalid corners:', err.message);
    } else {
      console.error('[copyStore] Page processing failed:', err);
    }
    await updatePageStatus(pageId, 'failed');
  }
}

/** `rawPath` is where multer already wrote the uploaded photo
 * (server/routes.ts) — same fire-and-forget pattern as scanStore.ts's
 * addPage: the caller gets the row back immediately in 'processing' state
 * and polls for completion. */
export async function addPage(
  copySessionId: string,
  pageNumber: number,
  rawPath: string,
  corners: Corners,
): Promise<CopyPageRow> {
  const [row] = await db
    .insert(copyPages)
    .values({
      copySessionId,
      pageNumber,
      rawStoragePath: rawPath,
      status: 'processing',
    })
    .returning({ id: copyPages.id, pageNumber: copyPages.pageNumber, status: copyPages.status });

  void processPage(copySessionId, row.id, rawPath, corners);

  return row as CopyPageRow;
}

export async function listPages(copySessionId: string): Promise<CopyPageRow[]> {
  const rows = await db
    .select({ id: copyPages.id, pageNumber: copyPages.pageNumber, status: copyPages.status })
    .from(copyPages)
    .where(eq(copyPages.copySessionId, copySessionId))
    .orderBy(asc(copyPages.pageNumber));
  return rows as CopyPageRow[];
}

/** Resolves a page's processed image for P3's preview — null if not ready
 * yet. Same shape as scanStore.ts's getProcessedPagePath. */
export async function getProcessedPagePath(
  copySessionId: string,
  pageId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ processedStoragePath: copyPages.processedStoragePath, status: copyPages.status })
    .from(copyPages)
    .where(and(eq(copyPages.id, pageId), eq(copyPages.copySessionId, copySessionId)));
  if (!row || row.status !== 'ready') return null;
  return row.processedStoragePath;
}

export async function getCopySession(id: string): Promise<CopySessionRow | null> {
  const [row] = await db
    .select({
      id: copySessions.id,
      sessionId: copySessions.sessionId,
      resultFileId: copySessions.resultFileId,
      resultPageCount: copySessions.resultPageCount,
    })
    .from(copySessions)
    .where(eq(copySessions.id, id));
  return row ?? null;
}

export class NoReadyPagesError extends Error {}

// Same A4-first convention as scanStore.ts's combineToPdf.
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;

async function deletePageArtifacts(copySessionId: string, pages: { rawStoragePath: string }[]) {
  for (const page of pages) {
    await unlink(page.rawStoragePath).catch(() => {});
  }
  await rm(join(copiesDir, copySessionId), { recursive: true, force: true });
}

/** P3's "Finish" (`copy-finish`, docs/screens/copy-spec.md) — combines every
 * 'ready' page into one PDF and hands it to the real, session-scoped upload
 * store (server/uploadStore.ts) under the owning Kiosk Session, exactly as
 * if it had arrived via QR upload. Sets `resultFileId`/`resultPageCount` so
 * the kiosk's polling (GET /api/copy-sessions/:id) can show the "Ready"
 * state and its page count, even though the `copyPages` rows themselves are
 * about to be deleted below. Deletes the raw/processed per-page captures
 * immediately afterward — once combined,
 * they're superseded by the real uploaded-file row, which is itself already
 * covered by the existing session-scoped cleanup (server/sessionLifecycle.ts)
 * — no separate retention window needed for Copy's own tables (unlike
 * Scan's 24h sweep), matching docs/copy-upload-requirements.md's "Retention".
 * Throws NoReadyPagesError if no page is ready yet. */
export async function finishCopySession(copySessionId: string): Promise<{ fileId: string }> {
  const session = await getCopySession(copySessionId);
  if (!session) throw new NoReadyPagesError();

  const readyPages = await db
    .select({ id: copyPages.id, processedStoragePath: copyPages.processedStoragePath })
    .from(copyPages)
    .where(and(eq(copyPages.copySessionId, copySessionId), eq(copyPages.status, 'ready')))
    .orderBy(asc(copyPages.pageNumber));
  if (readyPages.length === 0) {
    throw new NoReadyPagesError();
  }

  const pdfDoc = await PDFDocument.create();
  for (const page of readyPages) {
    const imageBytes = await readFile(page.processedStoragePath!);
    const image = await pdfDoc.embedJpg(imageBytes);
    const pdfPage = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    const scale = Math.min(A4_WIDTH_PT / image.width, A4_HEIGHT_PT / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    pdfPage.drawImage(image, {
      x: (A4_WIDTH_PT - drawWidth) / 2,
      y: (A4_HEIGHT_PT - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }

  // Written directly under uploadsDir (not copiesDir) — deletePageArtifacts
  // below only ever removes copiesDir/<copySessionId>/, so a combined PDF
  // that lived there would be deleted the instant it was created. Living
  // under uploadsDir, keyed by the same sessionId subfolder QR upload uses,
  // also means it's covered by the existing session-scoped cleanup
  // (server/sessionLifecycle.ts's deleteFilesForSessionKeys) exactly as the
  // comment on finishCopySession below already claims.
  const uploadedFileDir = join(uploadsDir, session.sessionId);
  await mkdir(uploadedFileDir, { recursive: true });
  const finalPdfPath = join(uploadedFileDir, `copy-${randomUUID()}.pdf`);
  await writeFile(finalPdfPath, await pdfDoc.save());

  const fileName = `Copy ${new Date().toISOString().slice(0, 10)}.pdf`;
  const uploaded = await addUploadedFile(session.sessionId, fileName, finalPdfPath);

  await db
    .update(copySessions)
    .set({ resultFileId: uploaded.id, resultPageCount: readyPages.length })
    .where(eq(copySessions.id, copySessionId));

  const allPages = await db
    .select({ rawStoragePath: copyPages.rawStoragePath })
    .from(copyPages)
    .where(eq(copyPages.copySessionId, copySessionId));
  await deletePageArtifacts(copySessionId, allPages);
  await db.delete(copyPages).where(eq(copyPages.copySessionId, copySessionId));

  return { fileId: uploaded.id };
}

// Orphan safety-net for a capture that's never finished (abandoned mid-way)
// — mirrors server/sessionLifecycle.ts's ORPHAN_FILE_TTL_MS role for
// uploadedFiles, not a primary retention mechanism (that's the explicit
// session-end cleanup in server/sessionLifecycle.ts, plus the immediate
// cleanup finishCopySession already does on the successful path above).
export async function sweepOrphanedCopySessions(maxAgeMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const staleSessions = await db
    .select({ id: copySessions.id })
    .from(copySessions)
    .where(lt(copySessions.createdAt, cutoff));

  for (const session of staleSessions) {
    const pages = await db
      .select({ rawStoragePath: copyPages.rawStoragePath })
      .from(copyPages)
      .where(eq(copyPages.copySessionId, session.id));
    await deletePageArtifacts(session.id, pages);
    await db.delete(copySessions).where(eq(copySessions.id, session.id));
  }
  return staleSessions.length;
}

/** Deletes any not-yet-finished copy sessions for the given Kiosk Session ids
 * — called from server/sessionLifecycle.ts's endSession, mirroring
 * deleteFilesForSessionKeys's role for uploadedFiles. A copy session that
 * already finished (resultFileId set) has no page artifacts left to clean
 * here — that cleanup already happened in finishCopySession, and the result
 * file itself is deleted by deleteFilesForSessionKeys like any other upload. */
export async function deleteCopySessionsForKioskSessions(sessionIds: string[]): Promise<void> {
  for (const sessionId of sessionIds) {
    const sessions = await db
      .select({ id: copySessions.id })
      .from(copySessions)
      .where(eq(copySessions.sessionId, sessionId));
    for (const session of sessions) {
      const pages = await db
        .select({ rawStoragePath: copyPages.rawStoragePath })
        .from(copyPages)
        .where(eq(copyPages.copySessionId, session.id));
      await deletePageArtifacts(session.id, pages);
    }
    await db.delete(copySessions).where(eq(copySessions.sessionId, sessionId));
  }
}
