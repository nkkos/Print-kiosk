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

// Pavilion print agent (docs/pavilion-launch-checklist.md, "Target
// architecture"). Runs on the pavilion mini-PC that the Brother printer is
// attached to; the cloud backend (PRINT_EXECUTION=agent) never prints
// itself. The agent only makes outbound calls (server/agentRoutes.ts), so the
// pavilion needs no open ports: claim the next task, download its printable
// file, print it to the queue of its reserved bin, report back.
//
// Not reported yet: the job actually finishing ('succeeded') or physical
// failures (jam, out of paper) — those need the spooler/SNMP status module,
// the next step. Until then a task stays 'printing' after a clean submit.
//
// Config (.env next to package.json, or real environment variables):
//   AGENT_CLOUD_URL        backend base URL, e.g. https://….up.railway.app
//   PRINT_AGENT_TOKEN      same value as the backend's PRINT_AGENT_TOKEN
//   PRINTER_QUEUE_BIN_1..4 / PRINTER_TRAY_A4 / PRINTER_TRAY_A5
//                          see server/printerAdapter.ts
//   AGENT_POLL_INTERVAL_MS optional, default 2000

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
  report: { status: 'printing' | 'failed'; errorReason?: string; printerName?: string },
): Promise<void> {
  await callCloud(`/api/agent/print-tasks/${taskId}/status`, {
    method: 'POST',
    body: JSON.stringify(report),
  });
}

async function printTask(task: ClaimedTask): Promise<void> {
  const printerName = printerNameForBin(task.binNumber) ?? (await getDefaultPrinterName());
  console.log(`[agent] task ${task.id} → bin ${task.binNumber} (${printerName ?? 'no printer'})`);

  await mkdir(WORK_DIR, { recursive: true });
  const filePath = join(WORK_DIR, `${task.id}${task.fileExtension}`);
  const file = await callCloud(`/api/agent/print-tasks/${task.id}/file`);
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  try {
    await submitPrintJob(filePath, {
      ...submitOptionsFromPrintOptions(task.options),
      printerName: printerName ?? undefined,
    });
    await reportStatus(task.id, { status: 'printing', printerName: printerName ?? undefined });
    console.log(`[agent] task ${task.id} submitted`);
  } catch (err) {
    const reason = err instanceof PrintSubmitError ? err.reason : 'submit-failed';
    console.error(`[agent] task ${task.id} failed: ${reason}`);
    await reportStatus(task.id, {
      status: 'failed',
      errorReason: reason,
      printerName: printerName ?? undefined,
    });
  } finally {
    // The spooler has its own copy once submitPrintJob returns.
    await rm(filePath, { force: true });
  }
}

async function pollOnce(): Promise<boolean> {
  const response = await callCloud('/api/agent/claim', { method: 'POST' });
  const { task } = (await response.json()) as { task: ClaimedTask | null };
  if (!task) return false;
  await printTask(task);
  return true;
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

await run();
