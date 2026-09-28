import type { Request, Response, NextFunction } from 'express';
import type { CorsOptions } from 'cors';
import { createHash, timingSafeEqual } from 'node:crypto';

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
