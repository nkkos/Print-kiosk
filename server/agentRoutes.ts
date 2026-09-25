import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { extname } from 'node:path';
import {
  claimNextPrintTask,
  isClaimedInFlight,
  getPrintTaskOptions,
  updatePrintTaskStatus,
  releasePrintTaskBin,
  type PrintTaskErrorReason,
} from './printTaskStore.js';
import { preparePrintJob, printExecutionMode } from './printOrchestrator.js';
import { reportIncident, type IncidentSeverity } from './incidentStore.js';
import { blockingProblems, type PrinterProblem, type PrinterSnapshot } from './printerStatus.js';

// The cloud side of the pavilion print agent (agent/, docs/pavilion-launch-checklist.md,
// "Target architecture"). The agent runs on the pavilion mini-PC next to the
// printer and only ever talks outbound to these routes: claim the next task,
// download its printable file, report what happened. Used only when the
// backend runs with PRINT_EXECUTION=agent (server/printOrchestrator.ts).
export const agentRouter = Router();

let agentLastSeenAt: Date | null = null;
// Latest printer health the agent reported (POST /api/agent/printer-status).
// In memory on purpose: it's a live reading, refreshed every few seconds,
// and the backend runs as a single instance.
let latestPrinterSnapshot: PrinterSnapshot | null = null;

// The agent polls every 2 s and backs off to at most 30 s on errors, so
// silence longer than this means it's down or cut off.
const AGENT_OFFLINE_AFTER_MS = 60_000;

/** When the agent last called in — for uptime monitoring (a later step). */
export function getAgentLastSeenAt(): Date | null {
  return agentLastSeenAt;
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** One shared device key (PRINT_AGENT_TOKEN), sent as
 * `Authorization: Bearer <key>`. Compared as fixed-length hashes so the
 * comparison is constant-time regardless of the key's length. Unset →
 * every agent route answers 503, so a deployment without an agent never
 * accepts one by accident. */
function requireAgentToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.PRINT_AGENT_TOKEN;
  if (!expected) {
    res.status(503).json({ error: 'Print agent is not configured' });
    return;
  }
  const header = req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token || !timingSafeEqual(sha256(token), sha256(expected))) {
    res.status(401).json({ error: 'Invalid agent token' });
    return;
  }
  agentLastSeenAt = new Date();
  next();
}

agentRouter.use('/api/agent', requireAgentToken);

agentRouter.post('/api/agent/heartbeat', (_req, res) => {
  res.json({ ok: true, serverTime: new Date().toISOString() });
});

agentRouter.post('/api/agent/claim', async (_req, res) => {
  const task = await claimNextPrintTask();
  if (!task) {
    res.json({ task: null });
    return;
  }
  const job = await preparePrintJob(task.options);
  if (job === 'conversion-failed') {
    // The file broke between bin reservation and now — nothing will print.
    await releasePrintTaskBin(task.id);
    await updatePrintTaskStatus(task.id, 'failed', 'conversion-failed');
    res.json({ task: null });
    return;
  }
  // The options the agent prints with are the prepared ones (after any
  // pages-per-sheet imposition), not the task's raw ones.
  res.json({
    task: {
      ...task,
      options: job.options,
      fileExtension: extname(job.filePath).toLowerCase() || '.pdf',
    },
  });
});

agentRouter.get('/api/agent/print-tasks/:id/file', async (req, res) => {
  const id = String(req.params.id);
  if (!(await isClaimedInFlight(id))) {
    res.status(404).json({ error: 'No such claimed task' });
    return;
  }
  const job = await preparePrintJob(await getPrintTaskOptions(id));
  if (job === 'conversion-failed') {
    res.status(409).json({ error: 'File is not printable' });
    return;
  }
  res.sendFile(job.filePath);
});

const REPORTABLE_FAILURES: PrintTaskErrorReason[] = [
  'printer-not-found',
  'submit-failed',
  'submit-timeout',
  'paper-jam',
  'out-of-paper',
  'out-of-ink',
  'printer-error',
];
// Failures where the spooler never accepted the job, so nothing can land in
// the bin — same rule as direct mode (server/printOrchestrator.ts).
const NOTHING_PRINTED: PrintTaskErrorReason[] = ['printer-not-found', 'submit-failed'];

agentRouter.post('/api/agent/print-tasks/:id/status', async (req, res) => {
  const id = String(req.params.id);
  const { status, errorReason, printerName, nothingPrinted } = (req.body ?? {}) as {
    status?: unknown;
    errorReason?: unknown;
    printerName?: unknown;
    // The agent pulled the job out of the Windows queue before it reached
    // the printer (agent/jobTracker.ts) — the bin stays empty.
    nothingPrinted?: unknown;
  };
  const reportedPrinter = typeof printerName === 'string' ? printerName : undefined;
  if (!(await isClaimedInFlight(id))) {
    res.status(404).json({ error: 'No such claimed task' });
    return;
  }
  if (status === 'printing' || status === 'succeeded') {
    await updatePrintTaskStatus(id, status, undefined, reportedPrinter);
  } else if (
    status === 'failed' &&
    REPORTABLE_FAILURES.includes(errorReason as PrintTaskErrorReason)
  ) {
    const reason = errorReason as PrintTaskErrorReason;
    if (NOTHING_PRINTED.includes(reason) || nothingPrinted === true) await releasePrintTaskBin(id);
    await updatePrintTaskStatus(id, 'failed', reason, reportedPrinter);
  } else {
    res.status(400).json({ error: 'Invalid status report' });
    return;
  }
  res.json({ ok: true });
});

const PRINTER_PROBLEMS: PrinterProblem[] = [
  'low-paper',
  'no-paper',
  'low-toner',
  'no-toner',
  'door-open',
  'jammed',
  'offline',
  'service-requested',
  'input-tray-missing',
  'output-tray-missing',
  'marker-supply-missing',
  'output-near-full',
  'output-full',
  'input-tray-empty',
  'overdue-maintenance',
  'unreachable',
];

agentRouter.post('/api/agent/printer-status', (req, res) => {
  const body = (req.body ?? {}) as Partial<PrinterSnapshot>;
  if (typeof body.state !== 'string' || !Array.isArray(body.problems)) {
    res.status(400).json({ error: 'Invalid printer status' });
    return;
  }
  const problems = body.problems.filter((p): p is PrinterProblem =>
    PRINTER_PROBLEMS.includes(p as PrinterProblem),
  );
  const previous = new Set(latestPrinterSnapshot?.problems ?? []);
  latestPrinterSnapshot = {
    state: body.state,
    problems,
    supplies: Array.isArray(body.supplies) ? body.supplies : [],
    checkedAt: typeof body.checkedAt === 'string' ? body.checkedAt : new Date().toISOString(),
  };
  // One incident per problem as it appears, not one per report.
  const blocking = blockingProblems(problems);
  for (const problem of problems.filter((p) => !previous.has(p))) {
    void reportIncident({
      source: 'printer',
      code: `printer.${problem}`,
      severity: blocking.includes(problem) ? 'critical' : 'warning',
      message: `Printer reports: ${problem}`,
      context: { state: body.state, problems },
    });
  }
  res.json({ ok: true });
});

// Anything the agent notices that isn't tied to a status report — e.g. a
// job it stopped watching without knowing whether paper came out.
agentRouter.post('/api/agent/incident', (req, res) => {
  const { code, message, severity, context } = (req.body ?? {}) as {
    code?: unknown;
    message?: unknown;
    severity?: unknown;
    context?: unknown;
  };
  if (typeof code !== 'string' || !code.startsWith('printer.') || typeof message !== 'string') {
    res.status(400).json({ error: 'Invalid incident' });
    return;
  }
  void reportIncident({
    source: 'printer',
    code,
    severity: (['info', 'warning', 'critical'] as IncidentSeverity[]).includes(
      severity as IncidentSeverity,
    )
      ? (severity as IncidentSeverity)
      : 'warning',
    message,
    context:
      typeof context === 'object' && context ? (context as Record<string, unknown>) : undefined,
  });
  res.json({ ok: true });
});

/** Public, for the kiosk stands: can a paid job be printed right now? In
 * direct mode (local dev) there's no agent to ask, so always yes. Only the
 * blocking problems are exposed — a stand has no use for toner levels. */
agentRouter.get('/api/printer-status', (_req, res) => {
  if (printExecutionMode() === 'direct') {
    res.json({ mode: 'direct', available: true, agentOnline: null, problems: [] });
    return;
  }
  const agentOnline =
    !!agentLastSeenAt && Date.now() - agentLastSeenAt.getTime() < AGENT_OFFLINE_AFTER_MS;
  const problems = latestPrinterSnapshot ? blockingProblems(latestPrinterSnapshot.problems) : [];
  res.json({
    mode: 'agent',
    available: agentOnline && problems.length === 0,
    agentOnline,
    problems,
    checkedAt: latestPrinterSnapshot?.checkedAt ?? null,
  });
});
