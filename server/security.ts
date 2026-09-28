import type { Request, Response, NextFunction } from 'express';
import type { CorsOptions } from 'cors';
import { createHash, timingSafeEqual } from 'node:crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { reportIncident } from './incidentStore.js';

// Access control for the pavilion deployment (docs/pavilion-launch-checklist.md,
// "Before opening — application security"). Every check here is switched on
// by an environment variable and is a no-op while that variable is unset, so
// local development — and the deployment until its secrets are set — keeps
// working unchanged. Once set, each one fails closed.
//
//   STAND_API_KEYS      "A:<key>,B:<key>" — kiosk stands (and the photo
//                       kiosk). A stand's browser is opened once with
//                       ?stand=A&key=<key>; the kiosk remembers both and
//                       sends the key as X-Stand-Key (src/services/standAuth.ts).
//   EMAIL_RELAY_SECRET  shared with the Cloudflare email Worker, sent as
//                       X-Relay-Secret on POST /api/email/incoming.
//   CORS_ORIGINS        comma-separated browser origins allowed to call the
//                       API (the Cloudflare Pages domain, custom domains).
//   ALLOW_PRINT_SIMULATE  "true" keeps the Print Status "Simulate …" route
//                       open in agent mode (testing only).

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Constant-time string comparison (hashing first makes the lengths equal). */
export function secretsMatch(given: string, expected: string): boolean {
  return timingSafeEqual(sha256(given), sha256(expected));
}

function parseStandKeys(): Map<string, string> | null {
  const raw = process.env.STAND_API_KEYS;
  if (!raw) return null;
  const keys = new Map<string, string>();
  for (const entry of raw.split(',')) {
    const separator = entry.indexOf(':');
    if (separator <= 0) continue;
    const standId = entry.slice(0, separator).trim();
    const key = entry.slice(separator + 1).trim();
    if (standId && key) keys.set(standId, key);
  }
  return keys.size > 0 ? keys : null;
}

export interface StandRequest extends Request {
  /** The stand the verified key belongs to — undefined while stand keys
   * aren't configured. */
  standId?: string;
}

/** Only a kiosk stand may call this route. Its key identifies the stand, so
 * a stand id taken from here can be trusted, unlike one in the request body. */
export function requireStand(req: Request, res: Response, next: NextFunction): void {
  const keys = parseStandKeys();
  if (!keys) {
    next();
    return;
  }
  const given = req.header('X-Stand-Key') ?? '';
  for (const [standId, key] of keys) {
    if (given && secretsMatch(given, key)) {
      (req as StandRequest).standId = standId;
      next();
      return;
    }
  }
  res.status(401).json({ error: 'Unknown kiosk stand' });
}

// A rejected relay call is most likely our own Worker with a missing or
// mismatched RELAY_SECRET — every customer e-mail would then bounce
// silently. At most one warning per half hour, so probes can't flood it.
const RELAY_REJECTION_REPORT_INTERVAL_MS = 30 * 60_000;
let lastRelayRejectionReportAt = 0;

function reportRelayRejection(hadSecret: boolean): void {
  if (Date.now() - lastRelayRejectionReportAt < RELAY_REJECTION_REPORT_INTERVAL_MS) return;
  lastRelayRejectionReportAt = Date.now();
  void reportIncident({
    source: 'backend',
    code: 'backend.email-relay-rejected',
    severity: 'warning',
    message: hadSecret
      ? 'Inbound e-mail was rejected: wrong relay secret. If this is our Cloudflare Worker, its RELAY_SECRET does not match EMAIL_RELAY_SECRET.'
      : 'Inbound e-mail was rejected: no relay secret. If this is our Cloudflare Worker, it has no RELAY_SECRET set.',
  });
}

/** POST /api/email/incoming only accepts mail relayed by our Cloudflare
 * Worker — otherwise anyone could drop "attachments" into a session. */
export function requireEmailRelay(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.EMAIL_RELAY_SECRET;
  if (!secret) {
    next();
    return;
  }
  const given = req.header('X-Relay-Secret') ?? '';
  if (!given || !secretsMatch(given, secret)) {
    reportRelayRejection(given !== '');
    res.status(401).json({ error: 'Not the email relay' });
    return;
  }
  next();
}

/** The Print Status "Simulate …" outcomes rewrite a task's result, so in the
 * pavilion (agent mode, where the agent reports real outcomes) the route is
 * closed unless explicitly allowed for testing. */
export function requireSimulationAllowed(_req: Request, res: Response, next: NextFunction): void {
  if (process.env.PRINT_EXECUTION === 'agent' && process.env.ALLOW_PRINT_SIMULATE !== 'true') {
    res.status(403).json({ error: 'Simulated print outcomes are disabled' });
    return;
  }
  next();
}

/** Browser origins allowed to call the API. Unset → any origin (local dev).
 * Requests without an Origin header (the phone pages this backend serves
 * itself, the print agent, curl) aren't affected — CORS only governs what a
 * browser lets another site's page read. */
export function corsOptions(): CorsOptions {
  const allowed = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (allowed.length === 0) return {};
  return {
    origin: (origin, callback) => callback(null, !origin || allowed.includes(origin)),
  };
}

/** One line at boot per protection that's still off in production, so an
 * unprotected deployment is visible in the logs rather than silent. */
export function logSecurityPosture(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const off: string[] = [];
  if (!parseStandKeys()) off.push('STAND_API_KEYS (kiosk routes are open)');
  if (!process.env.EMAIL_RELAY_SECRET) off.push('EMAIL_RELAY_SECRET (anyone can post "email")');
  if (!process.env.CORS_ORIGINS) off.push('CORS_ORIGINS (any site may call the API)');
  for (const item of off) console.warn(`[security] not configured: ${item}`);
}

// --- Abuse limits -----------------------------------------------------------
// Per client IP. Only the routes phones and the public can reach are limited
// — both stands share the pavilion's one public IP, so stand routes aren't.

/** Railway sits one proxy hop in front of the backend; without trusting it
 * every client looks like the proxy's IP and each limit becomes one shared
 * bucket for everybody. Not trusted locally, where there's no proxy and the
 * header could be spoofed. */
export function trustedProxyHops(): number {
  if (process.env.TRUST_PROXY_HOPS) return Number(process.env.TRUST_PROXY_HOPS) || 0;
  return process.env.RAILWAY_PUBLIC_DOMAIN ? 1 : 0;
}

/** File and photo uploads from phones (QR upload, scan/copy pages and their
 * corner detection, My files uploads) — generous enough for a long scan. */
export const uploadRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads — please wait a few minutes and try again.' },
});

/** Routes that send an e-mail to an address the caller chooses (scan
 * delivery, photo sharing) — the obvious spam-relay target. */
export const emailSendRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many e-mails sent — please wait a few minutes and try again.' },
});

/** Standard security headers. The Content-Security-Policy stays off: the
 * phone pages this backend serves carry inline scripts. Resources stay
 * loadable cross-origin, since the kiosk and portal run on another origin
 * (Cloudflare Pages) and load files from here. The referrer policy keeps
 * capability links (QR upload, scan download) out of Referer headers. */
export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  });
}
