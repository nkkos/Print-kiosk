import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { db } from './db/client.js';
import { kioskSessions, receivedEmails, uploadedFiles } from './db/schema.js';
import { uploadsDir } from './uploadStore.js';
import { getConvertedPath } from './documentConverter.js';
import { deleteCopySessionsForKioskSessions } from './copyStore.js';

// Owns every write to `kiosk_sessions` across a session's lifecycle — start,
// activity heartbeats, and end (docs/data-privacy-requirements.md,
// docs/domain/kiosk-session.md's "Resource ownership and cleanup contract").
// Deliberately minimal: no 'ending' transient status and no staleness sweep
// for an abandoned 'active' row (crash with no end signal) — both deferred
// until a real consumer (e.g. an operator dashboard) needs them.

// "Orphaned files are deleted automatically after 4 hours" — the TTL
// safety net for a session-end signal that never reached the backend at all
// (crash, connectivity loss).
export const ORPHAN_FILE_TTL_MS = 4 * 60 * 60 * 1000;

// Fired once, when a session is actually created (src/App.tsx's Trigger A/B
// — handlePrintActivate / handleLogin). onConflictDoNothing makes this safe
// against an unlikely double-fire without ever clobbering the real start data.
export async function startSession(
  sessionId: string,
  accountId: string | null,
  startedVia: string | null,
): Promise<void> {
  await db
    .insert(kioskSessions)
    .values({ id: sessionId, accountId, startedVia, status: 'active' })
    .onConflictDoNothing({ target: kioskSessions.id });
}

// Bumps last_activity_at, and sets account_id only when a real one is known
// — never clears an already-recorded account back to null (e.g. after a
// kiosk logout mid-session), since the fact "this session was, at some
// point, this account's" stays useful for analysis. A no-op if the row
// doesn't exist yet (harmless — self-heals on the next call).
export async function touchSessionActivity(
  sessionId: string,
  accountId: string | null,
): Promise<void> {
  await db
    .update(kioskSessions)
    .set({ lastActivityAt: new Date(), ...(accountId ? { accountId } : {}) })
    .where(eq(kioskSessions.id, sessionId));
}

async function deleteUploadedFileRow(file: {
  id: string;
  storagePath: string;
  fileName: string;
}): Promise<void> {
  const absolutePath = join(uploadsDir, file.storagePath);
  await unlink(absolutePath).catch(() => {});
  const convertedPath = getConvertedPath(absolutePath, file.fileName);
  if (convertedPath) await unlink(convertedPath).catch(() => {});
  await db.delete(uploadedFiles).where(eq(uploadedFiles.id, file.id));
}

// `sessionKeys` should cover both forms a session's files might be keyed
// under: the full QR session id and its 8-character email-prefix derivative
// (src/App.tsx generates the email address as `upload-<id.slice(0,8)>@...`).
export async function deleteFilesForSessionKeys(sessionKeys: string[]): Promise<void> {
  const files = await db
    .select({
      id: uploadedFiles.id,
      storagePath: uploadedFiles.storagePath,
      fileName: uploadedFiles.fileName,
    })
    .from(uploadedFiles)
    .where(inArray(uploadedFiles.sessionKey, sessionKeys));

  for (const file of files) {
    await deleteUploadedFileRow(file);
  }

  await db.delete(receivedEmails).where(inArray(receivedEmails.prefix, sessionKeys));
}

// Deletes any uploaded file older than `maxAgeMs`, regardless of session
// state — the fallback for when an explicit end-session signal never
// arrives. Also drops any `received_emails` row that has aged out and no
// longer has any attachment referencing it. Returns the number of files
// deleted, for a log line.
export async function sweepExpiredFiles(maxAgeMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);

  const staleFiles = await db
    .select({
      id: uploadedFiles.id,
      storagePath: uploadedFiles.storagePath,
      fileName: uploadedFiles.fileName,
    })
    .from(uploadedFiles)
    .where(lt(uploadedFiles.createdAt, cutoff));

  for (const file of staleFiles) {
    await deleteUploadedFileRow(file);
  }

  const staleEmails = await db
    .select({ id: receivedEmails.id })
    .from(receivedEmails)
    .where(lt(receivedEmails.createdAt, cutoff));

  for (const email of staleEmails) {
    const [remaining] = await db
      .select({ id: uploadedFiles.id })
      .from(uploadedFiles)
      .where(eq(uploadedFiles.emailId, email.id))
      .limit(1);
    if (!remaining) {
      await db.delete(receivedEmails).where(eq(receivedEmails.id, email.id));
    }
  }

  return staleFiles.length;
}

// Whether the session behind an email address prefix has already ended —
// checked by POST /api/email/incoming so a late-arriving message is
// discarded immediately rather than creating fresh records for a session
// that's already gone. `id::text LIKE '<prefix>%'` is safe because a UUID's
// first 8 characters are always plain hex (the first `-` appears at index 8).
export async function isSessionClosed(prefix: string): Promise<boolean> {
  const [row] = await db
    .select({ id: kioskSessions.id })
    .from(kioskSessions)
    .where(
      and(
        inArray(kioskSessions.status, ['ended', 'cleanup-failed']),
        sql`${kioskSessions.id}::text LIKE ${prefix + '%'}`,
      ),
    )
    .limit(1);
  return !!row;
}

// The synchronous cleanup a session-end signal (button or inactivity
// timeout — src/App.tsx's handleEndSession) triggers. Never throws — a
// cleanup failure is logged for an operator and recorded as
// 'cleanup-failed' on the session row, but the user is never shown anything
// about it (docs/domain/kiosk-session.md, "Privacy guarantee"). Preserves
// the row's original started_at/started_via/last_activity_at from
// startSession()/touchSessionActivity() — only status/endedReason/accountId
// are overwritten here.
export async function endSession(
  sessionId: string,
  reason: 'manual' | 'timeout',
  accountId: string | null,
): Promise<void> {
  let status: 'ended' | 'cleanup-failed' = 'ended';
  try {
    await deleteFilesForSessionKeys([sessionId, sessionId.slice(0, 8)]);
    // Copy sessions (server/copyStore.ts) are session-scoped, unlike Scan's
    // anonymous/24h-retained ones — an abandoned mid-capture attempt should
    // not outlive the Kiosk Session it belongs to.
    await deleteCopySessionsForKioskSessions([sessionId]);
  } catch (err) {
    console.error(`[sessionLifecycle] Cleanup failed for session ${sessionId}:`, err);
    status = 'cleanup-failed';
  }
  await db
    .insert(kioskSessions)
    .values({ id: sessionId, accountId, status, endedReason: reason })
    .onConflictDoUpdate({
      target: kioskSessions.id,
      set: { status, endedReason: reason, accountId },
    });
}

// The "real consumer" this file's own header comment anticipated — the
// admin panel's fix-confirmation dialog (docs/screens/admin-panel-spec.md's
// `equipment-fix-confirm-session-warning`) needs to know whether hitting a
// PC/Display fix action right now would interrupt an actual customer. Since
// there's still no staleness sweep for an abandoned 'active' row (same
// header comment), a session with no activity in the last 10 minutes is
// treated as effectively over even if its status row never got updated —
// otherwise a crashed browser tab could show a false warning forever. 10
// minutes, not the kiosk's own ~6-minute idle-timeout window, as a safety
// margin against this check itself racing that timeout.
const STALE_SESSION_THRESHOLD_MS = 10 * 60 * 1000;

export async function hasActiveKioskSession(): Promise<boolean> {
  const [row] = await db
    .select({ id: kioskSessions.id })
    .from(kioskSessions)
    .where(
      and(
        eq(kioskSessions.status, 'active'),
        gt(kioskSessions.lastActivityAt, new Date(Date.now() - STALE_SESSION_THRESHOLD_MS)),
      ),
    )
    .limit(1);
  return !!row;
}
