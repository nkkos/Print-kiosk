import { extname } from 'node:path';
import { getUploadedFile } from './uploadStore.js';
import { getAccountFile } from './accountFileStore.js';
import { getConvertedPath, resolvePrintablePath } from './documentConverter.js';
import {
  submitPrintJob,
  PrintSubmitError,
  PLACEHOLDER_PDF_PATH,
  printerNameForBin,
  submitOptionsFromPrintOptions,
} from './printerAdapter.js';
import { reserveBin } from './pickupBins.js';
import { imposeNUp } from './nUpImposer.js';
import { isPagesPerSheet } from '../src/utils/nUpLayout.js';
import {
  updatePrintTaskStatus,
  assignPrintTaskBin,
  releasePrintTaskBin,
  getPrintTask,
  getPrintTaskOptions,
  type PrintTask,
  type PrintOptions,
} from './printTaskStore.js';

// Pavilion launch plan (2026-09-16): pulled the "actually submit this job"
// logic out of server/routes.ts's POST /api/print-tasks handler so it can
// be re-invoked later, on a completely different HTTP request, once a
// pickup bin frees up — see tryPrintTask's own comment.

export type PrintExecutionMode = 'direct' | 'agent';

/** Where jobs actually get printed (docs/pavilion-launch-checklist.md,
 * "Target architecture"). 'direct' — this backend prints to a printer
 * attached to its own machine (local development, the original setup).
 * 'agent' — the cloud deployment: this backend only reserves the bin and
 * leaves the task for the pavilion's print agent (agent/, via
 * server/agentRoutes.ts), since a cloud server has no printer. */
export function printExecutionMode(): PrintExecutionMode {
  return process.env.PRINT_EXECUTION === 'agent' ? 'agent' : 'direct';
}

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

  const options = await getPrintTaskOptions(taskId);

  // Resolve (and conversion-check) the file before reserving a bin — a task
  // that fails here never prints anything, so it has no business holding a
  // bin another customer is waiting for.
  const job = await prepareTaskJob(taskId, options);
  if (job === 'conversion-failed') {
    return getPrintTask(taskId);
  }

  const bin = await reserveBin(sessionId);
  if (bin == null) return current; // still waiting for a free bin — retried on the next poll

  await assignPrintTaskBin(taskId, bin);

  // Agent mode: the task now waits, 'queued' with its bin, until the
  // pavilion agent claims it (server/agentRoutes.ts).
  if (printExecutionMode() === 'agent') return getPrintTask(taskId);

  // Undefined (no per-bin queues configured) → the Windows default printer.
  const printerName = printerNameForBin(bin);
  try {
    await submitPrintJob(job.filePath, {
      ...submitOptionsFromPrintOptions(job.options),
      printerName,
    });
    await updatePrintTaskStatus(taskId, 'printing', undefined, printerName);
  } catch (err) {
    const reason = err instanceof PrintSubmitError ? err.reason : 'submit-failed';
    // The spooler refused the job outright, so nothing can land in the bin —
    // free it. A timeout is different: SumatraPDF may still hand the job over
    // late, so that bin stays reserved until staff release it.
    if (reason !== 'submit-timeout') await releasePrintTaskBin(taskId);
    await updatePrintTaskStatus(taskId, 'failed', reason, printerName);
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
async function prepareTaskJob(
  taskId: string,
  options: PrintOptions,
): Promise<PreparedPrintJob | 'conversion-failed'> {
  const job = await preparePrintJob(options);
  if (job === 'conversion-failed') {
    await updatePrintTaskStatus(taskId, 'failed', 'conversion-failed');
  }
  return job;
}

export interface PreparedPrintJob {
  filePath: string;
  /** The options to print `filePath` with — the task's own, except after
   * pages-per-sheet imposition, where the page range is already applied
   * and each sheet prints 1:1 in the sheet's orientation. */
  options: PrintOptions;
}

/** What a task actually prints, without touching the task itself — used by
 * direct mode above and by server/agentRoutes.ts (the claim's options and
 * the file served to the pavilion agent). Several pages per sheet are
 * imposed here into a new PDF (server/nUpImposer.ts); a PDF that can't be
 * imposed is a conversion failure, not a silent 1-per-sheet print the
 * customer didn't pay for. */
export async function preparePrintJob(
  options: PrintOptions,
): Promise<PreparedPrintJob | 'conversion-failed'> {
  const filePath = await resolvePrintableFile(options);
  if (filePath === 'conversion-failed') return filePath;
  const pagesPerSheet = isPagesPerSheet(options.pagesPerSheet) ? options.pagesPerSheet : 1;
  if (pagesPerSheet === 1 || extname(filePath).toLowerCase() !== '.pdf') {
    return { filePath, options };
  }
  try {
    const imposed = await imposeNUp(filePath, pagesPerSheet, options.paperSize, options.pages);
    return {
      filePath: imposed.path,
      options: {
        ...options,
        pages: undefined,
        pagesPerSheet: 1,
        scale: 'original',
        orientation: imposed.orientation,
      },
    };
  } catch (err) {
    console.error('[printOrchestrator] pages-per-sheet imposition failed:', err);
    return 'conversion-failed';
  }
}

async function resolvePrintableFile(options: PrintOptions): Promise<string | 'conversion-failed'> {
  if (!options.fileId) return PLACEHOLDER_PDF_PATH;

  const file =
    options.sourceFileOrigin === 'account'
      ? await getAccountFile(options.fileId)
      : await getUploadedFile(options.fileId);
  if (!file || file.status !== 'ready') return PLACEHOLDER_PDF_PATH;

  const resolvedPath = resolvePrintablePath(file.absolutePath, file.fileName);
  if (resolvedPath) return resolvedPath;
  if (getConvertedPath(file.absolutePath, file.fileName)) return 'conversion-failed';
  return PLACEHOLDER_PDF_PATH;
}
