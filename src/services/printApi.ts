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
  | 'conversion-failed';

export interface PrintTask {
  id: string;
  status: PrintTaskStatus;
  errorReason: PrintTaskErrorReason | null;
}

export interface SubmitPrintJobRequest {
  sessionId: string | null;
  /** The real backing file's id to print — omitted or unresolvable falls
   * back to a placeholder document (server/printerAdapter.ts). */
  fileId?: string;
  /** Which store `fileId` resolves against (server/routes.ts) — absent or
   * `'upload'` = QR/Email's `uploadedFiles`; `'account'` = Personal
   * Account's real `accountFiles`. */
  sourceFileOrigin?: 'upload' | 'account';
  paperSize?: 'A4' | 'A5';
  sides?: 'single' | 'double';
  color?: 'bw' | 'color';
  orientation?: 'portrait' | 'landscape';
  scale?: 'fit' | 'original';
  pages?: string;
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
