import { unlink } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { accountFiles, accountFolders } from './db/schema.js';
import { scanAndConvert } from './fileScanning.js';
import { getConvertedPath } from './documentConverter.js';

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

export async function addFile(
  accountId: string,
  fileName: string,
  filePath: string,
  folderId?: string,
): Promise<AccountFile> {
  const [row] = await db
    .insert(accountFiles)
    .values({
      accountId,
      folderId: folderId ?? null,
      fileName,
      storagePath: relative(accountUploadsDir, filePath),
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
export async function deleteFile(accountId: string, id: string): Promise<void> {
  const [row] = await db
    .select({
      fileName: accountFiles.fileName,
      storagePath: accountFiles.storagePath,
    })
    .from(accountFiles)
    .where(and(eq(accountFiles.id, id), eq(accountFiles.accountId, accountId)));
  if (!row) return;
  const absolutePath = join(accountUploadsDir, row.storagePath);
  await unlink(absolutePath).catch(() => {});
  const convertedPath = getConvertedPath(absolutePath, row.fileName);
  if (convertedPath) await unlink(convertedPath).catch(() => {});
  await db.delete(accountFiles).where(eq(accountFiles.id, id));
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
