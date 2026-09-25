import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Named imports from this package fail under Node's ESM loader (its CJS
// bundle isn't statically analyzable for named exports) — import the
// default (the whole `module.exports` object) and destructure instead.
import pdfToPrinter from 'pdf-to-printer';
import { runExclusive } from './printQueue.js';
import type { PrintOptions } from './printTaskStore.js';
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

// Brother HL-L9430CDN + MX-4000 mailbox (pavilion hardware). The MX bin is
// a Brother-private driver setting (OutputBin MailBox1..4 in BRPRC19A.DSI,
// exposed to Windows only as the PrintTicket feature JobOutputBin) — not a
// DEVMODE field SumatraPDF can set, so pdf-to-printer's `bin` can't reach
// it. Instead each bin gets its own Windows print queue on the same port,
// with that queue's Printing Defaults pinned to "MX bin N"; picking the
// queue picks the bin. Unset (dev, home printer) → the default printer for
// every bin, same as before this existed.
export function printerNameForBin(bin: number | null): string | undefined {
  if (bin == null) return undefined;
  return process.env[`PRINTER_QUEUE_BIN_${bin}`] || undefined;
}

// Input tray per paper size — pdf-to-printer's `bin` IS the input source
// (DEVMODE dmDefaultSource), matched by name or number against the
// driver's bin list. Brother's codes: Tray1=1, Tray2 (LT-330CL)=2,
// MPTray=258, AutoSelect=7. Unset → the driver's own auto-select by size.
function inputTrayForPaperSize(paperSize: string | undefined): string | undefined {
  if (!paperSize) return undefined;
  return process.env[`PRINTER_TRAY_${paperSize.toUpperCase()}`] || undefined;
}

// HL-L9430CDN's automatic duplex only handles A4/Letter/Legal/Folio (Brother
// spec, PaperSize_UnitDuplex in the driver) — A5 would silently fall back to
// the driver's *manual* duplex, which needs a person to re-feed the sheets.
// The kiosk/portal UIs and order validation already refuse A5 double-sided;
// this is the last line of defence for anything that still arrives here.
export function supportsDuplex(paperSize: string | undefined): boolean {
  return paperSize === undefined || paperSize === 'A4';
}

export interface SubmitPrintJobOptions {
  printerName?: string;
  copies?: number;
  // Input tray — see inputTrayForPaperSize. Explicit value wins over the
  // PRINTER_TRAY_<SIZE> mapping.
  inputTray?: string;
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
  // Long-edge binding for portrait, short-edge for landscape — plain
  // 'duplex' leaves the flip edge to the driver default, which turns every
  // other landscape page upside down.
  const side =
    options.side === 'duplex' && supportsDuplex(options.paperSize)
      ? options.orientation === 'landscape'
        ? 'duplexshort'
        : 'duplexlong'
      : options.side === 'duplex'
        ? 'simplex'
        : options.side;
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
          bin: options.inputTray ?? inputTrayForPaperSize(options.paperSize),
          side,
          monochrome: options.monochrome,
          // Orientation deliberately NOT passed: SumatraPDF's `portrait`/
          // `landscape` rotate the page's *content* (a portrait page forced
          // landscape comes out shrunk onto half the sheet). Left alone, it
          // auto-rotates each page that's wider than tall onto the sheet —
          // right for every page, mixed documents included. `orientation`
          // still picks the duplex flip edge above.
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

/** Maps a task's stored options (the kiosk/portal vocabulary) onto
 * submitPrintJob's — shared by direct mode (server/printOrchestrator.ts)
 * and the pavilion print agent (agent/), so both print identically. */
export function submitOptionsFromPrintOptions(options: PrintOptions): SubmitPrintJobOptions {
  return {
    copies: options.copies,
    paperSize: options.paperSize,
    side:
      options.sides === 'double' ? 'duplex' : options.sides === 'single' ? 'simplex' : undefined,
    monochrome: options.color === 'bw' ? true : options.color === 'color' ? false : undefined,
    orientation: options.orientation,
    scale: options.scale === 'fit' ? 'fit' : options.scale === 'original' ? 'noscale' : undefined,
    pages: options.pages,
  };
}
