// Talks to the real print-task backend (server/printerAdapter.ts,
// server/printTaskStore.ts) — see docs/domain/kiosk-session.md, "Related
// entities" (Print Task).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export type PrintTaskStatus = 'queued' | 'printing' | 'succeeded' | 'failed';
export type PrintTaskErrorReason =
  | 'printer-not-found'
  | 'submit-failed'
  | 'paper-jam'
  | 'out-of-paper'
  | 'out-of-ink'
  | 'conversion-failed'
  | 'submit-timeout'
  | 'printer-error';

export interface PrintTask {
  id: string;
  status: PrintTaskStatus;
  errorReason: PrintTaskErrorReason | null;
  // Pavilion launch plan (2026-09-16): the two stands share one printer
  // feeding a 4-bin Brother MX-4000 mailbox (server/pickupBins.ts). Null
  // while still waiting for a free bin — see PrintStatusScreen.tsx for how
  // that's shown differently from "printing."
  binNumber: number | null;
  pickedUpAt: string | null;
}

export interface SubmitPrintJobRequest {
  sessionId: string | null;
  /** Which kiosk stand sent the job (src/utils/standId.ts). */
  standId?: string | null;
  /** The real backing file's id to print — omitted or unresolvable falls
   * back to a placeholder document (server/printerAdapter.ts). */
  fileId?: string;
  /** Which store `fileId` resolves against (server/routes.ts) — absent or
   * `'upload'` = QR/Email's `uploadedFiles`; `'account'` = Personal
   * Account's real `accountFiles`. */
  sourceFileOrigin?: 'upload' | 'account';
  /** The portal order (server/accountOrderStore.ts) this print job
   * fulfills, if any — lets a real or simulated success drive that order's
   * 'paid' -> 'issued' transition (docs/personal-account-requirements.md,
   * "Order status lifecycle"). Omitted for QR/Email/unpaid My-files jobs. */
  printOrderId?: string;
  paperSize?: 'A4' | 'A5';
  sides?: 'single' | 'double';
  color?: 'bw' | 'color';
  orientation?: 'portrait' | 'landscape';
  scale?: 'fit' | 'original';
  pages?: string;
  /** Pages per printed sheet side (src/utils/nUpLayout.ts) — the cloud
   * builds the imposed PDF (server/nUpImposer.ts). Absent/1 = one per sheet. */
  pagesPerSheet?: number;
  copies?: number;
}

export async function submitPrintJob(request: SubmitPrintJobRequest): Promise<PrintTask> {
  const response = await fetch(`${API_BASE_URL}/api/print-tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return response.json();
}

export async function getPrintTask(id: string): Promise<PrintTask> {
  const response = await fetch(`${API_BASE_URL}/api/print-tasks/${id}`);
  return response.json();
}

/** Confirms the customer took their printout from its assigned bin,
 * freeing it for the next waiting task (server/pickupBins.ts) — no sensor
 * exists on the real hardware to detect this automatically. */
export async function markPrintTaskPickedUp(id: string): Promise<PrintTask> {
  const response = await fetch(`${API_BASE_URL}/api/print-tasks/${id}/picked-up`, {
    method: 'POST',
  });
  return response.json();
}

export async function simulatePrintOutcome(
  id: string,
  outcome: 'success' | 'paper-jam' | 'out-of-paper' | 'out-of-ink',
): Promise<PrintTask> {
  const response = await fetch(`${API_BASE_URL}/api/print-tasks/${id}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome }),
  });
  return response.json();
}
