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
import { claimNextFiscalJob, completeFiscalJob, fiscalMode } from './fiscalReceiptStore.js';
import {
  reportIncident,
  hasOpenIncident,
  resolveOpenIncidents,
  type IncidentSeverity,
} from './incidentStore.js';
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

// The cash register's readiness (POST /api/agent/fiscal-status) — only
// consulted with FISCAL_REGISTER=agent, i.e. a real register at the pavilion.
let latestFiscalStatus: { ok: boolean; problem: string | null; checkedAt: Date } | null = null;
const FISCAL_INCIDENT = 'pc.cash-register-unavailable';

// The agent polls every 2 s and backs off to at most 30 s on errors, so
// silence longer than this means it's down or cut off.
const AGENT_OFFLINE_AFTER_MS = 60_000;

/** Everything staff see about the printer (admin Print Queue screen,
 * server/adminRoutes.ts) — the full latest snapshot, warnings and supply
 * levels included, unlike the stands' yes/no GET /api/printer-status. */
export function getPrinterStatusForStaff(): {
  mode: 'direct' | 'agent';
  agentOnline: boolean | null;
  agentLastSeenAt: string | null;
  printer: PrinterSnapshot | null;
} {
  const mode = printExecutionMode();
  return {
    mode,
    agentOnline:
      mode === 'direct'
        ? null
        : !!agentLastSeenAt && Date.now() - agentLastSeenAt.getTime() < AGENT_OFFLINE_AFTER_MS,
    agentLastSeenAt: agentLastSeenAt?.toISOString() ?? null,
    printer: latestPrinterSnapshot,
  };
}

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

agentRouter.post('/api/agent/printer-status', async (req, res) => {
  const body = (req.body ?? {}) as Partial<PrinterSnapshot>;
  if (typeof body.state !== 'string' || !Array.isArray(body.problems)) {
    res.status(400).json({ error: 'Invalid printer status' });
    return;
  }
  const problems = body.problems.filter((p): p is PrinterProblem =>
    PRINTER_PROBLEMS.includes(p as PrinterProblem),
  );
  latestPrinterSnapshot = {
    state: body.state,
    problems,
    supplies: Array.isArray(body.supplies) ? body.supplies : [],
    checkedAt: typeof body.checkedAt === 'string' ? body.checkedAt : new Date().toISOString(),
  };
  // One incident per problem while it lasts — checked against the database,
  // so a backend restart doesn't raise every current problem a second time —
  // and closed again as soon as the printer stops reporting it.
  const blocking = blockingProblems(problems);
  for (const problem of problems) {
    const code = `printer.${problem}`;
    if (await hasOpenIncident(code)) continue;
    void reportIncident({
      source: 'printer',
      code,
      severity: blocking.includes(problem) ? 'critical' : 'warning',
      message: `Printer reports: ${problem}`,
      context: { state: body.state, problems },
    });
  }
  await resolveOpenIncidents(
    PRINTER_PROBLEMS.filter((p) => !problems.includes(p)).map((p) => `printer.${p}`),
    { reason: 'the printer no longer reports it' },
  );
  res.json({ ok: true });
});

agentRouter.post('/api/agent/fiscal-status', async (req, res) => {
  const body = (req.body ?? {}) as { ok?: unknown; problem?: unknown };
  if (typeof body.ok !== 'boolean') {
    res.status(400).json({ error: 'Invalid cash register status' });
    return;
  }
  const problem = typeof body.problem === 'string' ? body.problem.slice(0, 200) : null;
  latestFiscalStatus = { ok: body.ok, problem, checkedAt: new Date() };
  if (fiscalMode() === 'agent') {
    if (!body.ok) {
      if (!(await hasOpenIncident(FISCAL_INCIDENT))) {
        void reportIncident({
          source: 'pc',
          code: FISCAL_INCIDENT,
          severity: 'critical',
          message: `The cash register can't issue receipts (${problem ?? 'unknown problem'}) — the stands take no payment until it's back.`,
          context: { problem },
        });
      }
    } else {
      await resolveOpenIncidents([FISCAL_INCIDENT], { reason: 'the cash register is ready again' });
    }
  }
  res.json({ ok: true });
});

// Anything the agent notices that isn't tied to a status report — e.g. a
// job it stopped watching without knowing whether paper came out.
// eKasa relay (docs/payments-technical-requirements.md, "eKasa"): the
// register's API is local to the pavilion mini-PC, so the agent pulls
// receipts to register — the same pull model as print tasks — and reports
// the register's answer. Only used with FISCAL_REGISTER=agent.
agentRouter.post('/api/agent/fiscal-jobs/claim', async (_req, res) => {
  if (fiscalMode() !== 'agent') {
    res.json({ job: null });
    return;
  }
  res.json({ job: await claimNextFiscalJob() });
});

agentRouter.post('/api/agent/fiscal-jobs/:id/result', async (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : '';
  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
  if (body.status === 'registered' || body.status === 'registered-offline') {
    const okp = text(body.okp);
    const receiptNumber = text(body.receiptNumber);
    const cashRegisterCode = text(body.cashRegisterCode);
    if (!okp || !receiptNumber || !cashRegisterCode) {
      res.status(400).json({ error: 'okp, receiptNumber and cashRegisterCode are required' });
      return;
    }
    await completeFiscalJob(id, {
      status: body.status,
      receiptUid: text(body.receiptUid),
      okp,
      receiptNumber,
      cashRegisterCode,
    });
  } else if (body.status === 'failed') {
    await completeFiscalJob(id, { status: 'failed', reason: text(body.reason) ?? 'unknown' });
  } else {
    res.status(400).json({ error: 'Invalid fiscal result' });
    return;
  }
  res.json({ ok: true });
});

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
/** Whether the cash register can issue receipts — true when there is no
 * real register to wait for (FISCAL_REGISTER isn't 'agent'). A reading
 * older than the agent-offline window counts as unavailable. */
function cashRegisterAvailable(): boolean {
  if (fiscalMode() !== 'agent') return true;
  return (
    !!latestFiscalStatus &&
    latestFiscalStatus.ok &&
    Date.now() - latestFiscalStatus.checkedAt.getTime() < AGENT_OFFLINE_AFTER_MS
  );
}

/** What stops the stands taking payment right now: the agent gone quiet,
 * a blocking printer problem, or the cash register unable to issue
 * receipts. Shared by GET /api/printer-status (the stands' Cart) and the
 * server's own check in POST /api/payments (server/routes.ts). */
export function paymentBlockers(): {
  agentOnline: boolean | null;
  problems: (PrinterProblem | 'cash-register-unavailable')[];
} {
  if (printExecutionMode() === 'direct') {
    return {
      agentOnline: null,
      problems: cashRegisterAvailable() ? [] : ['cash-register-unavailable'],
    };
  }
  const agentOnline =
    !!agentLastSeenAt && Date.now() - agentLastSeenAt.getTime() < AGENT_OFFLINE_AFTER_MS;
  const problems: (PrinterProblem | 'cash-register-unavailable')[] = latestPrinterSnapshot
    ? blockingProblems(latestPrinterSnapshot.problems)
    : [];
  if (!cashRegisterAvailable()) problems.push('cash-register-unavailable');
  return { agentOnline, problems };
}

agentRouter.get('/api/printer-status', (_req, res) => {
  const { agentOnline, problems } = paymentBlockers();
  res.json({
    mode: printExecutionMode(),
    available: agentOnline !== false && problems.length === 0,
    agentOnline,
    problems,
    checkedAt: latestPrinterSnapshot?.checkedAt ?? null,
  });
});

// --- Agent watchdog ----------------------------------------------------------
// The stands already stop taking payment when the agent goes quiet (GET
// /api/printer-status), but nobody would be told why. After a short grace
// period this raises one critical incident — which reaches Telegram — and
// closes it by itself once the agent calls in again.
const AGENT_OFFLINE_INCIDENT = 'pc.print-agent-offline';
const WATCHDOG_INTERVAL_MS = 30_000;
// Longer than AGENT_OFFLINE_AFTER_MS, so a redeploy or a brief network blip
// doesn't page anyone.
const AGENT_OFFLINE_GRACE_MS = 2 * 60_000;

export function startAgentWatchdog(): void {
  const bootedAt = Date.now();
  let lastState: 'unknown' | 'online' | 'offline' = 'unknown';
  setInterval(() => {
    if (printExecutionMode() !== 'agent') return;
    const lastSeen = agentLastSeenAt?.getTime() ?? null;
    const online = lastSeen != null && Date.now() - lastSeen < AGENT_OFFLINE_AFTER_MS;
    if (online) {
      if (lastState !== 'online') {
        lastState = 'online';
        void resolveOpenIncidents([AGENT_OFFLINE_INCIDENT], {
          reason: 'the agent called in again',
        });
      }
      return;
    }
    const silentSince = lastSeen ?? bootedAt;
    if (lastState === 'offline' || Date.now() - silentSince < AGENT_OFFLINE_GRACE_MS) return;
    lastState = 'offline';
    void (async () => {
      if (await hasOpenIncident(AGENT_OFFLINE_INCIDENT)) return;
      await reportIncident({
        source: 'pc',
        code: AGENT_OFFLINE_INCIDENT,
        severity: 'critical',
        message:
          lastSeen == null
            ? 'The pavilion print agent has not called in since the backend started — nothing can print, and the stands refuse payment.'
            : `The pavilion print agent has been silent since ${new Date(lastSeen).toISOString()} — nothing can print, and the stands refuse payment. Check the mini-PC and its PrintKioskAgent task.`,
        context: { lastSeenAt: lastSeen ? new Date(lastSeen).toISOString() : null },
      });
    })();
  }, WATCHDOG_INTERVAL_MS).unref();
}
