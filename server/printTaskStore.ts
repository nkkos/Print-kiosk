import { desc, eq, sql } from 'drizzle-orm';
import { db } from './db/client.js';
import { printTasks } from './db/schema.js';
import type { SubmitFailureReason } from './printerAdapter.js';
import { markOrderIssued } from './accountOrderStore.js';
import { reportIncident } from './incidentStore.js';

// Real, DB-backed store for Print Tasks — see server/routes.ts and
// docs/domain/kiosk-session.md, "Related entities" (Print Task).

export type PrintTaskStatus = 'queued' | 'printing' | 'succeeded' | 'failed';
export type PrintTaskErrorReason =
  | SubmitFailureReason
  | 'paper-jam'
  | 'out-of-paper'
  | 'out-of-ink'
  | 'conversion-failed'
  // Any other problem that stops the printer (door open, output bin full,
  // offline, unreachable) — see server/printerStatus.ts's failureReasonFor.
  | 'printer-error';

// The original submission's file/print options — see schema.ts's
// printOptions column comment for why this needs to be persisted at all
// (a task that has to wait for a free bin gets retried from
// server/printOrchestrator.ts's tryPrintTask on a later, unrelated HTTP
// request, long after the original request's own closure is gone).
export interface PrintOptions {
  fileId?: string;
  sourceFileOrigin?: 'upload' | 'account';
  paperSize?: string;
  sides?: 'single' | 'double';
  color?: 'bw' | 'color';
  orientation?: 'portrait' | 'landscape';
  scale?: 'fit' | 'original';
  pages?: string;
  /** Pages per printed sheet side — see server/nUpImposer.ts. */
  pagesPerSheet?: number;
  copies?: number;
}

export interface PrintTask {
  id: string;
  status: PrintTaskStatus;
  errorReason: PrintTaskErrorReason | null;
  // Pavilion pickup mailbox (server/pickupBins.ts) — null while still
  // waiting for a free bin (see that module's own comment) or, before that
  // feature existed, for any task created before it shipped.
  binNumber: number | null;
  pickedUpAt: Date | null;
}

const selectColumns = {
  id: printTasks.id,
  status: printTasks.status,
  errorReason: printTasks.errorReason,
  binNumber: printTasks.binNumber,
  pickedUpAt: printTasks.pickedUpAt,
};

export async function createPrintTask(
  sessionId: string | null,
  printOrderId: string | undefined,
  options: PrintOptions,
  standId: string | null = null,
): Promise<PrintTask> {
  const [row] = await db
    .insert(printTasks)
    .values({
      sessionId,
      printOrderId: printOrderId ?? null,
      printOptions: JSON.stringify(options),
      standId,
    })
    .returning(selectColumns);
  return row as PrintTask;
}

/** The options a task was originally submitted with — read back by
 * tryPrintTask on a retry, since the HTTP request that first created the
 * task is long gone by the time a bin frees up. Returns an empty object
 * for a task with none stored (shouldn't happen for anything created after
 * this feature shipped, but stays a harmless no-op rather than a crash for
 * anything already in the database beforehand). */
export async function getPrintTaskOptions(id: string): Promise<PrintOptions> {
  const [row] = await db
    .select({ printOptions: printTasks.printOptions })
    .from(printTasks)
    .where(eq(printTasks.id, id));
  if (!row?.printOptions) return {};
  try {
    return JSON.parse(row.printOptions) as PrintOptions;
  } catch {
    return {};
  }
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
  'printer-error': 'printer.error',
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

export interface PrintTaskAdminRow {
  id: string;
  sessionId: string | null;
  standId: string | null;
  status: PrintTaskStatus;
  errorReason: PrintTaskErrorReason | null;
  printerName: string | null;
  binNumber: number | null;
  pickedUpAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Feeds the admin panel's Print Queue screen (server/adminRoutes.ts) — the
 * only place any of this is visible to staff, since the kiosk client only
 * ever sees its own tasks by id. Most recent first, so a stuck/zombie
 * task (one that's held a bin without ever being confirmed picked up —
 * see server/pickupBins.ts's own comment on why that can happen) is easy
 * to spot without paging through the whole history. */
export async function listRecentPrintTasks(limit = 200): Promise<PrintTaskAdminRow[]> {
  return db
    .select({
      id: printTasks.id,
      sessionId: printTasks.sessionId,
      standId: printTasks.standId,
      status: printTasks.status,
      errorReason: printTasks.errorReason,
      printerName: printTasks.printerName,
      binNumber: printTasks.binNumber,
      pickedUpAt: printTasks.pickedUpAt,
      createdAt: printTasks.createdAt,
      updatedAt: printTasks.updatedAt,
    })
    .from(printTasks)
    .orderBy(desc(printTasks.createdAt))
    .limit(limit) as Promise<PrintTaskAdminRow[]>;
}

/** Records which pickup bin a task's output will land in — called once
 * server/pickupBins.ts's reserveBin() finds one free, immediately before
 * the job is actually submitted to the printer (server/routes.ts). */
export async function assignPrintTaskBin(id: string, binNumber: number): Promise<void> {
  await db
    .update(printTasks)
    .set({ binNumber, updatedAt: new Date() })
    .where(eq(printTasks.id, id));
}

/** Un-assigns a bin from a task that failed before anything could print
 * into it (server/printOrchestrator.ts) — unlike markPrintTaskPickedUp,
 * there's nothing physical to collect, so the bin just goes back to the
 * pool. */
export async function releasePrintTaskBin(id: string): Promise<void> {
  await db
    .update(printTasks)
    .set({ binNumber: null, updatedAt: new Date() })
    .where(eq(printTasks.id, id));
}

/** Confirms a customer (or staff, on their behalf) actually took their
 * printout, freeing the bin for the next waiting task — see
 * server/pickupBins.ts's own comment on why this is a manual confirmation
 * rather than a sensor: no real hardware exists yet to detect it
 * automatically. */
export async function markPrintTaskPickedUp(id: string): Promise<void> {
  await db
    .update(printTasks)
    .set({ pickedUpAt: new Date(), updatedAt: new Date() })
    .where(eq(printTasks.id, id));
}

// A claim that never reported back (agent crashed or lost its connection
// mid-job) is handed out again after this long — longer than the agent's
// own submit timeout plus a file download, so a slow-but-alive agent never
// has its job double-printed.
export const AGENT_CLAIM_TIMEOUT_MS = 2 * 60 * 1000;

export interface ClaimedPrintTask {
  id: string;
  binNumber: number;
  options: PrintOptions;
}

/** Hands the pavilion print agent the oldest task that's ready to print
 * (bin assigned, still 'queued', not picked up, not already claimed) —
 * atomically, so two agent polls can never claim the same task. */
export async function claimNextPrintTask(): Promise<ClaimedPrintTask | null> {
  const staleBefore = new Date(Date.now() - AGENT_CLAIM_TIMEOUT_MS);
  const result = await db.execute<{
    id: string;
    bin_number: number;
    print_options: string | null;
  }>(sql`
    UPDATE print_tasks SET claimed_at = now(), updated_at = now()
    WHERE id = (
      SELECT id FROM print_tasks
      WHERE status = 'queued'
        AND bin_number IS NOT NULL
        AND picked_up_at IS NULL
        AND (claimed_at IS NULL OR claimed_at < ${staleBefore})
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, bin_number, print_options
  `);
  const row = result.rows[0];
  if (!row) return null;
  let options: PrintOptions = {};
  try {
    options = row.print_options ? (JSON.parse(row.print_options) as PrintOptions) : {};
  } catch {
    // unreadable options — print with defaults, same as getPrintTaskOptions
  }
  return { id: row.id, binNumber: row.bin_number, options };
}

/** Whether `id` is currently claimed by the agent and still in flight —
 * gates the agent's file download and status reports, so a stale or
 * forged task id can't touch a task the agent doesn't hold. */
export async function isClaimedInFlight(id: string): Promise<boolean> {
  const [row] = await db
    .select({ status: printTasks.status, claimedAt: printTasks.claimedAt })
    .from(printTasks)
    .where(eq(printTasks.id, id));
  return !!row?.claimedAt && (row.status === 'queued' || row.status === 'printing');
}
