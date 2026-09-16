import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { db } from './db/client.js';
import { printTasks } from './db/schema.js';

// Pavilion launch plan (2026-09-16): the two kiosk stands share one printer
// feeding a Brother MX-4000 — a real 4-bin mailbox, confirmed to support
// per-job output-bin selection at the driver level (Brother's own
// documentation), though that's NOT yet verified against our stack
// (pdf-to-printer/SumatraPDF) since no real MX-4000 exists to test against
// yet — see server/printerAdapter.ts's own note once that's wired up. This
// module only tracks bin OCCUPANCY in software; it doesn't yet talk to the
// printer driver about which physical bin a job lands in.
export const BIN_COUNT = 4;

// A bin is "occupied" by any task that's been assigned one and not yet
// confirmed picked up — regardless of whether that task has actually
// finished printing (a task that's 'queued'/'printing' with a bin already
// reserves it, so a second task can't double-book the same bin while the
// first one is still in flight).
async function getOccupiedBinNumbers(): Promise<Set<number>> {
  const rows = await db
    .select({ binNumber: printTasks.binNumber })
    .from(printTasks)
    .where(and(isNotNull(printTasks.binNumber), isNull(printTasks.pickedUpAt)));
  return new Set(rows.map((r) => r.binNumber).filter((n): n is number => n != null));
}

/** A customer's order can produce more than one print task (one per file) —
 * all of them share ONE bin, since the mailbox physically stacks multiple
 * printed sheets in the same tray. Returns the bin already assigned to an
 * earlier, still-uncollected task in the same session, if any. */
async function findExistingSessionBin(sessionId: string | null): Promise<number | null> {
  if (!sessionId) return null;
  const [row] = await db
    .select({ binNumber: printTasks.binNumber })
    .from(printTasks)
    .where(
      and(
        eq(printTasks.sessionId, sessionId),
        isNotNull(printTasks.binNumber),
        isNull(printTasks.pickedUpAt),
      ),
    )
    .limit(1);
  return row?.binNumber ?? null;
}

/** Reserves a bin for `sessionId` — reusing one already assigned to an
 * earlier task in the same session if there is one, otherwise the
 * lowest-numbered free bin. Returns null if all `BIN_COUNT` bins are
 * occupied — the caller must leave the task queued without printing it
 * yet (see server/routes.ts's POST /api/print-tasks) rather than print
 * into a bin nobody can identify as theirs. */
export async function reserveBin(sessionId: string | null): Promise<number | null> {
  const existing = await findExistingSessionBin(sessionId);
  if (existing != null) return existing;

  const occupied = await getOccupiedBinNumbers();
  for (let bin = 1; bin <= BIN_COUNT; bin++) {
    if (!occupied.has(bin)) return bin;
  }
  return null;
}
