import type { PrintTaskErrorReason } from './printTaskStore.js';

// Printer health, as the pavilion print agent reads it (agent/printerStatusSource.ts)
// and reports it to the cloud (server/agentRoutes.ts). Pure data + decoding
// only — no database, no network — so both sides import it.

export type PrinterState = 'idle' | 'printing' | 'warmup' | 'other' | 'unknown' | 'unreachable';

export type PrinterProblem =
  | 'low-paper'
  | 'no-paper'
  | 'low-toner'
  | 'no-toner'
  | 'door-open'
  | 'jammed'
  | 'offline'
  | 'service-requested'
  | 'input-tray-missing'
  | 'output-tray-missing'
  | 'marker-supply-missing'
  | 'output-near-full'
  | 'output-full'
  | 'input-tray-empty'
  | 'overdue-maintenance'
  | 'unreachable';

export interface PrinterSupply {
  name: string;
  /** 0–100, or null when the printer only says "some remaining". */
  levelPercent: number | null;
}

export interface PrinterSnapshot {
  state: PrinterState;
  problems: PrinterProblem[];
  supplies: PrinterSupply[];
  checkedAt: string;
}

// hrPrinterDetectedErrorState (HOST-RESOURCES-MIB, RFC 2790 / RFC 3805):
// an OCTET STRING bitmask, most significant bit of the first byte first.
const ERROR_STATE_BITS: [byte: number, mask: number, problem: PrinterProblem][] = [
  [0, 0x80, 'low-paper'],
  [0, 0x40, 'no-paper'],
  [0, 0x20, 'low-toner'],
  [0, 0x10, 'no-toner'],
  [0, 0x08, 'door-open'],
  [0, 0x04, 'jammed'],
  [0, 0x02, 'offline'],
  [0, 0x01, 'service-requested'],
  [1, 0x80, 'input-tray-missing'],
  [1, 0x40, 'output-tray-missing'],
  [1, 0x20, 'marker-supply-missing'],
  [1, 0x10, 'output-near-full'],
  [1, 0x08, 'output-full'],
  [1, 0x04, 'input-tray-empty'],
  [1, 0x02, 'overdue-maintenance'],
];

export function decodeDetectedErrorState(bytes: Uint8Array): PrinterProblem[] {
  return ERROR_STATE_BITS.filter(([byte, mask]) => ((bytes[byte] ?? 0) & mask) !== 0).map(
    ([, , problem]) => problem,
  );
}

// hrPrinterStatus: 1 other, 2 unknown, 3 idle, 4 printing, 5 warmup.
export function decodePrinterStatus(value: number): PrinterState {
  return (
    ({ 1: 'other', 2: 'unknown', 3: 'idle', 4: 'printing', 5: 'warmup' } as const)[
      value as 1 | 2 | 3 | 4 | 5
    ] ?? 'unknown'
  );
}

// Problems that stop a job from coming out. The "low"/"near full"/maintenance
// warnings don't — they're for staff, not a reason to refuse or fail a job.
const BLOCKING: PrinterProblem[] = [
  'no-paper',
  'no-toner',
  'door-open',
  'jammed',
  'offline',
  'service-requested',
  'input-tray-missing',
  'output-tray-missing',
  'marker-supply-missing',
  'output-full',
  'input-tray-empty',
  'unreachable',
];

export function blockingProblems(problems: PrinterProblem[]): PrinterProblem[] {
  return problems.filter((problem) => BLOCKING.includes(problem));
}

/** The print-task failure reason a blocking problem maps to — the kiosk's
 * existing customer messages (PrintStatusScreen.tsx) plus a generic
 * 'printer-error' for everything a customer can't be told more usefully. */
export function failureReasonFor(problem: PrinterProblem): PrintTaskErrorReason {
  switch (problem) {
    case 'jammed':
      return 'paper-jam';
    case 'no-paper':
    case 'input-tray-empty':
    case 'input-tray-missing':
      return 'out-of-paper';
    case 'no-toner':
    case 'marker-supply-missing':
      return 'out-of-ink';
    default:
      return 'printer-error';
  }
}
