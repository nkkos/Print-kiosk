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
import { listRecentPrintTasks, markPrintTaskPickedUp, getPrintTask } from './printTaskStore.js';
import { BIN_COUNT } from './pickupBins.js';
import { listAllProducts, createProduct, updateProduct } from './productStore.js';
import {
  listCountries,
  createCountry,
  deleteCountry,
  listAllDocuments,
  createDocument,
  updateDocument,
} from './photoDocumentStore.js';
import {
  createCompany,
  listCompanies,
  getCompany,
  listCompanyMembers,
  inviteCompanyMember,
} from './companyStore.js';
import {
  createDraftInvoice,
  issueInvoice as issueCompanyInvoice,
  listInvoicesForCompany,
} from './companyInvoiceStore.js';
import { sendCompanyInviteEmail } from './emailSender.js';

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

// Pavilion launch plan (2026-09-16): the Print Queue screen — staff-facing
// visibility into the Brother MX-4000's 4 pickup bins (server/pickupBins.ts),
// since nothing else surfaces a stuck/zombie task (one holding a bin that
// nobody will ever confirm picked up — the exact failure mode found and
// fixed in printOrchestrator.ts's original "advance on pickup" sweep).
adminRouter.get('/api/admin/print-tasks', requireStaffSession, async (req, res) => {
  const { limit } = req.query;
  const parsedLimit = typeof limit === 'string' && /^\d+$/.test(limit) ? Number(limit) : undefined;
  res.json({ tasks: await listRecentPrintTasks(parsedLimit), binCount: BIN_COUNT });
});

// Manual override for a task that's holding a bin but will never get a
// customer-initiated pickup confirmation (abandoned mid-flow, or a 'failed'
// task whose bin was reserved but never actually printed into) — staff
// confirm the bin is physically clear, then this frees it for the next
// waiting task the same way a real customer's confirmation would
// (server/routes.ts's POST /api/print-tasks/:id/picked-up).
adminRouter.post(
  '/api/admin/print-tasks/:id/release-bin',
  requireStaffSession,
  async (req, res) => {
    const id = paramString(req.params.id);
    const task = await getPrintTask(id);
    if (!task) {
      res.status(404).json({ error: 'Print task not found' });
      return;
    }
    await markPrintTaskPickedUp(id);
    res.json({ ok: true });
  },
);

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

// Photo kiosk's Country/Document requirement data (docs/photo-kiosk-requirements.md's
// "Requirement data model") — managed here, same "real form, not a script" decision
// already made for the shop catalog above.
adminRouter.get('/api/admin/photo-countries', requireStaffSession, async (_req, res) => {
  res.json(await listCountries());
});

adminRouter.post('/api/admin/photo-countries', requireStaffSession, async (req, res) => {
  const { name } = (req.body ?? {}) as { name?: unknown };
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Country name is required' });
    return;
  }
  res.status(201).json(await createCountry(name.trim()));
});

adminRouter.delete('/api/admin/photo-countries/:id', requireStaffSession, async (req, res) => {
  await deleteCountry(paramString(req.params.id));
  res.json({ ok: true });
});

adminRouter.get('/api/admin/photo-documents', requireStaffSession, async (_req, res) => {
  res.json(await listAllDocuments());
});

interface PhotoDocumentBody {
  countryId?: unknown;
  label?: unknown;
  photoWidthMm?: unknown;
  photoHeightMm?: unknown;
  dpi?: unknown;
  headHeightMinMm?: unknown;
  headHeightMaxMm?: unknown;
  eyeLineFromBottomMm?: unknown;
  marginTopMm?: unknown;
  headWidthMinMm?: unknown;
  headWidthMaxMm?: unknown;
  backgroundRequirement?: unknown;
  backgroundColorHex?: unknown;
  printNotes?: unknown;
  copiesPerSheet?: unknown;
  priceCents?: unknown;
  instructions?: unknown;
  active?: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

adminRouter.post('/api/admin/photo-documents', requireStaffSession, async (req, res) => {
  const body = (req.body ?? {}) as PhotoDocumentBody;
  if (
    typeof body.countryId !== 'string' ||
    typeof body.label !== 'string' ||
    !body.label.trim() ||
    !isFiniteNumber(body.photoWidthMm) ||
    !isFiniteNumber(body.photoHeightMm) ||
    !isFiniteNumber(body.dpi) ||
    !isFiniteNumber(body.headHeightMinMm) ||
    !isFiniteNumber(body.headHeightMaxMm) ||
    // A document needs at least one vertical crop anchor — an eye-line
    // figure (most issuers) or a top-margin figure (China-style) — but not
    // necessarily both.
    (!isFiniteNumber(body.eyeLineFromBottomMm) && !isFiniteNumber(body.marginTopMm))
  ) {
    res.status(400).json({ error: 'Invalid document' });
    return;
  }
  const document = await createDocument({
    countryId: body.countryId,
    label: body.label,
    photoWidthMm: body.photoWidthMm,
    photoHeightMm: body.photoHeightMm,
    dpi: body.dpi,
    headHeightMinMm: body.headHeightMinMm,
    headHeightMaxMm: body.headHeightMaxMm,
    eyeLineFromBottomMm: isFiniteNumber(body.eyeLineFromBottomMm)
      ? body.eyeLineFromBottomMm
      : undefined,
    marginTopMm: isFiniteNumber(body.marginTopMm) ? body.marginTopMm : undefined,
    headWidthMinMm: isFiniteNumber(body.headWidthMinMm) ? body.headWidthMinMm : undefined,
    headWidthMaxMm: isFiniteNumber(body.headWidthMaxMm) ? body.headWidthMaxMm : undefined,
    backgroundRequirement:
      typeof body.backgroundRequirement === 'string' ? body.backgroundRequirement : undefined,
    backgroundColorHex:
      typeof body.backgroundColorHex === 'string' ? body.backgroundColorHex : undefined,
    printNotes: typeof body.printNotes === 'string' ? body.printNotes : undefined,
    copiesPerSheet: isFiniteNumber(body.copiesPerSheet) ? body.copiesPerSheet : undefined,
    priceCents: isFiniteNumber(body.priceCents) ? body.priceCents : undefined,
    instructions: typeof body.instructions === 'string' ? body.instructions : undefined,
  });
  res.status(201).json(document);
});

adminRouter.patch('/api/admin/photo-documents/:id', requireStaffSession, async (req, res) => {
  const body = (req.body ?? {}) as PhotoDocumentBody;
  const document = await updateDocument(paramString(req.params.id), {
    ...(typeof body.label === 'string' && { label: body.label }),
    ...(isFiniteNumber(body.photoWidthMm) && { photoWidthMm: body.photoWidthMm }),
    ...(isFiniteNumber(body.photoHeightMm) && { photoHeightMm: body.photoHeightMm }),
    ...(isFiniteNumber(body.dpi) && { dpi: body.dpi }),
    ...(isFiniteNumber(body.headHeightMinMm) && { headHeightMinMm: body.headHeightMinMm }),
    ...(isFiniteNumber(body.headHeightMaxMm) && { headHeightMaxMm: body.headHeightMaxMm }),
    ...(body.eyeLineFromBottomMm !== undefined && {
      eyeLineFromBottomMm: isFiniteNumber(body.eyeLineFromBottomMm)
        ? body.eyeLineFromBottomMm
        : null,
    }),
    ...(body.marginTopMm !== undefined && {
      marginTopMm: isFiniteNumber(body.marginTopMm) ? body.marginTopMm : null,
    }),
    ...(body.headWidthMinMm !== undefined && {
      headWidthMinMm: isFiniteNumber(body.headWidthMinMm) ? body.headWidthMinMm : null,
    }),
    ...(body.headWidthMaxMm !== undefined && {
      headWidthMaxMm: isFiniteNumber(body.headWidthMaxMm) ? body.headWidthMaxMm : null,
    }),
    ...(body.backgroundRequirement !== undefined && {
      backgroundRequirement:
        typeof body.backgroundRequirement === 'string' ? body.backgroundRequirement : null,
    }),
    ...(body.backgroundColorHex !== undefined && {
      backgroundColorHex:
        typeof body.backgroundColorHex === 'string' ? body.backgroundColorHex : null,
    }),
    ...(body.printNotes !== undefined && {
      printNotes: typeof body.printNotes === 'string' ? body.printNotes : null,
    }),
    ...(isFiniteNumber(body.copiesPerSheet) && { copiesPerSheet: body.copiesPerSheet }),
    ...(isFiniteNumber(body.priceCents) && { priceCents: body.priceCents }),
    ...(body.instructions !== undefined && {
      instructions: typeof body.instructions === 'string' ? body.instructions : null,
    }),
    ...(typeof body.active === 'boolean' && { active: body.active }),
  });
  if (!document) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.json(document);
});

// B2B company-billing portal (docs, "B2B company-billing portal" plan,
// 2026-09-17) — company/member management + the two-step draft/issue
// invoice flow. Open to either staff role, same call already made for the
// shop catalog above: creating a company or inviting a member isn't
// destructive/session-interrupting enough to need requireSeniorRole.
// Issuing a real invoice is the one genuinely irreversible action here, but
// gating it behind `senior` can be revisited once a real provider (not the
// stub in server/invoiceAdapter.ts) is actually wired up.
interface CompanyBody {
  name?: unknown;
  ico?: unknown;
  dic?: unknown;
  icDph?: unknown;
  billingEmail?: unknown;
  billingAddress?: unknown;
  pricePerPageBwCents?: unknown;
  pricePerPageColorCents?: unknown;
  vatRatePercent?: unknown;
}

adminRouter.get('/api/admin/companies', requireStaffSession, async (_req, res) => {
  res.json(await listCompanies());
});

adminRouter.post('/api/admin/companies', requireStaffSession, async (req, res) => {
  const body = (req.body ?? {}) as CompanyBody;
  if (
    typeof body.name !== 'string' ||
    !body.name.trim() ||
    typeof body.ico !== 'string' ||
    !body.ico.trim() ||
    typeof body.dic !== 'string' ||
    !body.dic.trim() ||
    typeof body.billingEmail !== 'string' ||
    !body.billingEmail.trim() ||
    !isFiniteNumber(body.pricePerPageBwCents) ||
    !isFiniteNumber(body.pricePerPageColorCents)
  ) {
    res.status(400).json({ error: 'Invalid company' });
    return;
  }
  const company = await createCompany({
    name: body.name,
    ico: body.ico,
    dic: body.dic,
    icDph: typeof body.icDph === 'string' ? body.icDph : undefined,
    billingEmail: body.billingEmail,
    billingAddress: typeof body.billingAddress === 'string' ? body.billingAddress : undefined,
    pricePerPageBwCents: body.pricePerPageBwCents,
    pricePerPageColorCents: body.pricePerPageColorCents,
    vatRatePercent: isFiniteNumber(body.vatRatePercent) ? body.vatRatePercent : undefined,
  });
  res.status(201).json(company);
});

adminRouter.get('/api/admin/companies/:id/members', requireStaffSession, async (req, res) => {
  res.json(await listCompanyMembers(paramString(req.params.id)));
});

adminRouter.post('/api/admin/companies/:id/members', requireStaffSession, async (req, res) => {
  const companyId = paramString(req.params.id);
  const { email, role } = (req.body ?? {}) as { email?: unknown; role?: unknown };
  if (typeof email !== 'string' || !email.trim() || (role !== 'admin' && role !== 'member')) {
    res.status(400).json({ error: 'A valid email and role are required' });
    return;
  }
  const company = await getCompany(companyId);
  if (!company) {
    res.status(404).json({ error: 'Company not found' });
    return;
  }
  const token = await inviteCompanyMember(companyId, email, role);
  await sendCompanyInviteEmail(email, token, company.name);
  res.status(201).json({ ok: true });
});

adminRouter.get('/api/admin/companies/:id/invoices', requireStaffSession, async (req, res) => {
  res.json(await listInvoicesForCompany(paramString(req.params.id)));
});

// Step 1/2 — aggregates the period into a reviewable 'draft', doesn't call
// the invoice provider yet.
adminRouter.post(
  '/api/admin/companies/:id/invoices/generate',
  requireStaffSession,
  async (req, res) => {
    const { periodStart, periodEnd } = (req.body ?? {}) as {
      periodStart?: unknown;
      periodEnd?: unknown;
    };
    if (typeof periodStart !== 'string' || typeof periodEnd !== 'string') {
      res.status(400).json({ error: 'periodStart and periodEnd (ISO dates) are required' });
      return;
    }
    const invoice = await createDraftInvoice(
      paramString(req.params.id),
      new Date(periodStart),
      new Date(periodEnd),
    );
    res.status(201).json(invoice);
  },
);

// Step 2/2 — staff reviewed the draft's total and confirmed; only now does
// server/invoiceAdapter.ts get called.
adminRouter.post('/api/admin/company-invoices/:id/issue', requireStaffSession, async (req, res) => {
  const invoice = await issueCompanyInvoice(paramString(req.params.id));
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found or not in draft status' });
    return;
  }
  res.json(invoice);
});

export { requireStaffSession, requireSeniorRole };
