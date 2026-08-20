import { eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { printTasks } from './db/schema.js';
import type { SubmitFailureReason } from './printerAdapter.js';
import { markOrderIssued } from './accountOrderStore.js';
import { reportIncident } from './incidentStore.js';

// Real, DB-backed store for Print Tasks — see server/routes.ts and
// docs/domain/kiosk-session.md, "Related entities" (Print Task).

export type PrintTaskStatus = 'queued' | 'printing' | 'succeeded' | 'failed';
export type PrintTaskErrorReason =
  SubmitFailureReason | 'paper-jam' | 'out-of-paper' | 'out-of-ink' | 'conversion-failed';

export interface PrintTask {
  id: string;
  status: PrintTaskStatus;
  errorReason: PrintTaskErrorReason | null;
}

const selectColumns = {
  id: printTasks.id,
  status: printTasks.status,
  errorReason: printTasks.errorReason,
};

export async function createPrintTask(
  sessionId: string | null,
  printOrderId?: string,
): Promise<PrintTask> {
  const [row] = await db
    .insert(printTasks)
    .values({ sessionId, printOrderId: printOrderId ?? null })
    .returning(selectColumns);
  return row as PrintTask;
}

// Drives the order lifecycle's 'paid' -> 'issued' transition
// (docs/personal-account-requirements.md, "Order status lifecycle") whenever
// a task tied to a portal order reaches 'succeeded' — real print success
// (server/routes.ts's POST /api/print-tasks) or the manual `simulate`
// outcome (POST /api/print-tasks/:id/simulate) alike, since both update
// status through this same function.
// Maps a print task's own error vocabulary onto the shared incident `code`
// namespace (docs/equipment-monitoring-requirements.md, Section B).
const PRINTER_INCIDENT_CODE: Record<PrintTaskErrorReason, string> = {
  'printer-not-found': 'printer.offline',
  'submit-failed': 'printer.driver-crash',
  'submit-timeout': 'printer.submit-timeout',
  'paper-jam': 'printer.paper-jam',
  'out-of-paper': 'printer.out-of-paper',
  'out-of-ink': 'printer.out-of-ink',
  'conversion-failed': 'printer.conversion-failed',
};

export async function updatePrintTaskStatus(
  id: string,
  status: PrintTaskStatus,
  errorReason?: PrintTaskErrorReason,
  printerName?: string,
): Promise<void> {
  const [updated] = await db
    .update(printTasks)
    .set({ status, errorReason: errorReason ?? null, printerName, updatedAt: new Date() })
    .where(eq(printTasks.id, id))
    .returning({ printOrderId: printTasks.printOrderId });

  if (status === 'succeeded' && updated?.printOrderId) {
    await markOrderIssued(updated.printOrderId);
  }

  // Every real submission failure (server/printerAdapter.ts) or manually
  // simulated terminal outcome (POST /api/print-tasks/:id/simulate,
  // PrintStatusScreen.tsx) flows through this one function — the single
  // choke point for turning either into a structured incident, rather than
  // hooking both call sites separately.
  if (status === 'failed' && errorReason) {
    void reportIncident({
      source: 'printer',
      code: PRINTER_INCIDENT_CODE[errorReason],
      severity: 'critical',
      message: `Print task ${id} failed: ${errorReason}`,
      context: { printTaskId: id, errorReason, printerName },
    });
  }
}

export async function getPrintTask(id: string): Promise<PrintTask | null> {
  const [row] = await db.select(selectColumns).from(printTasks).where(eq(printTasks.id, id));
  return (row as PrintTask) ?? null;
}
