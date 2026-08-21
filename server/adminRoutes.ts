import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import {
  findStaffAccountByEmail,
  createStaffSession,
  findStaffAccountBySessionToken,
  type StaffAccount,
} from './staffAccountStore.js';
import { listIncidents, type IncidentSource, type IncidentSeverity } from './incidentStore.js';

// Admin panel backend (docs/screens/admin-panel-wireframes.md,
// docs/screens/admin-panel-spec.md) — a distinct router mounted under
// /api/admin, kept in its own file rather than growing server/routes.ts
// further (that file already covers the kiosk/portal's own routes).

export const adminRouter = Router();

const STAFF_SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// Same brute-force protection as the kiosk/portal's own login
// (server/routes.ts's accountRateLimiter) — separate limiter instance since
// this is a different router, same window/limit.
const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

export interface AuthenticatedStaffRequest extends Request {
  staffAccount?: StaffAccount;
}

/** Resolves the staff account behind an `Authorization: Bearer <token>`
 * header. Unlike the kiosk/portal's requireSession (server/routes.ts),
 * this is a real middleware (not a plain helper) since every /api/admin
 * route needs it, not just one or two call sites. */
async function requireStaffSession(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  const staffAccount = token ? await findStaffAccountBySessionToken(token) : null;
  if (!staffAccount) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  (req as AuthenticatedStaffRequest).staffAccount = staffAccount;
  next();
}

/** Gate for senior-only actions (docs/screens/admin-panel-spec.md's
 * role-gated fix buttons) — always used after requireStaffSession, never
 * standalone, so staffAccount is already known to be set. */
function requireSeniorRole(req: Request, res: Response, next: NextFunction) {
  if ((req as AuthenticatedStaffRequest).staffAccount?.role !== 'senior') {
    res.status(403).json({ error: 'Requires the senior role' });
    return;
  }
  next();
}

adminRouter.post('/api/admin/login', adminRateLimiter, async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  const staffAccount = await findStaffAccountByEmail(email);
  // Same generic message either way as the kiosk/portal's own login
  // (server/routes.ts) — avoids confirming whether an email exists.
  const genericError = { error: 'Incorrect email or password' };
  if (!staffAccount) {
    res.status(401).json(genericError);
    return;
  }
  const passwordMatches = await bcrypt.compare(password, staffAccount.passwordHash);
  if (!passwordMatches) {
    res.status(401).json(genericError);
    return;
  }
  const sessionToken = await createStaffSession(staffAccount.id, STAFF_SESSION_EXPIRY_MS);
  res.json({
    id: staffAccount.id,
    email: staffAccount.email,
    role: staffAccount.role,
    sessionToken,
  });
});

adminRouter.get('/api/admin/me', requireStaffSession, (req, res) => {
  res.json((req as AuthenticatedStaffRequest).staffAccount);
});

const INCIDENT_SOURCES: IncidentSource[] = [
  'pc',
  'printer',
  'display',
  'network',
  'backend',
  'payment-terminal',
];
const INCIDENT_SEVERITIES: IncidentSeverity[] = ['info', 'warning', 'critical', 'emergency'];

// Powers Overview's active-incidents feed (?openOnly=true), Equipment
// detail's per-source history (?source=printer), and the Incident log's
// filters (docs/screens/admin-panel-spec.md) — one endpoint, different
// query combinations, matching how listIncidents itself is already shaped.
adminRouter.get('/api/admin/incidents', requireStaffSession, async (req, res) => {
  const { source, severity, openOnly, limit } = req.query;
  const parsedSource =
    typeof source === 'string' && INCIDENT_SOURCES.includes(source as IncidentSource)
      ? (source as IncidentSource)
      : undefined;
  const parsedSeverity =
    typeof severity === 'string' && INCIDENT_SEVERITIES.includes(severity as IncidentSeverity)
      ? (severity as IncidentSeverity)
      : undefined;
  const parsedLimit = typeof limit === 'string' && /^\d+$/.test(limit) ? Number(limit) : undefined;

  const incidents = await listIncidents({
    source: parsedSource,
    severity: parsedSeverity,
    openOnly: openOnly === 'true',
    limit: parsedLimit,
  });
  res.json(incidents);
});

export { requireStaffSession, requireSeniorRole };
