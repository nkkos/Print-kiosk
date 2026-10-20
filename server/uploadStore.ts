import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { uploadedFiles } from './db/schema.js';
import { scanAndConvert } from './fileScanning.js';

// Real, DB-backed store for QR/Email-uploaded files, keyed by Kiosk Session
// id or the email session-address prefix (see server/routes.ts, server/emailStore.ts).
// See README.md, "Database" — this used to be an in-memory Map, wiped on every
// restart; it's now Postgres, so uploads survive redeploys.

const serverDir = dirname(fileURLToPath(import.meta.url));
export const uploadsDir = join(serverDir, 'uploads');

export interface UploadedFile {
  id: string;
  fileName: string;
  status: 'scanning' | 'converting' | 'ready' | 'rejected' | 'scan-unavailable';
}

async function updateStatus(fileId: string, status: UploadedFile['status']) {
  await db.update(uploadedFiles).set({ status }).where(eq(uploadedFiles.id, fileId));
}

async function scanFile(fileId: string, filePath: string, fileName: string) {
  await scanAndConvert(filePath, fileName, (status) => updateStatus(fileId, status));
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

  void scanFile(row.id, filePath, fileName);

  return { id: row.id, fileName: row.fileName, status: 'scanning' };
}

/** Where a session's file came from — Copy and "print this scan" put their
 * PDFs among the session's uploads too (server/copyStore.ts,
 * server/scanStore.ts), named `copy-…`/`scan-…` on disk; anything else was
 * uploaded by the customer. Lets the QR upload list show only the latter. */
function originOf(storagePath: string): 'upload' | 'copy' | 'scan' {
  const name = basename(storagePath);
  if (name.startsWith('copy-')) return 'copy';
  if (name.startsWith('scan-')) return 'scan';
  return 'upload';
}

export async function listFiles(
  sessionKey: string,
): Promise<(UploadedFile & { origin: 'upload' | 'copy' | 'scan' })[]> {
  const rows = await db
    .select({
      id: uploadedFiles.id,
      fileName: uploadedFiles.fileName,
      status: uploadedFiles.status,
      storagePath: uploadedFiles.storagePath,
    })
    .from(uploadedFiles)
    .where(eq(uploadedFiles.sessionKey, sessionKey))
    .orderBy(uploadedFiles.createdAt);
  return rows.map(({ storagePath, ...file }) => ({
    ...(file as UploadedFile),
    origin: originOf(storagePath),
  }));
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
