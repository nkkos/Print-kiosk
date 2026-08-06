import express, { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { simpleParser } from 'mailparser';
import { networkInterfaces } from 'node:os';
import { mkdirSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { addFile, listFiles, uploadsDir, getUploadedFile } from './uploadStore.js';
import { addEmail, listEmails } from './emailStore.js';
import {
  startSession,
  touchSessionActivity,
  endSession,
  isSessionClosed,
} from './sessionLifecycle.js';
import {
  createAccount,
  findAccountByEmail,
  findAccountBySessionToken,
  verifyAccountEmail,
  updateAccountPassword,
  createAccountToken,
  consumeAccountToken,
  deleteAccount,
  EmailTakenError,
} from './accountStore.js';
import { sendVerificationEmail, sendPasswordResetEmail } from './emailSender.js';
import {
  ACCEPTED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  hasAcceptedExtension,
  hasPrintableExtension,
  decodeOriginalName,
} from './fileValidation.js';
import { submitPrintJob, PrintSubmitError, PLACEHOLDER_PDF_PATH } from './printerAdapter.js';
import { getConvertedPath } from './documentConverter.js';
import {
  createPrintTask,
  updatePrintTaskStatus,
  getPrintTask,
  type PrintTaskErrorReason,
} from './printTaskStore.js';

export const DEFAULT_PORT = 3001;

// Auto-detects the dev machine's LAN-facing IPv4 so the QR code can encode a
// URL the phone (a different device, on the same Wi-Fi) can actually reach —
// "localhost" only works for the kiosk browser itself, which runs on this
// same machine (docs/qr-upload-requirements.md, "How it works"). Dev
// machines commonly also have VPN/virtual adapters (Radmin VPN, Hamachi,
// Hyper-V, Docker, etc.) that also report a non-internal IPv4 but aren't
// reachable from another device on the physical Wi-Fi — picking the first
// non-internal address (the old approach) could return one of those
// instead. Preferring an interface whose name actually says Wi-Fi/Ethernet
// avoids that.
export function getLanIPv4(): string {
  const interfaces = Object.entries(networkInterfaces());

  const wifiOrEthernet = interfaces.find(([name]) => /wi-?fi|wireless|ethernet/i.test(name));
  const wifiAddress = wifiOrEthernet?.[1]?.find(
    (entry) => entry.family === 'IPv4' && !entry.internal,
  );
  if (wifiAddress) return wifiAddress.address;

  for (const [, entries] of interfaces) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return 'localhost';
}

// Express 5 types route params as `string | string[]` in general (repeating
// segments can produce arrays) — our routes only ever use plain `:sessionId`
// segments, which are always a single string at runtime.
function paramString(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

// Rejected uploads (wrong format or too large) never reach disk — multer
// runs fileFilter/limits checks before the storage engine writes anything
// (docs/domain/kiosk-session.md, "File format and size limits").
class InvalidFileFormatError extends Error {}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, callback) => {
      const sessionDir = join(uploadsDir, paramString(req.params.sessionId));
      mkdirSync(sessionDir, { recursive: true });
      callback(null, sessionDir);
    },
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    // Fixed up front, once — every later use of file.originalname (disk
    // filename below, the name stored/displayed via addFile) reads from
    // this same mutated object, so it only needs doing here.
    file.originalname = decodeOriginalName(file.originalname);
    if (hasAcceptedExtension(file.originalname)) {
      callback(null, true);
    } else {
      callback(new InvalidFileFormatError());
    }
  },
});

// Wraps upload.array() to redirect back to the same upload page with an
// inline error instead of a raw 500 — the phone-facing behavior confirmed
// in docs/qr-upload-requirements.md, "File format and size limits."
function handleFileUpload(req: Request, res: Response, next: NextFunction) {
  const sessionId = paramString(req.params.sessionId);
  upload.array('files')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.redirect(303, `/upload/${sessionId}?error=size`);
    } else if (err instanceof InvalidFileFormatError) {
      res.redirect(303, `/upload/${sessionId}?error=format`);
    } else if (err) {
      next(err);
    } else {
      next();
    }
  });
}

export const router = Router();

// Prefers the deployed Railway public URL when present (RAILWAY_PUBLIC_DOMAIN
// is injected automatically once a public domain is generated for this
// service — see docs/qr-upload-requirements.md), so a phone can reach this
// backend from any network. Falls back to LAN-IP detection for local dev,
// where no public domain exists.
router.get('/api/config', (_req, res) => {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  const lanUploadUrl = railwayDomain
    ? `https://${railwayDomain}`
    : `http://${getLanIPv4()}:${port}`;
  res.json({ lanUploadUrl });
});

// The "lightweight web page (file picker / take-a-photo)" from
// docs/qr-upload-requirements.md — served directly by this backend (not the
// Vite frontend) so the phone's upload never needs CORS: it's a plain HTML
// form posting back to this same origin.
router.get('/upload/:sessionId', (req, res) => {
  const sessionId = paramString(req.params.sessionId);
  const uploaded = req.query.uploaded === '1';
  const error = req.query.error;
  const errorMessage =
    error === 'size'
      ? `File is too large — maximum size is ${MAX_FILE_SIZE_MB} MB. Please try a smaller file.`
      : error === 'format'
        ? `Unsupported file format. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}.`
        : null;
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Upload to kiosk</title>
  <style>
    body { font-family: sans-serif; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; }
    button, input[type="file"] { font-size: 1.1rem; padding: 0.75rem; width: 100%; }
    p.success { color: #146c2e; }
    p.error { color: #b3261e; }
    p.hint { color: #555; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Upload your file(s)</h1>
  <p class="hint">Accepted: ${ACCEPTED_EXTENSIONS.join(', ')} — up to ${MAX_FILE_SIZE_MB} MB each.</p>
  ${uploaded ? '<p class="success">Uploaded! You can add more, or go back to the kiosk.</p>' : ''}
  ${errorMessage ? `<p class="error">${errorMessage}</p>` : ''}
  <form method="post" action="/api/qr-sessions/${sessionId}/files" enctype="multipart/form-data">
    <input type="file" name="files" multiple required />
    <br /><br />
    <button type="submit">Upload</button>
  </form>
</body>
</html>`);
});

router.post('/api/qr-sessions/:sessionId/files', handleFileUpload, async (req, res) => {
  const sessionId = paramString(req.params.sessionId);
  const files = Array.isArray(req.files) ? req.files : [];
  await Promise.all(files.map((file) => addFile(sessionId, file.originalname, file.path)));
  res.redirect(303, `/upload/${sessionId}?uploaded=1`);
});

router.get('/api/qr-sessions/:sessionId/files', async (req, res) => {
  res.json(await listFiles(paramString(req.params.sessionId)));
});

// Session start (src/App.tsx's Trigger A/B — handlePrintActivate/handleLogin)
// — fired once when a session is actually created, so kiosk_sessions'
// started_at/started_via are honest (docs/data-privacy-requirements.md
// follow-up: session-log analysis needs real timestamps, not just the
// end-of-session row endSession() below already writes).
router.post('/api/sessions/:sessionId/start', async (req, res) => {
  const sessionId = paramString(req.params.sessionId);
  const { accountId, startedVia } = (req.body ?? {}) as {
    accountId?: unknown;
    startedVia?: unknown;
  };
  await startSession(
    sessionId,
    typeof accountId === 'string' ? accountId : null,
    typeof startedVia === 'string' ? startedVia : null,
  );
  res.json({ ok: true });
});

// Activity heartbeat — bumps last_activity_at and opportunistically records
// the account once known (e.g. a mid-session login). Fired both on login
// and, throttled, on real user activity (src/App.tsx).
router.post('/api/sessions/:sessionId/activity', async (req, res) => {
  const sessionId = paramString(req.params.sessionId);
  const { accountId } = (req.body ?? {}) as { accountId?: unknown };
  await touchSessionActivity(sessionId, typeof accountId === 'string' ? accountId : null);
  res.json({ ok: true });
});

// Session end (button or inactivity timeout — src/App.tsx's handleEndSession)
// — deletes the session's uploaded files and marks it closed so a
// late-arriving email is discarded rather than accepted (see
// isSessionClosed() above, used by POST /api/email/incoming below). Always
// responds ok; a cleanup failure is logged server-side and recorded as
// 'cleanup-failed', never surfaced to the user (docs/domain/kiosk-session.md,
// "Privacy guarantee").
router.post('/api/sessions/:sessionId/end', async (req, res) => {
  const sessionId = paramString(req.params.sessionId);
  const { reason, accountId } = (req.body ?? {}) as { reason?: unknown; accountId?: unknown };
  await endSession(
    sessionId,
    reason === 'timeout' ? 'timeout' : 'manual',
    typeof accountId === 'string' ? accountId : null,
  );
  res.json({ ok: true });
});

// Extracts the 8-character session prefix from an address of the form
// `upload-<prefix>@<domain>` (the format src/App.tsx generates) — falls back
// to the whole local part if the address doesn't have the expected prefix,
// so a stray/misaddressed message still lands in *some* bucket instead of
// throwing.
function extractSessionPrefix(toAddress: string): string {
  const localPart = toAddress.split('@')[0] ?? '';
  return localPart.startsWith('upload-') ? localPart.slice('upload-'.length) : localPart;
}

// The Cloudflare Worker's (cloudflare-worker/email-relay.js) fixed target —
// see docs/email-upload-requirements.md. Reads the raw RFC822 message body
// (scoped `express.raw()` just for this route, so JSON parsing elsewhere is
// unaffected) plus the original recipient in the X-Original-To header the
// Worker sets, and reuses the exact same format/size validation and ClamAV
// scanning path QR uploads already go through (server/uploadStore.ts), via
// server/emailStore.ts.
router.post(
  '/api/email/incoming',
  express.raw({ type: '*/*', limit: `${MAX_FILE_SIZE_MB * 5}mb` }),
  async (req, res) => {
    const toHeader = req.header('X-Original-To');
    if (!toHeader) {
      res.status(400).json({ error: 'Missing X-Original-To header' });
      return;
    }
    const prefix = extractSessionPrefix(toHeader);
    // A session that already ended discards late mail immediately — not
    // even briefly stored (docs/data-privacy-requirements.md).
    if (await isSessionClosed(prefix)) {
      res.status(204).end();
      return;
    }
    const parsed = await simpleParser(req.body as Buffer);

    const sessionDir = join(uploadsDir, prefix);
    mkdirSync(sessionDir, { recursive: true });

    const attachments: { fileName: string; filePath: string }[] = [];
    for (const attachment of parsed.attachments) {
      const fileName = decodeOriginalName(attachment.filename ?? 'attachment');
      if (!hasAcceptedExtension(fileName) || attachment.size > MAX_FILE_SIZE_BYTES) continue;
      const filePath = join(sessionDir, `${randomUUID()}-${fileName}`);
      await writeFile(filePath, attachment.content);
      attachments.push({ fileName, filePath });
    }

    await addEmail(
      prefix,
      parsed.subject ?? '(no subject)',
      (parsed.text ?? '').slice(0, 200),
      attachments,
    );
    res.status(204).end();
  },
);

router.get('/api/email-sessions/:prefix/messages', async (req, res) => {
  res.json(await listEmails(paramString(req.params.prefix)));
});

// Real accounts (docs/personal-account-requirements.md, "Kiosk-side login" —
// baseline email/password; registration/verification/reset itself lives
// on the portal, portal/). Login/register are rate-limited (10 requests /
// 15 min per IP) against brute-forcing.
const accountRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;
const SESSION_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// Resolves the account behind an `Authorization: Bearer <sessionToken>`
// header — used only by change-password so far.
async function requireSession(req: Request) {
  const authHeader = req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return findAccountBySessionToken(authHeader.slice('Bearer '.length));
}

router.post('/api/accounts/register', accountRateLimiter, async (req, res) => {
  const { email, password } = (req.body ?? {}) as {
    email?: unknown;
    password?: unknown;
  };
  if (typeof email !== 'string' || typeof password !== 'string' || !email) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  let account;
  try {
    account = await createAccount(email, passwordHash);
  } catch (err) {
    if (err instanceof EmailTakenError) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }
    throw err;
  }
  const verificationToken = await createAccountToken(
    account.id,
    'email-verification',
    VERIFICATION_TOKEN_EXPIRY_MS,
  );
  await sendVerificationEmail(email, verificationToken);
  res.status(201).json(account);
});

router.post('/api/accounts/login', accountRateLimiter, async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  const account = await findAccountByEmail(email);
  // Same generic message either way — avoids confirming whether an email exists.
  const genericError = { error: 'Incorrect email or password' };
  if (!account) {
    res.status(401).json(genericError);
    return;
  }
  const passwordMatches = await bcrypt.compare(password, account.passwordHash);
  if (!passwordMatches) {
    res.status(401).json(genericError);
    return;
  }
  // Unwired on the kiosk (it never sends this token) — the portal's account
  // page is the only current consumer, for change-password.
  const sessionToken = await createAccountToken(account.id, 'session', SESSION_TOKEN_EXPIRY_MS);
  res.json({ id: account.id, email: account.email, sessionToken });
});

router.post('/api/accounts/verify-email', async (req, res) => {
  const { token } = (req.body ?? {}) as { token?: unknown };
  if (typeof token !== 'string') {
    res.status(400).json({ error: 'Token is required' });
    return;
  }
  const accountId = await consumeAccountToken(token, 'email-verification');
  if (!accountId) {
    res.status(400).json({ error: 'Invalid or expired verification link' });
    return;
  }
  await verifyAccountEmail(accountId);
  res.json({ ok: true });
});

router.post('/api/accounts/request-password-reset', accountRateLimiter, async (req, res) => {
  const { email } = (req.body ?? {}) as { email?: unknown };
  if (typeof email !== 'string' || !email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }
  const account = await findAccountByEmail(email);
  // Same response either way — avoids confirming whether an email exists.
  if (account) {
    const resetToken = await createAccountToken(
      account.id,
      'password-reset',
      PASSWORD_RESET_TOKEN_EXPIRY_MS,
    );
    await sendPasswordResetEmail(account.email, resetToken);
  }
  res.json({ ok: true });
});

router.post('/api/accounts/reset-password', async (req, res) => {
  const { token, newPassword } = (req.body ?? {}) as { token?: unknown; newPassword?: unknown };
  if (typeof token !== 'string' || typeof newPassword !== 'string') {
    res.status(400).json({ error: 'Token and new password are required' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  const accountId = await consumeAccountToken(token, 'password-reset');
  if (!accountId) {
    res.status(400).json({ error: 'Invalid or expired reset link' });
    return;
  }
  await updateAccountPassword(accountId, await bcrypt.hash(newPassword, 10));
  res.json({ ok: true });
});

router.post('/api/accounts/change-password', async (req, res) => {
  const account = await requireSession(req);
  if (!account) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const { currentPassword, newPassword } = (req.body ?? {}) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    res.status(400).json({ error: 'Current and new password are required' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  const currentMatches = await bcrypt.compare(currentPassword, account.passwordHash);
  if (!currentMatches) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }
  await updateAccountPassword(account.id, await bcrypt.hash(newPassword, 10));
  res.json({ ok: true });
});

// Right to erasure (docs/data-privacy-requirements.md, "Account data") —
// self-service, portal-only (portal/AccountPage.tsx). `kiosk_sessions`/
// `print_orders` rows referencing this account are anonymized (account_id
// set null), not deleted — see the onDelete: 'set null' FKs in
// server/db/schema.ts — since they're retained as audit/log records.
router.post('/api/accounts/delete-account', async (req, res) => {
  const account = await requireSession(req);
  if (!account) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  await deleteAccount(account.id);
  res.json({ ok: true });
});

// Print Tasks (docs/domain/kiosk-session.md, "Related entities" — "the
// execution unit that actually drives the physical printer"). Only
// job-submission is real (server/printerAdapter.ts); a plain OS print API
// gives no reliable in-progress signal, so jam/out-of-paper/out-of-ink stay
// manual "Simulate ..." outcomes below — both paths update the same record,
// so the frontend only ever reacts to real status, never to how it got there.
router.post('/api/print-tasks', async (req, res) => {
  const { sessionId, fileId, paperSize, sides, color, copies } = (req.body ?? {}) as {
    sessionId?: unknown;
    fileId?: unknown;
    paperSize?: unknown;
    sides?: unknown;
    color?: unknown;
    copies?: unknown;
  };
  const task = await createPrintTask(typeof sessionId === 'string' ? sessionId : null);

  // Only print the real uploaded file when it's actually resolvable and
  // scanned 'ready' — otherwise fall back to the placeholder
  // (server/printerAdapter.ts), same as when no fileId is given at all (e.g.
  // still-mocked Personal Account items). Formats pdf-to-printer can't
  // handle directly are converted at upload time already
  // (server/uploadStore.ts's scanFile → server/documentConverter.ts) — this
  // just checks whether that conversion actually left a usable cached file.
  // If it was expected but didn't happen (conversion failed, e.g. a
  // password-protected file), that's a real failure worth surfacing — not
  // silently printing a placeholder instead.
  let filePath = PLACEHOLDER_PDF_PATH;
  if (typeof fileId === 'string') {
    const file = await getUploadedFile(fileId);
    if (file && file.status === 'ready') {
      if (hasPrintableExtension(file.fileName)) {
        filePath = file.absolutePath;
      } else {
        const convertedPath = getConvertedPath(file.absolutePath, file.fileName);
        if (convertedPath && existsSync(convertedPath)) {
          filePath = convertedPath;
        } else if (convertedPath) {
          await updatePrintTaskStatus(task.id, 'failed', 'conversion-failed');
          res.status(201).json(await getPrintTask(task.id));
          return;
        }
      }
    }
  }

  try {
    await submitPrintJob(filePath, {
      copies: typeof copies === 'number' ? copies : undefined,
      paperSize: typeof paperSize === 'string' ? paperSize : undefined,
      side: sides === 'double' ? 'duplex' : sides === 'single' ? 'simplex' : undefined,
      monochrome: color === 'bw' ? true : color === 'color' ? false : undefined,
    });
    await updatePrintTaskStatus(task.id, 'printing');
  } catch (err) {
    const reason = err instanceof PrintSubmitError ? err.reason : 'submit-failed';
    await updatePrintTaskStatus(task.id, 'failed', reason);
  }
  res.status(201).json(await getPrintTask(task.id));
});

router.get('/api/print-tasks/:id', async (req, res) => {
  const task = await getPrintTask(paramString(req.params.id));
  if (!task) {
    res.status(404).json({ error: 'Print task not found' });
    return;
  }
  res.json(task);
});

const SIMULATABLE_OUTCOMES = ['success', 'paper-jam', 'out-of-paper', 'out-of-ink'] as const;
type SimulatableOutcome = (typeof SIMULATABLE_OUTCOMES)[number];

router.post('/api/print-tasks/:id/simulate', async (req, res) => {
  const id = paramString(req.params.id);
  const { outcome } = (req.body ?? {}) as { outcome?: unknown };
  if (
    typeof outcome !== 'string' ||
    !SIMULATABLE_OUTCOMES.includes(outcome as SimulatableOutcome)
  ) {
    res.status(400).json({ error: 'Invalid outcome' });
    return;
  }
  if (outcome === 'success') {
    await updatePrintTaskStatus(id, 'succeeded');
  } else {
    await updatePrintTaskStatus(id, 'failed', outcome as PrintTaskErrorReason);
  }
  const task = await getPrintTask(id);
  if (!task) {
    res.status(404).json({ error: 'Print task not found' });
    return;
  }
  res.json(task);
});
