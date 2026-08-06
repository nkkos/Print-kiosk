import { unlink } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import NodeClam from 'clamscan';
import { db } from './db/client.js';
import { uploadedFiles } from './db/schema.js';

// Real, DB-backed store for QR/Email-uploaded files, keyed by Kiosk Session
// id or the email session-address prefix (see server/routes.ts, server/emailStore.ts).
// See README.md, "Database" — this used to be an in-memory Map, wiped on every
// restart; it's now Postgres, so uploads survive redeploys.

const serverDir = dirname(fileURLToPath(import.meta.url));
export const uploadsDir = join(serverDir, 'uploads');

export interface UploadedFile {
  id: string;
  fileName: string;
  status: 'scanning' | 'ready' | 'rejected';
}

// Real antivirus scanning (docs/domain/kiosk-session.md, "File scanning
// status") via a clamd daemon over TCP — connected lazily and cached only on
// success, so a scan simply retries the connection next time rather than
// crashing or wedging into a permanently-failed state. This matters
// especially on Railway, where `clamav` and `backend` start independently —
// backend can easily come up before clamd is ready to accept connections.
let clamscanPromise: Promise<NodeClam> | null = null;

function getClamscan(): Promise<NodeClam> {
  if (!clamscanPromise) {
    clamscanPromise = new NodeClam()
      .init({
        removeInfected: false, // we delete ourselves, after updating our own store
        clamdscan: {
          host: process.env.CLAMD_HOST ?? '127.0.0.1',
          port: Number(process.env.CLAMD_PORT ?? 3310),
          timeout: 60000,
          active: true,
        },
        clamscan: { active: false },
        preference: 'clamdscan',
      })
      .catch((err: unknown) => {
        clamscanPromise = null; // let the next scan try again instead of reusing this failure forever
        throw err;
      });
  }
  return clamscanPromise;
}

async function updateStatus(fileId: string, status: UploadedFile['status']) {
  await db.update(uploadedFiles).set({ status }).where(eq(uploadedFiles.id, fileId));
}

async function scanFile(fileId: string, filePath: string) {
  try {
    const clamscan = await getClamscan();
    const { isInfected } = await clamscan.scanFile(filePath);
    if (isInfected) {
      // Deleted immediately rather than waiting for session end — matches
      // docs/domain/kiosk-session.md's "delete the file content, retain the
      // metadata/fact" cleanup philosophy, just applied right away since
      // there's no reason to keep a flagged file around any longer than
      // necessary. The DB record (fileName + 'rejected') stays, so the
      // kiosk can still show the user what happened.
      await unlink(filePath).catch(() => {});
      await updateStatus(fileId, 'rejected');
    } else {
      await updateStatus(fileId, 'ready');
    }
  } catch (err) {
    // Dev-only fail-open: if clamd itself is unreachable (e.g. a developer
    // forgot to start it), don't silently block every QR upload — log
    // clearly and let the file through instead. This is explicitly NOT the
    // production answer (docs/domain/kiosk-session.md, "File scanning
    // status") — production should fail closed.
    console.error(`[uploadStore] Scan failed for ${filePath}, failing open:`, err);
    await updateStatus(fileId, 'ready');
  }
}

export async function addFile(
  sessionKey: string,
  fileName: string,
  filePath: string,
  emailId?: string,
): Promise<UploadedFile> {
  const [row] = await db
    .insert(uploadedFiles)
    .values({
      sessionKey,
      fileName,
      storagePath: relative(uploadsDir, filePath),
      emailId,
      status: 'scanning',
    })
    .returning({ id: uploadedFiles.id, fileName: uploadedFiles.fileName });

  void scanFile(row.id, filePath);

  return { id: row.id, fileName: row.fileName, status: 'scanning' };
}

export async function listFiles(sessionKey: string): Promise<UploadedFile[]> {
  const rows = await db
    .select({
      id: uploadedFiles.id,
      fileName: uploadedFiles.fileName,
      status: uploadedFiles.status,
    })
    .from(uploadedFiles)
    .where(eq(uploadedFiles.sessionKey, sessionKey))
    .orderBy(uploadedFiles.createdAt);
  return rows as UploadedFile[];
}

// Resolves a real uploaded file's absolute path for printing
// (server/printerAdapter.ts) — only 'ready' files with a printable extension
// (server/fileValidation.ts) should actually be sent to the printer; callers
// fall back to the placeholder document otherwise.
export async function getUploadedFile(
  id: string,
): Promise<{ absolutePath: string; fileName: string; status: UploadedFile['status'] } | null> {
  const [row] = await db
    .select({
      fileName: uploadedFiles.fileName,
      storagePath: uploadedFiles.storagePath,
      status: uploadedFiles.status,
    })
    .from(uploadedFiles)
    .where(eq(uploadedFiles.id, id));
  if (!row) return null;
  return {
    absolutePath: join(uploadsDir, row.storagePath),
    fileName: row.fileName,
    status: row.status as UploadedFile['status'],
  };
}
