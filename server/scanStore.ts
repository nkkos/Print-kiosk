import { readFile, writeFile, unlink, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, and, asc, lt } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { db } from './db/client.js';
import { scanSessions, scanPages } from './db/schema.js';
import { warpAndCleanPage, InvalidCornersError, type Corners } from './scanProcessor.js';
import { reportIncident } from './incidentStore.js';

// Phone-Camera Scan (docs/scan-upload-requirements.md, docs/screens/scan-spec.md)
// — real, DB-backed store. Separate on-disk tree from every other upload
// method's, same reasoning as accountFileStore.ts vs. uploadStore.ts: keeps
// this feature's own (much shorter, 24h) retention sweep from ever being
// able to reach another store's files by accident.

const serverDir = dirname(fileURLToPath(import.meta.url));
export const scansDir = join(serverDir, 'scans');

export interface ScanPageRow {
  id: string;
  pageNumber: number;
  status: 'processing' | 'ready' | 'failed';
}

export interface ScanSessionRow {
  id: string;
  deliveryMethods: string[] | null;
  deliveredToEmail: string | null;
  accountFileId: string | null;
  deliveredAt: Date | null;
}

function processedPagePath(scanSessionId: string, pageId: string): string {
  return join(scansDir, scanSessionId, `processed-${pageId}.jpg`);
}

export function finalPdfPath(scanSessionId: string): string {
  return join(scansDir, scanSessionId, 'final.pdf');
}

export async function createScanSession(sessionId: string): Promise<{ id: string }> {
  const [row] = await db
    .insert(scanSessions)
    .values({ sessionId })
    .returning({ id: scanSessions.id });
  return row;
}

async function updatePageStatus(
  pageId: string,
  status: ScanPageRow['status'],
  processedStoragePath?: string,
) {
  await db
    .update(scanPages)
    .set({ status, ...(processedStoragePath ? { processedStoragePath } : {}) })
    .where(eq(scanPages.id, pageId));
}

async function processPage(
  scanSessionId: string,
  pageId: string,
  rawPath: string,
  corners: Corners,
) {
  try {
    const rawBuffer = await readFile(rawPath);
    const processedBuffer = await warpAndCleanPage(rawBuffer, corners);
    const outPath = processedPagePath(scanSessionId, pageId);
    await writeFile(outPath, processedBuffer);
    await updatePageStatus(pageId, 'ready', outPath);
  } catch (err) {
    if (err instanceof InvalidCornersError) {
      console.error('[scanStore] Page processing failed — invalid corners:', err.message);
      void reportIncident({
        source: 'backend',
        code: 'backend.scan-processing-failed',
        severity: 'info',
        message: `Scan page processing failed — invalid corners (page ${pageId}). Self-resolvable: the person just retakes the photo.`,
        context: { scanSessionId, pageId, error: err.message },
      });
    } else {
      console.error('[scanStore] Page processing failed:', err);
      void reportIncident({
        source: 'backend',
        code: 'backend.scan-processing-failed',
        severity: 'warning',
        message: `Scan page processing failed unexpectedly (page ${pageId}).`,
        context: { scanSessionId, pageId, error: String(err) },
      });
    }
    await updatePageStatus(pageId, 'failed');
  }
}

/** `rawPath` is where multer already wrote the uploaded photo (server/routes.ts)
 * — this takes ownership of that file (moves it under scansDir) and kicks off
 * async warp+cleanup processing (fire-and-forget, same pattern as
 * server/accountFileStore.ts's scanFile — the caller gets the row back
 * immediately in 'processing' state and polls for completion). */
export async function addPage(
  scanSessionId: string,
  pageNumber: number,
  rawPath: string,
  corners: Corners,
): Promise<ScanPageRow> {
  const [row] = await db
    .insert(scanPages)
    .values({
      scanSessionId,
      pageNumber,
      rawStoragePath: rawPath,
      status: 'processing',
    })
    .returning({ id: scanPages.id, pageNumber: scanPages.pageNumber, status: scanPages.status });

  void processPage(scanSessionId, row.id, rawPath, corners);

  return row as ScanPageRow;
}

export async function listPages(scanSessionId: string): Promise<ScanPageRow[]> {
  const rows = await db
    .select({ id: scanPages.id, pageNumber: scanPages.pageNumber, status: scanPages.status })
    .from(scanPages)
    .where(eq(scanPages.scanSessionId, scanSessionId))
    .orderBy(asc(scanPages.pageNumber));
  return rows as ScanPageRow[];
}

/** Resolves a page's processed image for the content endpoint (P3's preview,
 * `docs/screens/scan-spec.md`) — null if not ready yet. */
export async function getProcessedPagePath(
  scanSessionId: string,
  pageId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ processedStoragePath: scanPages.processedStoragePath, status: scanPages.status })
    .from(scanPages)
    .where(and(eq(scanPages.id, pageId), eq(scanPages.scanSessionId, scanSessionId)));
  if (!row || row.status !== 'ready') return null;
  return row.processedStoragePath;
}

export class NoReadyPagesError extends Error {}

// A4 at 72pt/in (docs/scan-upload-requirements.md's delivered PDF matches
// the rest of the project's A4-first convention — src/utils/pricing.ts,
// server/printerAdapter.ts). Each page image is scaled to fit within this,
// preserving its own aspect ratio, rather than stretched to fill it — a
// photographed page is rarely exactly A4-shaped.
const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;

// Combines every 'ready' page (in page-number order — failed pages are
// silently skipped, matching P3's own page list which never offers a failed
// page for delivery) into one PDF at finalPdfPath. Throws NoReadyPagesError
// if none are ready yet, so the caller (server/routes.ts's deliver route)
// can reject the request rather than deliver an empty document.
export async function combineToPdf(scanSessionId: string): Promise<string> {
  const rows = await db
    .select({ processedStoragePath: scanPages.processedStoragePath })
    .from(scanPages)
    .where(and(eq(scanPages.scanSessionId, scanSessionId), eq(scanPages.status, 'ready')))
    .orderBy(asc(scanPages.pageNumber));
  if (rows.length === 0) {
    throw new NoReadyPagesError();
  }

  const pdfDoc = await PDFDocument.create();
  for (const row of rows) {
    const imageBytes = await readFile(row.processedStoragePath!);
    const image = await pdfDoc.embedJpg(imageBytes);
    const page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    const scale = Math.min(A4_WIDTH_PT / image.width, A4_HEIGHT_PT / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    page.drawImage(image, {
      x: (A4_WIDTH_PT - drawWidth) / 2,
      y: (A4_HEIGHT_PT - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }

  const outPath = finalPdfPath(scanSessionId);
  await writeFile(outPath, await pdfDoc.save());
  return outPath;
}

// Records how the finished PDF was delivered (P4/P5, `docs/screens/scan-spec.md`)
// — the actual sending/saving side effects (email, save-to-account) are
// orchestrated by the caller (server/routes.ts), since those touch other
// stores (emailSender.ts, accountFileStore.ts) that scanStore.ts shouldn't
// need to import.
export async function markDelivered(
  scanSessionId: string,
  methods: string[],
  email: string | null,
  accountFileId: string | null,
): Promise<void> {
  await db
    .update(scanSessions)
    .set({
      deliveryMethods: methods.join(','),
      deliveredToEmail: email,
      accountFileId,
      finalStoragePath: finalPdfPath(scanSessionId),
      deliveredAt: new Date(),
    })
    .where(eq(scanSessions.id, scanSessionId));
}

export async function getScanSession(id: string): Promise<ScanSessionRow | null> {
  const [row] = await db
    .select({
      id: scanSessions.id,
      deliveryMethods: scanSessions.deliveryMethods,
      deliveredToEmail: scanSessions.deliveredToEmail,
      accountFileId: scanSessions.accountFileId,
      deliveredAt: scanSessions.deliveredAt,
    })
    .from(scanSessions)
    .where(eq(scanSessions.id, id));
  if (!row) return null;
  return { ...row, deliveryMethods: row.deliveryMethods ? row.deliveryMethods.split(',') : null };
}

// Retention (docs/scan-upload-requirements.md, "Retention (anonymous
// delivery)") — 24h for every scan session's raw/processed files,
// unconditionally, regardless of delivery method: "Save to Personal
// Account" already copied the finished PDF into accountFiles' own,
// separately-retained storage (server/accountFileStore.ts) by the time this
// runs, so deleting the original scan session here never touches that copy.
// Deleting the scanSessions row cascades to its scanPages rows (schema's
// onDelete: 'cascade') — only the on-disk directory needs an explicit
// removal. Same TTL-sweep shape as sweepExpiredAccountFiles, just a whole
// session directory instead of per-file paths.
export const SCAN_SESSION_RETENTION_HOURS = 24;

export async function sweepExpiredScanSessions(retentionHours: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
  const staleSessions = await db
    .select({ id: scanSessions.id })
    .from(scanSessions)
    .where(lt(scanSessions.createdAt, cutoff));

  for (const session of staleSessions) {
    await rm(join(scansDir, session.id), { recursive: true, force: true });
    await db.delete(scanSessions).where(eq(scanSessions.id, session.id));
  }
  return staleSessions.length;
}

export { unlink as unlinkScanFile };
