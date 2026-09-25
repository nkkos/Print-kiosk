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
import { resolvePrintableFile } from './printOrchestrator.js';

// The cloud side of the pavilion print agent (agent/, docs/pavilion-launch-checklist.md,
// "Target architecture"). The agent runs on the pavilion mini-PC next to the
// printer and only ever talks outbound to these routes: claim the next task,
// download its printable file, report what happened. Used only when the
// backend runs with PRINT_EXECUTION=agent (server/printOrchestrator.ts).
export const agentRouter = Router();

let agentLastSeenAt: Date | null = null;

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
  const filePath = await resolvePrintableFile(task.options);
  if (filePath === 'conversion-failed') {
    // The file broke between bin reservation and now — nothing will print.
    await releasePrintTaskBin(task.id);
    await updatePrintTaskStatus(task.id, 'failed', 'conversion-failed');
    res.json({ task: null });
    return;
  }
  res.json({ task: { ...task, fileExtension: extname(filePath).toLowerCase() || '.pdf' } });
});

agentRouter.get('/api/agent/print-tasks/:id/file', async (req, res) => {
  const id = String(req.params.id);
  if (!(await isClaimedInFlight(id))) {
    res.status(404).json({ error: 'No such claimed task' });
    return;
  }
  const filePath = await resolvePrintableFile(await getPrintTaskOptions(id));
  if (filePath === 'conversion-failed') {
    res.status(409).json({ error: 'File is not printable' });
    return;
  }
  res.sendFile(filePath);
});

const REPORTABLE_FAILURES: PrintTaskErrorReason[] = [
  'printer-not-found',
  'submit-failed',
  'submit-timeout',
  'paper-jam',
  'out-of-paper',
  'out-of-ink',
];
// Failures where the spooler never accepted the job, so nothing can land in
// the bin — same rule as direct mode (server/printOrchestrator.ts).
const NOTHING_PRINTED: PrintTaskErrorReason[] = ['printer-not-found', 'submit-failed'];

agentRouter.post('/api/agent/print-tasks/:id/status', async (req, res) => {
  const id = String(req.params.id);
  const { status, errorReason, printerName } = (req.body ?? {}) as {
    status?: unknown;
    errorReason?: unknown;
    printerName?: unknown;
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
    if (NOTHING_PRINTED.includes(reason)) await releasePrintTaskBin(id);
    await updatePrintTaskStatus(id, 'failed', reason, reportedPrinter);
  } else {
    res.status(400).json({ error: 'Invalid status report' });
    return;
  }
  res.json({ ok: true });
});
