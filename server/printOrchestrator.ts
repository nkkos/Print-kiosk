import { getUploadedFile } from './uploadStore.js';
import { getAccountFile } from './accountFileStore.js';
import { getConvertedPath, resolvePrintablePath } from './documentConverter.js';
import { submitPrintJob, PrintSubmitError, PLACEHOLDER_PDF_PATH } from './printerAdapter.js';
import { reserveBin } from './pickupBins.js';
import {
  updatePrintTaskStatus,
  assignPrintTaskBin,
  getPrintTask,
  getPrintTaskOptions,
  type PrintTask,
  type PrintOptions,
} from './printTaskStore.js';

// Pavilion launch plan (2026-09-16): pulled the "actually submit this job"
// logic out of server/routes.ts's POST /api/print-tasks handler so it can
// be re-invoked later, on a completely different HTTP request, once a
// pickup bin frees up — see tryPrintTask's own comment.

/** Attempts to actually print `taskId` — reserves a pickup bin first
 * (server/pickupBins.ts); if all `BIN_COUNT` are occupied, leaves the task
 * exactly as it was ('queued', no bin) instead of failing it, so a later
 * retry can pick it up once space opens. Idempotent: a no-op if the task
 * already has a bin or has reached a terminal status, which is what lets
 * GET /api/print-tasks/:id's own poll double as the retry driver — no
 * separate background timer needed, since the kiosk is already polling
 * every task at a few seconds' interval regardless. */
export async function tryPrintTask(
  taskId: string,
  sessionId: string | null,
): Promise<PrintTask | null> {
  const current = await getPrintTask(taskId);
  if (!current || current.status !== 'queued' || current.binNumber != null) {
    return current;
  }

  const bin = await reserveBin(sessionId);
  if (bin == null) return current; // still waiting for a free bin — retried on the next poll

  await assignPrintTaskBin(taskId, bin);
  const options = await getPrintTaskOptions(taskId);

  const filePath = await resolveFilePath(taskId, options);
  if (filePath === 'conversion-failed') {
    return getPrintTask(taskId);
  }

  try {
    await submitPrintJob(filePath, {
      copies: options.copies,
      paperSize: options.paperSize,
      side:
        options.sides === 'double' ? 'duplex' : options.sides === 'single' ? 'simplex' : undefined,
      monochrome: options.color === 'bw' ? true : options.color === 'color' ? false : undefined,
      orientation: options.orientation,
      scale: options.scale === 'fit' ? 'fit' : options.scale === 'original' ? 'noscale' : undefined,
      pages: options.pages,
    });
    await updatePrintTaskStatus(taskId, 'printing');
  } catch (err) {
    const reason = err instanceof PrintSubmitError ? err.reason : 'submit-failed';
    await updatePrintTaskStatus(taskId, 'failed', reason);
  }

  return getPrintTask(taskId);
}

// Only prints the real file when it's actually resolvable and scanned
// 'ready' — otherwise falls back to the placeholder (printerAdapter.ts),
// same as when no fileId was given at all. `sourceFileOrigin: 'account'`
// resolves against Personal Account's real "My files"
// (accountFileStore.ts); anything else (the default) resolves against
// QR/Email's session-scoped uploads (uploadStore.ts). Formats
// pdf-to-printer can't handle directly are converted at upload time
// already — this just checks whether that conversion actually left a
// usable cached file. If it was expected but didn't happen (conversion
// failed, e.g. a password-protected file), that's a real failure worth
// surfacing, not silently printing a placeholder instead — signalled by
// the 'conversion-failed' sentinel return, having already marked the task
// failed itself.
async function resolveFilePath(
  taskId: string,
  options: PrintOptions,
): Promise<string | 'conversion-failed'> {
  if (!options.fileId) return PLACEHOLDER_PDF_PATH;

  const file =
    options.sourceFileOrigin === 'account'
      ? await getAccountFile(options.fileId)
      : await getUploadedFile(options.fileId);
  if (!file || file.status !== 'ready') return PLACEHOLDER_PDF_PATH;

  const resolvedPath = resolvePrintablePath(file.absolutePath, file.fileName);
  if (resolvedPath) return resolvedPath;
  if (getConvertedPath(file.absolutePath, file.fileName)) {
    await updatePrintTaskStatus(taskId, 'failed', 'conversion-failed');
    return 'conversion-failed';
  }
  return PLACEHOLDER_PDF_PATH;
}
