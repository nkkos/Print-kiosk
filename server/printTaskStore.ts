import { eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { printTasks } from './db/schema.js';
import type { SubmitFailureReason } from './printerAdapter.js';

// Real, DB-backed store for Print Tasks — see server/routes.ts and
// docs/domain/kiosk-session.md, "Related entities" (Print Task).

export type PrintTaskStatus = 'queued' | 'printing' | 'succeeded' | 'failed';
export type PrintTaskErrorReason =
  SubmitFailureReason | 'paper-jam' | 'out-of-paper' | 'out-of-ink';

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

export async function createPrintTask(sessionId: string | null): Promise<PrintTask> {
  const [row] = await db.insert(printTasks).values({ sessionId }).returning(selectColumns);
  return row as PrintTask;
}

export async function updatePrintTaskStatus(
  id: string,
  status: PrintTaskStatus,
  errorReason?: PrintTaskErrorReason,
  printerName?: string,
): Promise<void> {
  await db
    .update(printTasks)
    .set({ status, errorReason: errorReason ?? null, printerName, updatedAt: new Date() })
    .where(eq(printTasks.id, id));
}

export async function getPrintTask(id: string): Promise<PrintTask | null> {
  const [row] = await db.select(selectColumns).from(printTasks).where(eq(printTasks.id, id));
  return (row as PrintTask) ?? null;
}
