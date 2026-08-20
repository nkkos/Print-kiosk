import { unlink } from 'node:fs/promises';
import NodeClam from 'clamscan';
import { hasPrintableExtension } from './fileValidation.js';
import { convertToPrintable } from './documentConverter.js';
import { reportIncident } from './incidentStore.js';

// Real antivirus scanning + conversion-to-printable, shared by every real
// file store (server/uploadStore.ts for QR/Email — session-scoped; and
// server/accountFileStore.ts for Personal Account's "My files" — permanent).
// Extracted here once there were two real consumers of the identical
// pipeline (docs/domain/kiosk-session.md, "File scanning status").

export type ScanStatus = 'converting' | 'ready' | 'rejected' | 'scan-unavailable';

// Connected lazily and cached only on success, so a scan simply retries the
// connection next time rather than crashing or wedging into a permanently-
// failed state. This matters especially on Railway, where `clamav` and
// `backend` start independently — backend can easily come up before clamd
// is ready to accept connections.
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

// Converts to a printable format right after a clean scan
// (server/documentConverter.ts) — so by the time a file can be selected for
// printing (status 'ready'), printing it later is fast and its real content
// is known to be printable or not. A conversion failure doesn't reject the
// upload itself (the file passed the virus scan and is legitimate) — it's
// remembered implicitly by the cached output file not existing, which
// POST /api/print-tasks (server/routes.ts) checks at print time.
async function convertIfNeeded(
  filePath: string,
  fileName: string,
  onStatusChange: (status: ScanStatus) => Promise<void>,
) {
  if (hasPrintableExtension(fileName)) return;
  await onStatusChange('converting');
  try {
    await convertToPrintable(filePath, fileName);
  } catch (err) {
    console.error(`[fileScanning] Conversion failed for ${filePath}:`, err);
  }
}

// `onStatusChange` is how the caller persists each transition — different
// stores write to different tables, but the scan/convert orchestration
// itself is identical.
export async function scanAndConvert(
  filePath: string,
  fileName: string,
  onStatusChange: (status: ScanStatus) => Promise<void>,
): Promise<void> {
  try {
    const clamscan = await getClamscan();
    const { isInfected } = await clamscan.scanFile(filePath);
    if (isInfected) {
      // Deleted immediately rather than waiting for session end — matches
      // docs/domain/kiosk-session.md's "delete the file content, retain the
      // metadata/fact" cleanup philosophy, just applied right away since
      // there's no reason to keep a flagged file around any longer than
      // necessary. The DB record (fileName + 'rejected') stays, so the user
      // can still see what happened.
      await unlink(filePath).catch(() => {});
      await onStatusChange('rejected');
      return;
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      // Fail closed in production (docs/domain/kiosk-session.md, "File
      // scanning status"): an unscanned file must never reach the user as
      // if it were clean. Deleted immediately, same as a confirmed-infected
      // file, but kept as a distinct status ('scan-unavailable', not
      // 'rejected') — this is "couldn't verify," not "confirmed a threat."
      console.error(`[fileScanning] Scan failed for ${filePath}, failing closed:`, err);
      await unlink(filePath).catch(() => {});
      await onStatusChange('scan-unavailable');
      void reportIncident({
        source: 'backend',
        code: 'backend.clamav-unreachable',
        severity: 'critical',
        message:
          'ClamAV unreachable in production — file rejected (fail-closed), a real upload was blocked.',
        context: { filePath, fileName, error: String(err) },
      });
      return;
    }
    // Dev-only fail-open: if clamd itself is unreachable (e.g. a developer
    // forgot to start it), don't silently block every upload — log clearly
    // and let the file through instead.
    console.error(`[fileScanning] Scan failed for ${filePath}, failing open:`, err);
    void reportIncident({
      source: 'backend',
      code: 'backend.clamav-unreachable',
      severity: 'warning',
      message: 'ClamAV unreachable — scan skipped (dev fail-open).',
      context: { filePath, fileName, error: String(err) },
    });
  }
  await convertIfNeeded(filePath, fileName, onStatusChange);
  await onStatusChange('ready');
}
