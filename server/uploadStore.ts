import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import NodeClam from 'clamscan';

// In-memory store for QR-uploaded files, keyed by Kiosk Session id (reused
// directly as the upload token — see server/routes.ts). Dev-only backend:
// no database, nothing survives a server restart — see the plan notes in
// docs/qr-upload-requirements.md.

export interface UploadedFile {
  id: string;
  fileName: string;
  status: 'scanning' | 'ready' | 'rejected';
}

const filesBySession = new Map<string, UploadedFile[]>();

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

function updateStatus(sessionId: string, fileId: string, status: UploadedFile['status']) {
  const current = filesBySession.get(sessionId);
  if (!current) return;
  filesBySession.set(
    sessionId,
    current.map((entry) => (entry.id === fileId ? { ...entry, status } : entry)),
  );
}

async function scanFile(sessionId: string, fileId: string, filePath: string) {
  try {
    const clamscan = await getClamscan();
    const { isInfected } = await clamscan.scanFile(filePath);
    if (isInfected) {
      // Deleted immediately rather than waiting for session end — matches
      // docs/domain/kiosk-session.md's "delete the file content, retain the
      // metadata/fact" cleanup philosophy, just applied right away since
      // there's no reason to keep a flagged file around any longer than
      // necessary. The in-memory record (fileName + 'rejected') stays, so
      // the kiosk can still show the user what happened.
      await unlink(filePath).catch(() => {});
      updateStatus(sessionId, fileId, 'rejected');
    } else {
      updateStatus(sessionId, fileId, 'ready');
    }
  } catch (err) {
    // Dev-only fail-open: if clamd itself is unreachable (e.g. a developer
    // forgot to start it), don't silently block every QR upload — log
    // clearly and let the file through instead. This is explicitly NOT the
    // production answer (docs/domain/kiosk-session.md, "File scanning
    // status") — production should fail closed.
    console.error(`[uploadStore] Scan failed for ${filePath}, failing open:`, err);
    updateStatus(sessionId, fileId, 'ready');
  }
}

export function addFile(sessionId: string, fileName: string, filePath: string): UploadedFile {
  const file: UploadedFile = { id: randomUUID(), fileName, status: 'scanning' };
  const existing = filesBySession.get(sessionId) ?? [];
  filesBySession.set(sessionId, [...existing, file]);

  void scanFile(sessionId, file.id, filePath);

  return file;
}

export function listFiles(sessionId: string): UploadedFile[] {
  return filesBySession.get(sessionId) ?? [];
}
