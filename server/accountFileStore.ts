import { unlink } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, lt } from 'drizzle-orm';
import { db } from './db/client.js';
import { accountFiles, accountFolders } from './db/schema.js';
import { scanAndConvert } from './fileScanning.js';
import { getConvertedPath } from './documentConverter.js';
import {
  ACCOUNT_FILE_MAX_TOTAL_STORAGE_BYTES,
  AccountStorageQuotaExceededError,
} from './accountFileLimits.js';

// Real, DB-backed store for Personal Account's "My files"
// (docs/personal-account-requirements.md) — permanent, account-owned
// storage. Deliberately separate from server/uploadStore.ts's session-scoped
// `uploadedFiles`/`uploadsDir`: this tree is never touched by
// server/sessionLifecycle.ts's TTL sweep or session-end cleanup, since those
// only ever walk `uploadsDir`.

const serverDir = dirname(fileURLToPath(import.meta.url));
export const accountUploadsDir = join(serverDir, 'account-uploads');

export interface AccountFile {
  id: string;
  fileName: string;
  folderId: string | null;
  status: 'scanning' | 'converting' | 'ready' | 'rejected' | 'scan-unavailable';
}

export interface AccountFolder {
  id: string;
  name: string;
}

async function updateFileStatus(fileId: string, status: AccountFile['status']) {
  await db.update(accountFiles).set({ status }).where(eq(accountFiles.id, fileId));
}

async function scanFile(fileId: string, filePath: string, fileName: string) {
  await scanAndConvert(filePath, fileName, (status) => updateFileStatus(fileId, status));
}

// Throws AccountStorageQuotaExceededError (server/accountFileLimits.ts) if
// adding this file would push the account over its total storage quota —
// checked before the row is written, not after, so a rejected file never
// gets counted. The caller (server/routes.ts) is responsible for deleting
// the already-uploaded disk file in that case, since multer writes it to
// disk before this function ever runs.
export async function addFile(
  accountId: string,
  fileName: string,
  filePath: string,
  fileSizeBytes: number,
  folderId?: string,
): Promise<AccountFile> {
  const existingFiles = await db
    .select({ fileSizeBytes: accountFiles.fileSizeBytes })
    .from(accountFiles)
    .where(eq(accountFiles.accountId, accountId));
  const currentTotalBytes = existingFiles.reduce((sum, file) => sum + file.fileSizeBytes, 0);
  if (currentTotalBytes + fileSizeBytes > ACCOUNT_FILE_MAX_TOTAL_STORAGE_BYTES) {
    throw new AccountStorageQuotaExceededError();
  }

  const [row] = await db
    .insert(accountFiles)
    .values({
      accountId,
      folderId: folderId ?? null,
      fileName,
      storagePath: relative(accountUploadsDir, filePath),
      fileSizeBytes,
      status: 'scanning',
    })
    .returning({
      id: accountFiles.id,
      fileName: accountFiles.fileName,
      folderId: accountFiles.folderId,
    });

  void scanFile(row.id, filePath, fileName);

  return { id: row.id, fileName: row.fileName, folderId: row.folderId, status: 'scanning' };
}

export async function listFiles(accountId: string): Promise<AccountFile[]> {
  const rows = await db
    .select({
      id: accountFiles.id,
      fileName: accountFiles.fileName,
      folderId: accountFiles.folderId,
      status: accountFiles.status,
    })
    .from(accountFiles)
    .where(eq(accountFiles.accountId, accountId))
    .orderBy(accountFiles.createdAt);
  return rows as AccountFile[];
}

// Resolves a real account file's absolute path — for the content endpoint
// (preview) and for POST /api/print-tasks's account-origin resolution path
// (server/routes.ts), mirroring server/uploadStore.ts's getUploadedFile.
export async function getAccountFile(
  id: string,
): Promise<{ absolutePath: string; fileName: string; status: AccountFile['status'] } | null> {
  const [row] = await db
    .select({
      fileName: accountFiles.fileName,
      storagePath: accountFiles.storagePath,
      status: accountFiles.status,
    })
    .from(accountFiles)
    .where(eq(accountFiles.id, id));
  if (!row) return null;
  return {
    absolutePath: join(accountUploadsDir, row.storagePath),
    fileName: row.fileName,
    status: row.status as AccountFile['status'],
  };
}

// Real deletion (docs/product-overview.md, "keep prepared documents/folders
// in a personal account and manage their deletion") — original plus any
// converted cache, then the record itself. `accountId` is the authenticated
// caller (server/routes.ts's requireSession) — scoping the delete to it
// prevents one account from deleting another's file by guessing an id; cheap
// to enforce here since, unlike the QR/session-key routes, we actually know
// who's asking.
async function deleteFileDiskArtifacts(fileName: string, storagePath: string): Promise<void> {
  const absolutePath = join(accountUploadsDir, storagePath);
  await unlink(absolutePath).catch(() => {});
  const convertedPath = getConvertedPath(absolutePath, fileName);
  if (convertedPath) await unlink(convertedPath).catch(() => {});
}

export async function deleteFile(accountId: string, id: string): Promise<void> {
  const [row] = await db
    .select({
      fileName: accountFiles.fileName,
      storagePath: accountFiles.storagePath,
    })
    .from(accountFiles)
    .where(and(eq(accountFiles.id, id), eq(accountFiles.accountId, accountId)));
  if (!row) return;
  await deleteFileDiskArtifacts(row.fileName, row.storagePath);
  await db.delete(accountFiles).where(eq(accountFiles.id, id));
}

// Retention/TTL sweep (docs/personal-account-requirements.md, "Open items";
// server/accountFileLimits.ts's ACCOUNT_FILE_RETENTION_DAYS) — a separate
// sweep from server/sessionLifecycle.ts's, which only ever walks the
// session-scoped uploadsDir. Wired into the same periodic interval as that
// one (server/index.ts), just with its own retention window.
export async function sweepExpiredAccountFiles(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const staleFiles = await db
    .select({
      id: accountFiles.id,
      fileName: accountFiles.fileName,
      storagePath: accountFiles.storagePath,
    })
    .from(accountFiles)
    .where(lt(accountFiles.createdAt, cutoff));

  for (const file of staleFiles) {
    await deleteFileDiskArtifacts(file.fileName, file.storagePath);
    await db.delete(accountFiles).where(eq(accountFiles.id, file.id));
  }
  return staleFiles.length;
}

export async function addFolder(accountId: string, name: string): Promise<AccountFolder> {
  const [row] = await db
    .insert(accountFolders)
    .values({ accountId, name })
    .returning({ id: accountFolders.id, name: accountFolders.name });
  return row;
}

export async function listFolders(accountId: string): Promise<AccountFolder[]> {
  return db
    .select({ id: accountFolders.id, name: accountFolders.name })
    .from(accountFolders)
    .where(eq(accountFolders.accountId, accountId))
    .orderBy(accountFolders.createdAt);
}

export async function renameFolder(accountId: string, id: string, name: string): Promise<void> {
  await db
    .update(accountFolders)
    .set({ name })
    .where(and(eq(accountFolders.id, id), eq(accountFolders.accountId, accountId)));
}

// Files inside move back to root (folderId null), never deleted — file
// deletion is always its own explicit action, never implied by a folder
// deletion.
export async function deleteFolder(accountId: string, id: string): Promise<void> {
  await db
    .update(accountFiles)
    .set({ folderId: null })
    .where(and(eq(accountFiles.folderId, id), eq(accountFiles.accountId, accountId)));
  await db
    .delete(accountFolders)
    .where(and(eq(accountFolders.id, id), eq(accountFolders.accountId, accountId)));
}
