import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  submitPrintJob,
  submitOptionsFromPrintOptions,
  printerNameForBin,
  getDefaultPrinterName,
  PrintSubmitError,
} from '../server/printerAdapter.js';
import type { PrintOptions } from '../server/printTaskStore.js';
import { blockingProblems, type PrinterSnapshot } from '../server/printerStatus.js';
import { createPrinterStatusSource } from './printerStatusSource.js';
import { waitForJobOutcome } from './jobTracker.js';

// Pavilion print agent (docs/pavilion-launch-checklist.md, "Target
// architecture"). Runs on the pavilion mini-PC that the Brother printer is
// attached to; the cloud backend (PRINT_EXECUTION=agent) never prints
// itself. The agent only makes outbound calls (server/agentRoutes.ts), so the
// pavilion needs no open ports: claim the next task, download its printable
// file, print it to the queue of its reserved bin, report back.
//
// After submitting, the agent follows the job (agent/jobTracker.ts) until
// the paper is out ('succeeded') or a printer problem outlasts its grace
// period ('failed' with the reason). Separately it reports the printer's
// health every PRINTER_STATUS_INTERVAL_MS, which the stands read to know
// whether printing is possible, and stops claiming new jobs while the
// printer is blocked — they wait in the cloud queue instead of failing.
//
// Config (.env next to package.json, or real environment variables):
//   AGENT_CLOUD_URL        backend base URL, e.g. https://….up.railway.app
//   PRINT_AGENT_TOKEN      same value as the backend's PRINT_AGENT_TOKEN
//   PRINTER_QUEUE_BIN_1..4 / PRINTER_TRAY_A4 / PRINTER_TRAY_A5
//                          see server/printerAdapter.ts
//   PRINTER_SNMP_HOST / PRINTER_SNMP_COMMUNITY / PRINTER_STATUS_SIMULATOR_FILE
//                          see agent/printerStatusSource.ts
//   AGENT_POLL_INTERVAL_MS optional, default 2000
//   AGENT_DRY_RUN=true     do everything except send the job to a printer —
//                          with PRINTER_STATUS_SIMULATOR_FILE this runs the
//                          whole cloud ↔ agent chain on a PC with no printer

try {
  process.loadEnvFile();
} catch {
  // no .env file — fine when the variables come from the environment
}

const CLOUD_URL = process.env.AGENT_CLOUD_URL?.replace(/\/+$/, '');
const TOKEN = process.env.PRINT_AGENT_TOKEN;
const POLL_INTERVAL_MS = Number(process.env.AGENT_POLL_INTERVAL_MS) || 2000;
// After a network or server error, wait longer before trying again, up to
// this cap, so an outage doesn't turn into a request storm.
const MAX_BACKOFF_MS = 30_000;
const WORK_DIR = join(tmpdir(), 'print-kiosk-agent');
const PRINTER_STATUS_INTERVAL_MS = 15_000;
const DRY_RUN = process.env.AGENT_DRY_RUN === 'true';
const statusSource = createPrinterStatusSource();
let latestSnapshot: PrinterSnapshot | null = null;

if (!CLOUD_URL || !TOKEN) {
  console.error('[agent] AGENT_CLOUD_URL and PRINT_AGENT_TOKEN must be set');
  process.exit(1);
}

interface ClaimedTask {
  id: string;
  binNumber: number;
  options: PrintOptions;
  fileExtension: string;
}

async function callCloud(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${CLOUD_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → HTTP ${response.status}`);
  }
  return response;
}

async function reportStatus(
  taskId: string,
  report: {
    status: 'printing' | 'succeeded' | 'failed';
    errorReason?: string;
    printerName?: string;
    nothingPrinted?: boolean;
  },
): Promise<void> {
  await callCloud(`/api/agent/print-tasks/${taskId}/status`, {
    method: 'POST',
    body: JSON.stringify(report),
  });
}

async function reportIncident(code: string, message: string, context: Record<string, unknown>) {
  await callCloud('/api/agent/incident', {
    method: 'POST',
    body: JSON.stringify({ code, message, severity: 'critical', context }),
  }).catch((err: unknown) => console.error('[agent] could not report incident:', err));
}

async function printTask(task: ClaimedTask): Promise<void> {
  const printerName = printerNameForBin(task.binNumber) ?? (await getDefaultPrinterName());
  console.log(`[agent] task ${task.id} → bin ${task.binNumber} (${printerName ?? 'no printer'})`);

  await mkdir(WORK_DIR, { recursive: true });
  const filePath = join(WORK_DIR, `${task.id}${task.fileExtension}`);
  const file = await callCloud(`/api/agent/print-tasks/${task.id}/file`);
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  try {
    const submitOptions = {
      ...submitOptionsFromPrintOptions(task.options),
      printerName: printerName ?? undefined,
    };
    if (DRY_RUN) {
      console.log(`[agent] DRY RUN — would print ${filePath}`, submitOptions);
    } else {
      await submitPrintJob(filePath, submitOptions);
    }
  } catch (err) {
    const reason = err instanceof PrintSubmitError ? err.reason : 'submit-failed';
    console.error(`[agent] task ${task.id} not submitted: ${reason}`);
    await reportStatus(task.id, {
      status: 'failed',
      errorReason: reason,
      printerName: printerName ?? undefined,
    });
    return;
  } finally {
    // The spooler has its own copy once submitPrintJob returns.
    await rm(filePath, { force: true });
  }

  await reportStatus(task.id, { status: 'printing', printerName: printerName ?? undefined });
  console.log(`[agent] task ${task.id} submitted, following it`);

  const outcome = await waitForJobOutcome(task.id, printerName ?? '', statusSource);
  if (outcome.kind === 'succeeded') {
    await reportStatus(task.id, { status: 'succeeded', printerName: printerName ?? undefined });
    console.log(`[agent] task ${task.id} done`);
  } else if (outcome.kind === 'failed') {
    console.error(`[agent] task ${task.id} failed: ${outcome.problem}`);
    await reportStatus(task.id, {
      status: 'failed',
      errorReason: outcome.reason,
      printerName: printerName ?? undefined,
      nothingPrinted: outcome.nothingPrinted,
    });
    if (!outcome.nothingPrinted) {
      await reportIncident(
        'printer.job-interrupted',
        `Task ${task.id} (bin ${task.binNumber}) stopped at "${outcome.problem}" after reaching ` +
          'the printer — it may still come out once the problem is fixed; check the bin ' +
          'before the customer retries.',
        { printTaskId: task.id, binNumber: task.binNumber, problem: outcome.problem },
      );
    }
  } else {
    console.error(`[agent] task ${task.id}: ${outcome.note}`);
    await reportIncident(
      'printer.job-unconfirmed',
      `Task ${task.id} (bin ${task.binNumber}): ${outcome.note}. Check the bin and confirm manually.`,
      { printTaskId: task.id, binNumber: task.binNumber },
    );
  }
}

async function pollOnce(): Promise<boolean> {
  // Don't take a job the printer can't print right now — it waits in the
  // cloud queue and goes out once the problem is fixed.
  if (latestSnapshot && blockingProblems(latestSnapshot.problems).length > 0) return false;
  const response = await callCloud('/api/agent/claim', { method: 'POST' });
  const { task } = (await response.json()) as { task: ClaimedTask | null };
  if (!task) return false;
  await printTask(task);
  return true;
}

async function reportPrinterStatus(): Promise<void> {
  if (!statusSource) return;
  latestSnapshot = await statusSource.read();
  await callCloud('/api/agent/printer-status', {
    method: 'POST',
    body: JSON.stringify(latestSnapshot),
  });
}

async function runStatusLoop(): Promise<void> {
  for (;;) {
    try {
      await reportPrinterStatus();
    } catch (err) {
      console.error(
        '[agent] printer status report failed:',
        err instanceof Error ? err.message : err,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, PRINTER_STATUS_INTERVAL_MS));
  }
}

async function run(): Promise<void> {
  console.log(`[agent] polling ${CLOUD_URL} every ${POLL_INTERVAL_MS} ms`);
  let backoffMs = POLL_INTERVAL_MS;
  for (;;) {
    try {
      const didWork = await pollOnce();
      backoffMs = POLL_INTERVAL_MS;
      // Something was printed — check again right away, there may be more.
      if (didWork) continue;
    } catch (err) {
      console.error('[agent] cloud call failed:', err instanceof Error ? err.message : err);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }
}

console.log(
  `[agent] printer status: ${
    process.env.PRINTER_STATUS_SIMULATOR_FILE
      ? 'simulator'
      : statusSource
        ? `SNMP ${process.env.PRINTER_SNMP_HOST}`
        : 'none (spooler only)'
  }`,
);
await Promise.all([runStatusLoop(), run()]);
