import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Named imports from this package fail under Node's ESM loader (its CJS
// bundle isn't statically analyzable for named exports) — import the
// default (the whole `module.exports` object) and destructure instead.
import pdfToPrinter from 'pdf-to-printer';
import { runExclusive } from './printQueue.js';
const { print, getDefaultPrinter } = pdfToPrinter;

// Thin wrapper around the actual printer-talking library (server/db/migrations
// aside, this is the one module a future commercial-kiosk-printer swap would
// replace — everything else in the print-task pipeline stays). Only
// job-submission is real; a plain OS print API gives no reliable in-progress
// signal (jam, out of paper/ink), so those stay manual "Simulate ..."
// outcomes — see docs/domain/kiosk-session.md, "Related entities" (Print Task).

// Content doesn't matter — this phase exercises the print-submission
// pipeline and its exception handling, not the (still fully mocked) real
// Cart/file pipeline.
export const PLACEHOLDER_PDF_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'assets',
  'print-test-page.pdf',
);

export type SubmitFailureReason = 'printer-not-found' | 'submit-failed' | 'submit-timeout';

// Confirmed reproducible against a real, unreachable default printer
// (docs/equipment-monitoring-requirements.md, Section B —
// `printer.submit-timeout`): pdf-to-printer's print() has no timeout hook of
// its own (see the comment on submitPrintJob below), so a printer that never
// responds hangs this call forever. Racing it against this timeout is the
// only way to turn that into a diagnosable failure instead of a silently
// stuck print task — and, just as importantly, to let runExclusive's queue
// (server/printQueue.ts) advance to the next job at all, since it waits for
// each task to settle before starting the next one.
const PRINT_SUBMIT_TIMEOUT_MS = 25000;

export class PrintSubmitError extends Error {
  reason: SubmitFailureReason;

  constructor(reason: SubmitFailureReason) {
    super(reason);
    this.reason = reason;
  }
}

export async function getDefaultPrinterName(): Promise<string | null> {
  const printer = await getDefaultPrinter();
  return printer?.name ?? null;
}

export interface SubmitPrintJobOptions {
  printerName?: string;
  copies?: number;
  paperSize?: string;
  side?: 'simplex' | 'duplex';
  monochrome?: boolean;
  orientation?: 'portrait' | 'landscape';
  scale?: 'noscale' | 'shrink' | 'fit';
  pages?: string;
}

export async function submitPrintJob(
  filePath: string,
  options: SubmitPrintJobOptions = {},
): Promise<void> {
  const resolvedPrinter = options.printerName ?? (await getDefaultPrinterName());
  if (!resolvedPrinter) {
    throw new PrintSubmitError('printer-not-found');
  }
  // Open item, found while testing this queue: unlike libreoffice-convert
  // (server/documentConverter.ts), pdf-to-printer's print() takes no
  // execFile options at all — no timeout/kill hook is exposed, so a hung
  // SumatraPDF invocation (confirmed reproducible against a printer that
  // shows its own blocking dialog, e.g. "Microsoft Print to PDF") hangs this
  // call forever with nothing we can do about it from here. Not fixed here
  // — would mean reimplementing the library's argument-building instead of
  // just calling it.
  try {
    await runExclusive(() =>
      Promise.race([
        print(filePath, {
          printer: resolvedPrinter,
          copies: options.copies,
          paperSize: options.paperSize,
          side: options.side,
          monochrome: options.monochrome,
          orientation: options.orientation,
          scale: options.scale,
          pages: options.pages,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new PrintSubmitError('submit-timeout')), PRINT_SUBMIT_TIMEOUT_MS);
        }),
      ]),
    );
  } catch (err) {
    if (err instanceof PrintSubmitError) throw err;
    throw new PrintSubmitError('submit-failed');
  }
}
