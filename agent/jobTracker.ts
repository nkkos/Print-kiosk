import {
  blockingProblems,
  failureReasonFor,
  type PrinterProblem,
} from '../server/printerStatus.js';
import type { PrintTaskErrorReason } from '../server/printTaskStore.js';
import type { PrinterStatusSource } from './printerStatusSource.js';
import { listSpoolerJobs, removeSpoolerJob } from './spooler.js';

// Follows one submitted job until the paper is out or it clearly can't be.
// Two phases, because each source only sees part of the journey:
//   1. spooler — the job is still on this PC, waiting or being sent. A
//      problem here is safe to act on: the job is removed from the queue, so
//      nothing prints later behind the customer's back.
//   2. printer — the spooler has handed everything over; only the printer
//      itself (SNMP, agent/printerStatusSource.ts) knows whether it's still
//      printing, done (idle again), or stuck.
// Without a status source, "left the spooler" counts as done.
//
// Timing values are first guesses, to tune during hardware acceptance.
const SPOOLER_POLL_MS = 2_000;
const PRINTER_POLL_MS = 3_000;
// A problem must last this long before the job is failed — rides out
// transient states (a tray being closed, a brief warm-up hiccup).
const PROBLEM_GRACE_MS = Number(process.env.AGENT_PROBLEM_GRACE_MS) || 60_000;
// Consecutive idle readings after the handover that count as "finished".
const IDLE_READINGS_FOR_DONE = 2;
const PHASE_TIMEOUT_MS = 10 * 60_000;

export type JobOutcome =
  | { kind: 'succeeded' }
  | {
      kind: 'failed';
      reason: PrintTaskErrorReason;
      problem: PrinterProblem;
      // True when the job was pulled from the queue before reaching the
      // printer, so the pickup bin is still empty.
      nothingPrinted: boolean;
    }
  // Gave up watching (timeout, or the printer never came back to idle) —
  // the task stays 'printing' and staff get an incident instead.
  | { kind: 'unknown'; note: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Windows JobStatus flags that already say what's wrong, even without SNMP.
function problemFromSpoolerFlags(flags: string[]): PrinterProblem | null {
  if (flags.includes('PaperOut')) return 'no-paper';
  if (flags.includes('Offline')) return 'offline';
  if (flags.some((flag) => ['Error', 'UserIntervention', 'Blocked'].includes(flag))) {
    return 'service-requested';
  }
  return null;
}

async function currentBlockingProblem(
  statusSource: PrinterStatusSource | null,
): Promise<PrinterProblem | null> {
  if (!statusSource) return null;
  return blockingProblems((await statusSource.read()).problems)[0] ?? null;
}

/** Tracks how long the same kind of trouble has lasted. */
function problemTimer() {
  let since: number | null = null;
  return (problem: PrinterProblem | null): boolean => {
    if (!problem) {
      since = null;
      return false;
    }
    since ??= Date.now();
    return Date.now() - since >= PROBLEM_GRACE_MS;
  };
}

export async function waitForJobOutcome(
  taskId: string,
  printerName: string,
  statusSource: PrinterStatusSource | null,
): Promise<JobOutcome> {
  // Phase 1 — spooler.
  const spoolerDeadline = Date.now() + PHASE_TIMEOUT_MS;
  const spoolerProblemPersisted = problemTimer();
  for (;;) {
    let job;
    try {
      job = (await listSpoolerJobs(printerName)).find((j) => j.documentName.includes(taskId));
    } catch {
      break; // spooler unreadable — let the printer phase decide
    }
    if (!job) break;

    const problem =
      problemFromSpoolerFlags(job.status) ?? (await currentBlockingProblem(statusSource));
    const persisted = spoolerProblemPersisted(problem);
    if (problem && persisted) {
      const removed = await removeSpoolerJob(printerName, job.id).then(
        () => true,
        () => false,
      );
      return {
        kind: 'failed',
        reason: failureReasonFor(problem),
        problem,
        nothingPrinted: removed,
      };
    }
    if (Date.now() > spoolerDeadline) {
      return { kind: 'unknown', note: 'job still in the Windows queue after 10 minutes' };
    }
    await sleep(SPOOLER_POLL_MS);
  }

  // Phase 2 — printer.
  if (!statusSource) return { kind: 'succeeded' };
  const printerDeadline = Date.now() + PHASE_TIMEOUT_MS;
  const printerProblemPersisted = problemTimer();
  let idleReadings = 0;
  for (;;) {
    const snapshot = await statusSource.read();
    const problem = blockingProblems(snapshot.problems)[0] ?? null;
    const persisted = printerProblemPersisted(problem);
    if (problem) {
      idleReadings = 0;
      // The data is already in the printer, so it may still come out once
      // staff fix the problem — the incident says so (agent/index.ts).
      if (persisted) {
        return {
          kind: 'failed',
          reason: failureReasonFor(problem),
          problem,
          nothingPrinted: false,
        };
      }
    } else {
      idleReadings = snapshot.state === 'idle' ? idleReadings + 1 : 0;
      if (idleReadings >= IDLE_READINGS_FOR_DONE) return { kind: 'succeeded' };
    }
    if (Date.now() > printerDeadline) {
      return { kind: 'unknown', note: 'printer did not return to idle within 10 minutes' };
    }
    await sleep(PRINTER_POLL_MS);
  }
}
