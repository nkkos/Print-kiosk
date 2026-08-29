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
import {
  listIncidents,
  resolveIncident,
  type IncidentSource,
  type IncidentSeverity,
} from './incidentStore.js';
import { listRoster, getCurrentOnCall } from './rosterStore.js';
import { hasActiveKioskSession } from './sessionLifecycle.js';
import { listAllProducts, createProduct, updateProduct } from './productStore.js';

// Admin panel backend (docs/screens/admin-panel-wireframes.md,
// docs/screens/admin-panel-spec.md) — a distinct router mounted under
// /api/admin, kept in its own file rather than growing server/routes.ts
// further (that file already covers the kiosk/portal's own routes).

export const adminRouter = Router();

// Same rationale as server/routes.ts's own paramString — Express 5 types route
// params as `string | string[]` in general, but every route here only ever uses a
// plain `:id` segment, always a single string at runtime.
function paramString(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

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

// Alerts & on-call screen (docs/screens/admin-panel-spec.md's
// `alerts-roster`/`alerts-oncall-now`) — view-only, matches the confirmed
// "no editing UI in this pass" decision (server/scripts/setRosterDay.ts is
// the only write path).
adminRouter.get('/api/admin/roster', requireStaffSession, async (_req, res) => {
  const [roster, current] = await Promise.all([listRoster(), getCurrentOnCall()]);
  res.json({ roster, current });
});

// Equipment detail's `equipment-fix-confirm-session-warning`
// (docs/screens/admin-panel-spec.md) — whether hitting a PC/Display fix
// action right now would interrupt a real customer.
adminRouter.get('/api/admin/kiosk-session-active', requireStaffSession, async (_req, res) => {
  res.json({ active: await hasActiveKioskSession() });
});

// The one real fix action implemented so far (docs/equipment-monitoring-requirements.md,
// Section E) — every other equipment-fix-* route in docs/screens/admin-panel-spec.md
// needs infrastructure that doesn't exist yet (a watchdog process, a
// managed relay). `incidentId` is optional — the route still restarts the
// process without one, but resolving the specific incident that prompted
// the action is what actually gives it an audit trail (who confirmed, when).
adminRouter.post(
  '/api/admin/equipment/backend/restart-process',
  requireStaffSession,
  requireSeniorRole,
  async (req, res) => {
    const { incidentId } = (req.body ?? {}) as { incidentId?: unknown };
    const staffAccount = (req as AuthenticatedStaffRequest).staffAccount!;
    if (typeof incidentId === 'string') {
      await resolveIncident(incidentId, 'operator', {
        action: 'restart-backend-process',
        triggeredBy: staffAccount.email,
      });
    }
    res.json({ ok: true });
    // Flushes the response above before exiting — same reasoning already
    // documented in docs/equipment-monitoring-requirements.md, Section E:
    // Railway's restart-on-crash policy brings a fresh instance up, the
    // same platform behavior server/index.ts's SIGTERM/SIGINT handling
    // already coexists with for routine redeploys. Locally (no such
    // policy), this takes the dev backend down until it's manually
    // restarted — a real, deliberate difference from production, not a bug.
    setTimeout(() => process.exit(1), 250);
  },
);

// Shop catalog management (docs/shop-requirements.md's "Back office / admin" —
// confirmed 2026-08-25 as a real form here rather than a script-only workaround).
// Open to either staff role — unlike the equipment fix actions above, editing the
// catalog isn't destructive/session-interrupting enough to need requireSeniorRole.
adminRouter.get('/api/admin/products', requireStaffSession, async (_req, res) => {
  res.json(await listAllProducts());
});

adminRouter.post('/api/admin/products', requireStaffSession, async (req, res) => {
  const { name, description, category, fulfillmentType, priceCents, variantLabel, imageUrl } =
    (req.body ?? {}) as {
      name?: unknown;
      description?: unknown;
      category?: unknown;
      fulfillmentType?: unknown;
      priceCents?: unknown;
      variantLabel?: unknown;
      imageUrl?: unknown;
    };
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    typeof category !== 'string' ||
    !category.trim() ||
    (fulfillmentType !== 'self-service' && fulfillmentType !== 'staff-fulfilled') ||
    typeof priceCents !== 'number' ||
    priceCents < 0
  ) {
    res.status(400).json({ error: 'Invalid product' });
    return;
  }
  const product = await createProduct({
    name,
    description: typeof description === 'string' ? description : undefined,
    category,
    fulfillmentType,
    priceCents,
    variantLabel: typeof variantLabel === 'string' ? variantLabel : undefined,
    imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined,
  });
  res.status(201).json(product);
});

adminRouter.patch('/api/admin/products/:id', requireStaffSession, async (req, res) => {
  const {
    name,
    description,
    category,
    fulfillmentType,
    priceCents,
    variantLabel,
    imageUrl,
    active,
  } = (req.body ?? {}) as {
    name?: unknown;
    description?: unknown;
    category?: unknown;
    fulfillmentType?: unknown;
    priceCents?: unknown;
    variantLabel?: unknown;
    imageUrl?: unknown;
    active?: unknown;
  };
  const product = await updateProduct(paramString(req.params.id), {
    ...(typeof name === 'string' && { name }),
    ...(description !== undefined && {
      description: typeof description === 'string' ? description : null,
    }),
    ...(typeof category === 'string' && { category }),
    ...((fulfillmentType === 'self-service' || fulfillmentType === 'staff-fulfilled') && {
      fulfillmentType,
    }),
    ...(typeof priceCents === 'number' && priceCents >= 0 && { priceCents }),
    ...(variantLabel !== undefined && {
      variantLabel: typeof variantLabel === 'string' ? variantLabel : null,
    }),
    ...(imageUrl !== undefined && { imageUrl: typeof imageUrl === 'string' ? imageUrl : null }),
    ...(typeof active === 'boolean' && { active }),
  });
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json(product);
});

export { requireStaffSession, requireSeniorRole };
