import express, { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { simpleParser } from 'mailparser';
import { mkdirSync, existsSync } from 'node:fs';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { portalBaseUrl, publicBackendUrl } from './lanIp.js';
import { addFile, listFiles, uploadsDir, getUploadedFile } from './uploadStore.js';
import { addEmail, listEmails } from './emailStore.js';
import {
  addFile as addAccountFile,
  listFiles as listAccountFiles,
  deleteFile as deleteAccountFile,
  getAccountFile,
  accountUploadsDir,
  addFolder,
  listFolders,
  renameFolder,
  deleteFolder,
} from './accountFileStore.js';
import { createOrder, payOrderForCompany, listOrders } from './accountOrderStore.js';
import { getCompanyForAccount, acceptCompanyInvite } from './companyStore.js';
import { listInvoicesForCompany } from './companyInvoiceStore.js';
import { listActiveProducts } from './productStore.js';
import {
  listCountries,
  listActiveDocumentsForCountry,
  getDocument as getPhotoDocument,
} from './photoDocumentStore.js';
import { recordPhotoOrder, markPhotoOrdersPrinted } from './photoOrderStore.js';
import {
  listShopOrders,
  EmptyCheckoutError,
  InvalidPrintOrderError,
  InvalidProductError,
  EmailNotVerifiedError,
} from './shopOrderStore.js';
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
  getAccountProfile,
  updateInvoiceDetails,
  EmailTakenError,
} from './accountStore.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendScanEmail,
  sendPhotoEmail,
} from './emailSender.js';
import { reportIncident } from './incidentStore.js';
import { createShare, consumeShare } from './photoShareStore.js';
import { compositeViaNanoBanana } from './aiBackgroundCompositor.js';
import {
  createScanSession,
  addPage,
  listPages,
  getProcessedPagePath,
  getScanSession,
  scansDir,
  combineToPdf,
  markDelivered,
  finalPdfPath,
  NoReadyPagesError,
} from './scanStore.js';
import type { Corners } from './scanProcessor.js';
import { renderScanPhoneApp } from './scanPhoneApp.js';
import { detectDocumentCorners } from './documentCornerDetector.js';
import {
  createCopySession,
  addPage as addCopyPage,
  listPages as listCopyPages,
  getProcessedPagePath as getProcessedCopyPagePath,
  getCopySession,
  copiesDir,
  finishCopySession,
  NoReadyPagesError as NoReadyCopyPagesError,
} from './copyStore.js';
import { renderCopyPhoneApp } from './copyPhoneApp.js';
import QRCode from 'qrcode';
import { getReceipt } from './fiscalReceiptStore.js';
import { renderReceiptPage } from './receiptPage.js';
import {
  ACCEPTED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  hasAcceptedExtension,
  decodeOriginalName,
} from './fileValidation.js';
import {
  ACCOUNT_FILE_ACCEPTED_EXTENSIONS,
  ACCOUNT_FILE_RETENTION_DAYS,
  ACCOUNT_FILE_MAX_TOTAL_STORAGE_MB,
  hasAcceptedAccountFileExtension,
  AccountStorageQuotaExceededError,
} from './accountFileLimits.js';
import { resolvePrintablePath } from './documentConverter.js';
import {
  createPrintTask,
  updatePrintTaskStatus,
  markPrintTaskPickedUp,
  findActiveTaskForPrintOrder,
  getPrintTask,
  type PrintTaskErrorReason,
  type PrintOptions,
} from './printTaskStore.js';
import { tryPrintTask } from './printOrchestrator.js';
import {
  startOnlineCheckout,
  confirmOnlineCheckout,
  findOnlinePaymentByOrderCode,
  getOnlineCheckoutView,
} from './onlineCheckoutStore.js';
import { getOnlineCheckout, simulatorCheckout, vivaWebhookKey } from './onlineCheckout.js';
import { unitPriceCentsFor } from '../src/utils/tariff.js';
import { sheetSidesFor } from '../src/utils/nUpLayout.js';
import {
  createKioskPayment,
  refreshPayment,
  cancelPayment,
  getProviderSessionId,
  PaymentInputError,
  setReceiptDelivery,
  claimPaymentItemForPrint,
  paidOrderQuantity,
  getRefundForPrintTask,
} from './paymentStore.js';
import { getPaymentTerminal, simulatorTerminal } from './paymentTerminal.js';
import { paymentBlockers } from './agentRoutes.js';
import {
  requireStand,
  requireEmailRelay,
  requireSimulationAllowed,
  uploadRateLimiter,
  emailSendRateLimiter,
  type StandRequest,
} from './security.js';
import { supportsDuplex, isPaperSizeOffered } from './printerAdapter.js';
import { isPagesPerSheet } from '../src/utils/nUpLayout.js';

export const DEFAULT_PORT = 3001;

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
  const lanUploadUrl = publicBackendUrl();
  // The deployed portal's real, globally-reachable URL (Cloudflare Pages —
  // same env var server/emailSender.ts already uses for email links) when
  // set. Falls back to this dev machine's LAN IP at Vite's default port —
  // same reasoning as lanUploadUrl above: a phone scanning the kiosk's
  // "Register" QR code is a separate device, for which "localhost" would
  // resolve to the phone itself, not this machine.
  const portalUrl = portalBaseUrl();
  res.json({ lanUploadUrl, portalUrl });
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

router.post(
  '/api/qr-sessions/:sessionId/files',
  uploadRateLimiter,
  handleFileUpload,
  async (req, res) => {
    const sessionId = paramString(req.params.sessionId);
    const files = Array.isArray(req.files) ? req.files : [];
    await Promise.all(files.map((file) => addFile(sessionId, file.originalname, file.path)));
    res.redirect(303, `/upload/${sessionId}?uploaded=1`);
  },
);

router.get('/api/qr-sessions/:sessionId/files', requireStand, async (req, res) => {
  res.json(await listFiles(paramString(req.params.sessionId)));
});

// Serves the actual printable bytes for a real document preview
// (src/features/print-order-configuration/PrintOrderConfigurationScreen.tsx)
// — the same resolution POST /api/print-tasks uses (original if already
// printable, else its cached conversion), just returned to the client
// instead of handed to the local printer. res.sendFile infers Content-Type
// from the extension automatically (application/pdf, image/jpeg, ...).
router.get('/api/uploaded-files/:fileId/content', requireStand, async (req, res) => {
  const file = await getUploadedFile(paramString(req.params.fileId));
  if (!file || file.status !== 'ready') {
    res.status(404).end();
    return;
  }
  const printablePath = resolvePrintablePath(file.absolutePath, file.fileName);
  if (!printablePath) {
    res.status(404).end();
    return;
  }
  res.sendFile(printablePath);
});

// Session start (src/App.tsx's Trigger A/B — handlePrintActivate/handleLogin)
// — fired once when a session is actually created, so kiosk_sessions'
// started_at/started_via are honest (docs/data-privacy-requirements.md
// follow-up: session-log analysis needs real timestamps, not just the
// end-of-session row endSession() below already writes).
router.post('/api/sessions/:sessionId/start', requireStand, async (req, res) => {
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
router.post('/api/sessions/:sessionId/activity', requireStand, async (req, res) => {
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
router.post('/api/sessions/:sessionId/end', requireStand, async (req, res) => {
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
  requireEmailRelay,
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

router.get('/api/email-sessions/:prefix/messages', requireStand, async (req, res) => {
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
  try {
    await sendVerificationEmail(email, verificationToken);
  } catch (err) {
    void reportIncident({
      source: 'backend',
      code: 'backend.email-send-failed',
      severity: 'warning',
      message: `Failed to send verification email to ${email}.`,
      context: { email, error: String(err) },
    });
    throw err;
  }
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
    try {
      await sendPasswordResetEmail(account.email, resetToken);
    } catch (err) {
      void reportIncident({
        source: 'backend',
        code: 'backend.email-send-failed',
        severity: 'warning',
        message: `Failed to send password-reset email to ${account.email}.`,
        context: { email: account.email, error: String(err) },
      });
      throw err;
    }
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

// Personal Account's "My files"/"My orders" (docs/personal-account-requirements.md).
// Folder/file/order management is portal-only (session-token-authenticated,
// same requireSession as change-password/delete-account above) — the kiosk
// only ever reads (accountId-only, no token, matching every other kiosk-
// facing route today — see the block further below).
interface AuthenticatedRequest extends Request {
  accountId?: string;
}

async function requireAccountAuth(req: Request, res: Response, next: NextFunction) {
  const account = await requireSession(req);
  if (!account) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  (req as AuthenticatedRequest).accountId = account.id;
  next();
}

/** Same as requireAccountAuth, plus the `:accountId` in the path must be the
 * signed-in account's own — for the kiosk's reads, which name the account
 * in the URL. */
async function requireOwnAccount(req: Request, res: Response, next: NextFunction) {
  const account = await requireSession(req);
  if (!account) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  if (account.id !== paramString(req.params.accountId)) {
    res.status(403).json({ error: 'Not your account' });
    return;
  }
  (req as AuthenticatedRequest).accountId = account.id;
  next();
}

router.post('/api/accounts/folders', requireAccountAuth, async (req, res) => {
  const { name } = (req.body ?? {}) as { name?: unknown };
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Folder name is required' });
    return;
  }
  res.status(201).json(await addFolder((req as AuthenticatedRequest).accountId!, name.trim()));
});

router.get('/api/accounts/folders', requireAccountAuth, async (req, res) => {
  res.json(await listFolders((req as AuthenticatedRequest).accountId!));
});

router.patch('/api/accounts/folders/:id', requireAccountAuth, async (req, res) => {
  const { name } = (req.body ?? {}) as { name?: unknown };
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Folder name is required' });
    return;
  }
  await renameFolder(
    (req as AuthenticatedRequest).accountId!,
    paramString(req.params.id),
    name.trim(),
  );
  res.json({ ok: true });
});

router.delete('/api/accounts/folders/:id', requireAccountAuth, async (req, res) => {
  await deleteFolder((req as AuthenticatedRequest).accountId!, paramString(req.params.id));
  res.json({ ok: true });
});

// Separate multer instance from the QR one above — different destination
// (server/accountFileStore.ts's accountUploadsDir, keyed by accountId, not
// uploadsDir keyed by sessionId). Format/size rules are Personal Account's
// own, narrower and env-configured (server/accountFileLimits.ts) — not
// QR/Email's shared server/fileValidation.ts ones.
const accountUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, callback) => {
      const accountId = (req as AuthenticatedRequest).accountId!;
      const dir = join(accountUploadsDir, accountId);
      mkdirSync(dir, { recursive: true });
      callback(null, dir);
    },
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    file.originalname = decodeOriginalName(file.originalname);
    if (hasAcceptedAccountFileExtension(file.originalname)) {
      callback(null, true);
    } else {
      callback(new InvalidFileFormatError());
    }
  },
});

// JSON-error variant of handleFileUpload above — this is a React portal page
// consuming a JSON API, not a plain HTML form, so errors come back as JSON
// instead of a redirect.
function handleAccountFileUpload(req: Request, res: Response, next: NextFunction) {
  accountUpload.array('files')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res
        .status(400)
        .json({ error: `File is too large — maximum size is ${MAX_FILE_SIZE_MB} MB.` });
    } else if (err instanceof InvalidFileFormatError) {
      res.status(400).json({
        error: `Unsupported file format. Accepted: ${ACCOUNT_FILE_ACCEPTED_EXTENSIONS.join(', ')}.`,
      });
    } else if (err) {
      next(err);
    } else {
      next();
    }
  });
}

router.post(
  '/api/accounts/files',
  uploadRateLimiter,
  requireAccountAuth,
  handleAccountFileUpload,
  async (req, res) => {
    const accountId = (req as AuthenticatedRequest).accountId!;
    const files = Array.isArray(req.files) ? req.files : [];
    const folderId = typeof req.body.folderId === 'string' ? req.body.folderId : undefined;
    const results: Awaited<ReturnType<typeof addAccountFile>>[] = [];
    for (const file of files) {
      try {
        results.push(
          await addAccountFile(accountId, file.originalname, file.path, file.size, folderId),
        );
      } catch (err) {
        // multer already wrote the file to disk before this handler ran —
        // clean it up on a rejected (over-quota) upload rather than leaving
        // an orphaned, never-referenced file behind.
        await unlink(file.path).catch(() => {});
        if (err instanceof AccountStorageQuotaExceededError) {
          res.status(400).json({ error: 'Storage quota exceeded for this account.' });
          return;
        }
        throw err;
      }
    }
    res.status(201).json(results);
  },
);

// Exposes the current, env-configured Personal Account file limits
// (server/accountFileLimits.ts) so the portal's "My files" notice can show
// real values instead of a hardcoded string that would silently go stale
// the moment an operator changes the underlying env var. Not
// account-specific, no auth needed — same public-config posture as
// GET /api/config.
router.get('/api/accounts/file-limits', (_req, res) => {
  res.json({
    acceptedExtensions: ACCOUNT_FILE_ACCEPTED_EXTENSIONS,
    retentionDays: ACCOUNT_FILE_RETENTION_DAYS,
    maxTotalStorageMb: ACCOUNT_FILE_MAX_TOTAL_STORAGE_MB,
  });
});

router.get('/api/accounts/files', requireAccountAuth, async (req, res) => {
  res.json(await listAccountFiles((req as AuthenticatedRequest).accountId!));
});

router.delete('/api/accounts/files/:id', requireAccountAuth, async (req, res) => {
  await deleteAccountFile((req as AuthenticatedRequest).accountId!, paramString(req.params.id));
  res.json({ ok: true });
});

// Same shape as GET /api/uploaded-files/:fileId/content above — real preview
// for My-files items, on the portal and in the kiosk's own Print Order
// Configuration preview. Both send the account's session token; only the
// file's owner gets its bytes.
router.get('/api/account-files/:fileId/content', requireAccountAuth, async (req, res) => {
  const file = await getAccountFile(paramString(req.params.fileId));
  // Someone else's file answers exactly like a missing one.
  if (
    !file ||
    file.status !== 'ready' ||
    file.accountId !== (req as AuthenticatedRequest).accountId
  ) {
    res.status(404).end();
    return;
  }
  const printablePath = resolvePrintablePath(file.absolutePath, file.fileName);
  if (!printablePath) {
    res.status(404).end();
    return;
  }
  res.sendFile(printablePath);
});

// Configures a Print Order for later payment (docs/personal-account-requirements.md,
// "Order status lifecycle") — created in the 'created' state, not paid yet.
// The price is the server's own (src/utils/tariff.ts) from the pages the
// portal counted, the same rule as the kiosk (server/paymentStore.ts) —
// the order is paid for with real money (server/onlineCheckoutStore.ts).
router.post('/api/accounts/orders', requireAccountAuth, async (req, res) => {
  const accountId = (req as AuthenticatedRequest).accountId!;
  const {
    accountFileId,
    fileName,
    paperSize,
    sides,
    color,
    orientation,
    scale,
    pageRange,
    quantity,
    pageCount,
    pagesPerSheet,
  } = (req.body ?? {}) as {
    pageCount?: unknown;
    pagesPerSheet?: unknown;
    accountFileId?: unknown;
    fileName?: unknown;
    paperSize?: unknown;
    sides?: unknown;
    color?: unknown;
    orientation?: unknown;
    scale?: unknown;
    pageRange?: unknown;
    quantity?: unknown;
  };
  if (
    typeof accountFileId !== 'string' ||
    typeof fileName !== 'string' ||
    (paperSize !== 'A4' && paperSize !== 'A5') ||
    !isPaperSizeOffered(paperSize) ||
    (sides !== 'single' && sides !== 'double') ||
    (sides === 'double' && !supportsDuplex(paperSize)) ||
    (color !== 'bw' && color !== 'color') ||
    (orientation !== 'portrait' && orientation !== 'landscape') ||
    (scale !== 'fit' && scale !== 'original') ||
    (pageRange !== undefined && typeof pageRange !== 'string') ||
    typeof quantity !== 'number' ||
    quantity < 1 ||
    !Number.isInteger(quantity) ||
    typeof pageCount !== 'number' ||
    !Number.isInteger(pageCount) ||
    pageCount < 1 ||
    (pagesPerSheet !== undefined && !isPagesPerSheet(pagesPerSheet))
  ) {
    res.status(400).json({ error: 'Invalid order' });
    return;
  }
  const unitPriceCents = unitPriceCentsFor(
    sheetSidesFor(pageCount, pagesPerSheet ?? 1),
    paperSize,
    color,
    sides,
  );
  if (unitPriceCents === null) {
    res.status(400).json({ error: 'No price for this configuration' });
    return;
  }
  const order = await createOrder({
    accountId,
    accountFileId,
    fileName,
    paperSize,
    sides,
    color,
    orientation,
    scale,
    pageRange,
    pagesPerSheet: pagesPerSheet ?? 1,
    quantity,
    unitPriceCents,
  });
  res.status(201).json(order);
});

// Pays a 'created' order online (docs/payments-business-requirements.md,
// "Portal: online payments") — opens the payment page; the order becomes
// 'paid' only once the provider confirms (server/onlineCheckoutStore.ts).
router.post('/api/accounts/orders/:id/pay', requireAccountAuth, async (req, res) => {
  const accountId = (req as AuthenticatedRequest).accountId!;
  try {
    res
      .status(201)
      .json(
        await startOnlineCheckout(
          { accountId, printOrderIds: [paramString(req.params.id)], shopItems: [] },
          { requireVerifiedEmail: false, returnTo: 'portal' },
        ),
      );
  } catch (err) {
    if (err instanceof InvalidPrintOrderError) {
      res
        .status(404)
        .json({ error: 'Order not found, not owned by this account, or already paid' });
      return;
    }
    throw err;
  }
});

// An online payment as its own account sees it — confirmed with the
// provider first while still open. The portal/shop poll this after the
// customer comes back from the payment page.
router.get('/api/online-payments/:id', requireAccountAuth, async (req, res) => {
  const view = await getOnlineCheckoutView(
    paramString(req.params.id),
    (req as AuthenticatedRequest).accountId!,
  );
  if (!view) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }
  res.json(view);
});

// Where the payment page sends the customer back (the Viva payment source's
// Success and Failure URL, or our simulator). The query string is never
// trusted — the payment is confirmed with the provider, then the customer
// goes on to the portal or the shop, which shows the outcome.
router.get('/payments/return', async (req, res) => {
  const orderCode = typeof req.query.s === 'string' && /^\d+$/.test(req.query.s) ? req.query.s : '';
  const paymentId = orderCode ? await findOnlinePaymentByOrderCode(orderCode) : null;
  if (!paymentId) {
    res.redirect(`${portalBaseUrl()}/portal/orders.html`);
    return;
  }
  try {
    await confirmOnlineCheckout(paymentId);
  } catch (err) {
    console.error('[payments] confirm on return failed:', err);
  }
  const view = await getOnlineCheckoutView(paymentId, null);
  // Viva sends the customer here after a failed attempt too, with its
  // event id (e.g. 10051 insufficient funds) — or `cancel` for the Cancel
  // button. Passed on only to tell the customer at once; the payment's own
  // state still comes from Viva (the order stays open for another try).
  const eventId = typeof req.query.eventId === 'string' ? req.query.eventId.replace(/\D/g, '') : '';
  const attempt =
    view?.status === 'paid'
      ? ''
      : req.query.cancel !== undefined
        ? '&attempt=cancelled'
        : eventId && eventId !== '0'
          ? `&attempt=failed&event=${eventId}`
          : '';
  res.redirect(
    view?.returnTo === 'shop'
      ? `${portalBaseUrl()}/shop/?payment=${paymentId}${attempt}`
      : `${portalBaseUrl()}/portal/orders.html?payment=${paymentId}${attempt}`,
  );
});

// The simulated payment page (ONLINE_CHECKOUT unset) — stands in for Viva
// Smart Checkout during development.
router.get('/payments/simulator/:orderCode', (req, res) => {
  if (getOnlineCheckout().provider !== 'simulator') {
    res.status(404).end();
    return;
  }
  const orderCode = paramString(req.params.orderCode).replace(/\D/g, '');
  res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Payment simulator</title>
<style>body{font:16px system-ui,sans-serif;background:#f2f6f5;color:#101817;display:grid;place-items:center;min-height:100vh;margin:0}
main{background:#fff;border:1px solid #d7e0de;padding:24px;max-width:22rem;width:100%;display:grid;gap:12px}
button{font:inherit;padding:12px;border:1px solid #b7c4c1;background:#fff;cursor:pointer}button.pay{background:#0c6e68;color:#fff;border-color:#0c6e68}</style></head>
<body><main><h1>Simulated payment page</h1><p>Stands in for Viva Smart Checkout. Order ${orderCode}.</p>
<form method="post"><input type="hidden" name="outcome" value="paid" /><button class="pay" id="checkout-simulator-pay" type="submit">Pay</button></form>
<form method="post"><input type="hidden" name="outcome" value="cancelled" /><button id="checkout-simulator-cancel" type="submit">Cancel</button></form>
</main></body></html>`);
});

router.post(
  '/payments/simulator/:orderCode',
  express.urlencoded({ extended: false }),
  (req, res) => {
    if (getOnlineCheckout().provider !== 'simulator') {
      res.status(404).end();
      return;
    }
    const orderCode = paramString(req.params.orderCode).replace(/\D/g, '');
    const outcome = (req.body as { outcome?: unknown }).outcome === 'paid' ? 'paid' : 'cancelled';
    simulatorCheckout.settle(orderCode, outcome);
    res.redirect(`/payments/return?s=${orderCode}${outcome === 'cancelled' ? '&cancel=1' : ''}`);
  },
);

// Viva webhooks ("Transaction Payment Created"; set up in the Viva dashboard
// with this URL once deployed). GET is Viva's verification handshake; a POST
// only names the payment — it's confirmed by asking Viva, never from the body.
router.get('/api/payments/webhooks/viva', async (_req, res) => {
  try {
    res.json({ Key: await vivaWebhookKey() });
  } catch (err) {
    console.error('[payments] webhook key failed:', err);
    // The reason only ever names a missing variable or Viva's HTTP status —
    // never a credential — and is what staff need to fix the setup.
    res.status(503).json({ error: err instanceof Error ? err.message : 'Viva unavailable' });
  }
});

router.post('/api/payments/webhooks/viva', async (req, res) => {
  const reference = (req.body as { EventData?: { MerchantTrns?: unknown } } | undefined)?.EventData
    ?.MerchantTrns;
  if (typeof reference === 'string' && /^[0-9a-f-]{36}$/i.test(reference)) {
    try {
      await confirmOnlineCheckout(reference);
    } catch (err) {
      console.error('[payments] webhook confirm failed:', err);
    }
  }
  res.status(200).end();
});

// B2B company-billing portal (business/) — pays a 'created' order by
// billing it to the account's company instead of a real payment. 403s if
// the account isn't an accepted member of any company, rather than silently
// falling through to "order not found" — a genuinely different failure
// (docs, "B2B company-billing portal" plan).
router.post('/api/accounts/orders/:id/pay-company', requireAccountAuth, async (req, res) => {
  const accountId = (req as AuthenticatedRequest).accountId!;
  const membership = await getCompanyForAccount(accountId);
  if (!membership) {
    res.status(403).json({ error: 'Account is not linked to a company' });
    return;
  }
  const order = await payOrderForCompany(
    accountId,
    paramString(req.params.id),
    membership.company.id,
  );
  if (!order) {
    res.status(404).json({ error: 'Order not found, not owned by this account, or already paid' });
    return;
  }
  res.json(order);
});

// Portal-facing: every order for the logged-in account, any status — the
// full "My orders" history (docs/personal-account-requirements.md, "Order
// status lifecycle"). Session-token-authenticated, unlike the kiosk-facing
// read below.
router.get('/api/accounts/orders', requireAccountAuth, async (req, res) => {
  const accountId = (req as AuthenticatedRequest).accountId!;
  res.json(await listOrders(accountId));
});

// Backs the shop checkout's email-verification polling
// (docs/shop-checkout-requirements.md's "Email verification gate") — the checkout
// screen polls this after creating a new account to detect `emailVerified` flipping
// true, without requiring the customer to log in again after clicking the email link.
// Generically useful beyond checkout too (any "who am I" need), not checkout-specific.
router.get('/api/accounts/me', requireAccountAuth, async (req, res) => {
  const accountId = (req as AuthenticatedRequest).accountId!;
  const profile = await getAccountProfile(accountId);
  if (!profile) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.json(profile);
});

// Whether this account can bill jobs to a company — drives the "Bill to
// <Company>" checkout option (business/) and the kiosk's own account
// footer, if it ever needs to show the same thing. Null (not 404) for an
// ordinary account, since "no company" is a normal, expected answer, not
// missing data.
router.get('/api/accounts/me/company', requireAccountAuth, async (req, res) => {
  const accountId = (req as AuthenticatedRequest).accountId!;
  res.json(await getCompanyForAccount(accountId));
});

// business/'s own "Invoices" screen — member-facing read of the same
// company invoices the admin panel manages (server/adminRoutes.ts). 403s
// for a 'member' role, not just an unlinked account: invoices are
// deliberately admin-only within a company (business/InvoicesScreen.tsx).
router.get('/api/accounts/me/company/invoices', requireAccountAuth, async (req, res) => {
  const accountId = (req as AuthenticatedRequest).accountId!;
  const membership = await getCompanyForAccount(accountId);
  if (!membership || membership.role !== 'admin') {
    res.status(403).json({ error: 'Only a company admin can view invoices' });
    return;
  }
  res.json(await listInvoicesForCompany(membership.company.id));
});

// business/?token=... — unauthenticated (the invited person has no session
// yet): the token itself, single-use like email-verification, is the proof
// of identity. Sets the invited person's real password (their account was
// created with an unusable random one, server/companyStore.ts's
// inviteCompanyMember) and marks the invite accepted in one step, then logs
// them straight in — same "don't make them log in again right after" call
// already made for the shop's own email-verification gate
// (docs/shop-checkout-requirements.md).
router.post('/api/companies/accept-invite', async (req, res) => {
  const { token, password } = (req.body ?? {}) as { token?: unknown; password?: unknown };
  if (typeof token !== 'string' || typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'A token and an 8+ character password are required' });
    return;
  }
  const accountId = await consumeAccountToken(token, 'company-invite');
  if (!accountId) {
    res.status(400).json({ error: 'Invite link is invalid or has expired' });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await updateAccountPassword(accountId, passwordHash);
  await acceptCompanyInvite(accountId);
  const profile = await getAccountProfile(accountId);
  const sessionToken = await createAccountToken(accountId, 'session', SESSION_TOKEN_EXPIRY_MS);
  res.json({ accountId, email: profile?.email ?? '', sessionToken });
});

// Optional invoice details (docs/shop-checkout-requirements.md) — reachable both from
// the shop checkout and from account settings, both write to the same two columns.
router.patch('/api/accounts/invoice-details', requireAccountAuth, async (req, res) => {
  const accountId = (req as AuthenticatedRequest).accountId!;
  const { invoiceCompanyName, invoiceTaxId } = (req.body ?? {}) as {
    invoiceCompanyName?: unknown;
    invoiceTaxId?: unknown;
  };
  if (
    (invoiceCompanyName !== undefined &&
      invoiceCompanyName !== null &&
      typeof invoiceCompanyName !== 'string') ||
    (invoiceTaxId !== undefined && invoiceTaxId !== null && typeof invoiceTaxId !== 'string')
  ) {
    res.status(400).json({ error: 'Invalid invoice details' });
    return;
  }
  await updateInvoiceDetails(accountId, {
    invoiceCompanyName: invoiceCompanyName ?? null,
    invoiceTaxId: invoiceTaxId ?? null,
  });
  res.json({ ok: true });
});

// Shop catalog (docs/shop-requirements.md) — public, no auth, same as the
// kiosk's other read-only catalog-shaped endpoints.
router.get('/api/shop/products', async (_req, res) => {
  res.json(await listActiveProducts());
});

// Photo kiosk's document-photo picker (docs/photo-kiosk-requirements.md's "Выбрать
// страну" screen) — public, no auth, same reasoning as the shop catalog above: this
// is read-only reference data, not anything account-specific.
router.get('/api/photo-countries', async (_req, res) => {
  res.json(await listCountries());
});

router.get('/api/photo-countries/:id/documents', async (req, res) => {
  res.json(await listActiveDocumentsForCountry(paramString(req.params.id)));
});

router.get('/api/photo-documents/:id', async (req, res) => {
  const document = await getPhotoDocument(paramString(req.params.id));
  if (!document) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.json(document);
});

// Photo kiosk order fact-of-purchase (docs/domain/kiosk-session.md's "delete the
// file content, retain the metadata/fact" principle, applied to photos) — public,
// no auth, same as the other photo-kiosk routes above. Records metadata only; no
// photo content is ever sent here, since A4 composition happens entirely
// client-side (photo privacy is confirmed more sensitive than document privacy).
router.post('/api/photo-orders', requireStand, async (req, res) => {
  const body = req.body as {
    sessionId?: unknown;
    spec?: { label?: unknown; widthMm?: unknown; heightMm?: unknown; dpi?: unknown };
    shotCount?: unknown;
    quantity?: unknown;
    amountCents?: unknown;
  } | null;
  const spec = body?.spec;
  if (
    typeof spec?.label !== 'string' ||
    typeof spec?.widthMm !== 'number' ||
    typeof spec?.heightMm !== 'number' ||
    typeof body?.shotCount !== 'number' ||
    typeof body?.quantity !== 'number' ||
    typeof body?.amountCents !== 'number'
  ) {
    res.status(400).json({ error: 'Invalid photo order' });
    return;
  }
  const order = await recordPhotoOrder({
    sessionId: typeof body?.sessionId === 'string' ? body.sessionId : null,
    specLabel: spec.label,
    specWidthMm: spec.widthMm,
    specHeightMm: spec.heightMm,
    specDpi: typeof spec.dpi === 'number' ? spec.dpi : null,
    shotCount: body.shotCount,
    quantity: body.quantity,
    amountCents: body.amountCents,
  });
  res.status(201).json(order);
});

router.post('/api/photo-orders/printed', requireStand, async (req, res) => {
  const { ids } = (req.body ?? {}) as { ids?: unknown };
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
    res.status(400).json({ error: 'Invalid ids' });
    return;
  }
  await markPhotoOrdersPrinted(ids);
  res.json({ ok: true });
});

// "Send me a copy" (docs/photo-kiosk-requirements.md) — a deliberate, narrow
// exception to the "no photo pixel data server-side" rule above; see
// server/photoShareStore.ts's own comment for why and how it's kept narrow.
// memoryStorage (not the diskStorage every other upload() instance in this
// file uses) so the photo bytes never touch disk even transiently.
const photoShareUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post(
  '/api/photo-kiosk/share-email',
  requireStand,
  emailSendRateLimiter,
  photoShareUpload.single('photo'),
  async (req, res) => {
    const { email } = (req.body ?? {}) as { email?: unknown };
    if (typeof email !== 'string' || !email.includes('@') || !req.file) {
      res.status(400).json({ error: 'A valid email and photo are required' });
      return;
    }
    try {
      await sendPhotoEmail(email, req.file.buffer, 'photo.jpg');
    } catch (err) {
      console.error('[routes] sendPhotoEmail failed:', err);
      void reportIncident({
        source: 'backend',
        code: 'backend.email-send-failed',
        severity: 'warning',
        message: `Failed to send photo to ${email}.`,
        context: { email, error: String(err) },
      });
      res.status(502).json({ error: 'Failed to send the email. Please try again.' });
      return;
    }
    res.json({ ok: true });
  },
);

router.post(
  '/api/photo-kiosk/share-link',
  requireStand,
  photoShareUpload.single('photo'),
  (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'A photo is required' });
      return;
    }
    const token = createShare(req.file.buffer, req.file.mimetype);
    res.json({ token });
  },
);

// One-time download — consumeShare deletes the entry whether this succeeds
// or the token was already used/expired, so a link never serves twice.
router.get('/api/photo-kiosk/share-link/:token', (req, res) => {
  const entry = consumeShare(paramString(req.params.token));
  if (!entry) {
    res.status(404).send('Ссылка недействительна или уже использована');
    return;
  }
  res.setHeader('Content-Type', entry.mimeType);
  res.setHeader('Content-Disposition', 'attachment; filename="photo.jpg"');
  res.send(entry.buffer);
});

// "AI бэкграунд" (docs/photo-kiosk-requirements.md) — a SECOND, much less
// narrow exception to the "no photo pixel data server-side" rule above
// (confirmed accepted 2026-09-16, scoped only to this optional/decorative
// branch): the shot is forwarded to Google's Nano Banana Pro API
// (aiBackgroundCompositor.ts, which also owns the look catalog, the
// per-look reference image, and the per-look prompt) for real generative
// compositing, not just held in server memory like "send me a copy"
// above. memoryStorage still applies — the shot is never written to disk
// here either.
const aiBackgroundUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post(
  '/api/photo-kiosk/ai-background',
  requireStand,
  aiBackgroundUpload.single('shot'),
  async (req, res) => {
    const { lookId } = (req.body ?? {}) as { lookId?: unknown };
    if (!req.file || typeof lookId !== 'string') {
      res.status(400).json({ error: 'A valid lookId and shot are required' });
      return;
    }
    try {
      const result = await compositeViaNanoBanana(
        lookId,
        req.file.buffer.toString('base64'),
        req.file.mimetype,
      );
      if (!result) {
        res.status(503).json({ error: 'AI compositing is not available right now' });
        return;
      }
      res.json(result);
    } catch (err) {
      console.error('[routes] compositeViaNanoBanana failed:', err);
      void reportIncident({
        source: 'backend',
        code: 'backend.ai-background-compositing-failed',
        severity: 'warning',
        message: 'Nano Banana compositing failed.',
        context: { lookId, error: String(err) },
      });
      res.status(502).json({ error: 'AI compositing failed. Please try again.' });
    }
  },
);

// Portal-facing "My orders" for the staff-fulfilled half of the shop
// (docs/shop-checkout-requirements.md) — session-token-authenticated like the
// account's print-order history, never exposed on the accountId-only kiosk reads.
router.get('/api/accounts/shop-orders', requireAccountAuth, async (req, res) => {
  const accountId = (req as AuthenticatedRequest).accountId!;
  res.json(await listShopOrders(accountId));
});

// Shop checkout (docs/shop-checkout-requirements.md) — one payment for the whole
// cart, split server-side into the printOrders rows being paid (self-service) and/or
// a new shopOrders row (staff-fulfilled). Account required (requireAccountAuth) per
// the confirmed "no guest checkout" decision.
router.post('/api/shop/checkout', requireAccountAuth, async (req, res) => {
  const accountId = (req as AuthenticatedRequest).accountId!;
  const { printOrderIds, shopItems } = (req.body ?? {}) as {
    printOrderIds?: unknown;
    shopItems?: unknown;
  };
  if (
    !Array.isArray(printOrderIds) ||
    !printOrderIds.every((id) => typeof id === 'string') ||
    !Array.isArray(shopItems) ||
    !shopItems.every(
      (item): item is { productId: string; quantity: number } =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { productId?: unknown }).productId === 'string' &&
        typeof (item as { quantity?: unknown }).quantity === 'number',
    )
  ) {
    res.status(400).json({ error: 'Invalid checkout request' });
    return;
  }
  try {
    res
      .status(201)
      .json(
        await startOnlineCheckout(
          { accountId, printOrderIds, shopItems },
          { requireVerifiedEmail: true, returnTo: 'shop' },
        ),
      );
  } catch (err) {
    if (err instanceof EmptyCheckoutError) {
      res.status(400).json({ error: 'Cart is empty' });
    } else if (err instanceof EmailNotVerifiedError) {
      res.status(403).json({ error: 'Email must be verified before checkout can complete' });
    } else if (err instanceof InvalidPrintOrderError || err instanceof InvalidProductError) {
      res.status(400).json({ error: (err as Error).message });
    } else {
      throw err;
    }
  }
});

// Kiosk-facing reads for My files/My orders. The kiosk keeps the session
// token its login returned (src/App.tsx) for exactly this — an account id
// alone is not proof of anything.
router.get('/api/accounts/:accountId/files', requireOwnAccount, async (req, res) => {
  res.json(await listAccountFiles(paramString(req.params.accountId)));
});

router.get('/api/accounts/:accountId/folders', requireOwnAccount, async (req, res) => {
  res.json(await listFolders(paramString(req.params.accountId)));
});

// The kiosk's My orders stays scoped to "paid, awaiting print" only — not
// the portal's full order history (docs/personal-account-requirements.md,
// "Two separate surfaces" and "Order status lifecycle").
router.get('/api/accounts/:accountId/orders', requireOwnAccount, async (req, res) => {
  const orders = await listOrders(paramString(req.params.accountId));
  res.json(orders.filter((order) => order.status === 'paid'));
});

// Print Tasks (docs/domain/kiosk-session.md, "Related entities" — "the
// execution unit that actually drives the physical printer"). Only
// job-submission is real (server/printerAdapter.ts); a plain OS print API
// gives no reliable in-progress signal, so jam/out-of-paper/out-of-ink stay
// manual "Simulate ..." outcomes below — both paths update the same record,
// so the frontend only ever reacts to real status, never to how it got there.
// Short, printable stand labels only ('A', 'B', 'stand-2') — it's shown to
// staff in the admin panel, so nothing longer or stranger is stored.
const STAND_ID_PATTERN = /^[A-Za-z0-9-]{1,16}$/;

/** A print task as the stand sees it: plus the refund of its payment item,
 * if printing failed (docs/payments-business-requirements.md, "When
 * printing fails"), so Print Status can tell the customer. */
async function withRefund<T extends { id: string }>(task: T | null) {
  return task ? { ...task, refund: await getRefundForPrintTask(task.id) } : task;
}

// The customer's eKasa receipt (docs/payments-business-requirements.md,
// "Receipts") — what the stand's QR code and the receipt e-mail open. A
// capability link by receipt id, like the phone upload pages.
router.get('/receipts/:id', async (req, res) => {
  const id = paramString(req.params.id);
  const receipt = /^[0-9a-f-]{36}$/i.test(id) ? await getReceipt(id) : null;
  if (!receipt || (receipt.status !== 'registered' && receipt.status !== 'registered-offline')) {
    res.status(404).type('html').send(renderReceiptPage(null, null));
    return;
  }
  const verification = receipt.receiptUid ?? receipt.okp ?? '';
  const qrDataUrl = verification ? await QRCode.toDataURL(verification, { margin: 1 }) : null;
  res.type('html').send(renderReceiptPage(receipt, qrDataUrl));
});

// Kiosk card payments (docs/payments-technical-requirements.md, "API").
// The stand sends what is being bought; the server prices it and runs the
// terminal sale. 204 = nothing to pay (everything was paid in advance).
router.post('/api/payments', requireStand, async (req, res) => {
  const { sessionId, standId, items } = (req.body ?? {}) as {
    sessionId?: unknown;
    standId?: unknown;
    items?: unknown;
  };
  // The stand's Cart already refuses while printing or receipts are
  // impossible (GET /api/printer-status); this is the server's own check, so
  // nobody is charged for something that can't be delivered.
  const blockers = paymentBlockers();
  if (blockers.agentOnline === false || blockers.problems.length > 0) {
    res.status(409).json({ error: 'Payments are unavailable right now', ...blockers });
    return;
  }
  try {
    const payment = await createKioskPayment({
      sessionId: typeof sessionId === 'string' ? sessionId : null,
      standId:
        (req as StandRequest).standId ??
        (typeof standId === 'string' && STAND_ID_PATTERN.test(standId) ? standId : null),
      items: Array.isArray(items) ? items : [],
    });
    if (!payment) {
      res.status(204).end();
      return;
    }
    res.status(201).json(payment);
  } catch (error) {
    if (error instanceof PaymentInputError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.get('/api/payments/:id', requireStand, async (req, res) => {
  const payment = await refreshPayment(paramString(req.params.id));
  if (!payment) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }
  res.json(payment);
});

router.post('/api/payments/:id/cancel', requireStand, async (req, res) => {
  const payment = await cancelPayment(paramString(req.params.id));
  if (!payment) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }
  res.json(payment);
});

router.post('/api/payments/:id/receipt', requireStand, async (req, res) => {
  const { via, email } = (req.body ?? {}) as { via?: unknown; email?: unknown };
  if (via !== 'qr' && via !== 'email' && via !== 'paper') {
    res.status(400).json({ error: 'Unknown receipt delivery' });
    return;
  }
  const address = typeof email === 'string' ? email.trim() : '';
  if (via === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    res.status(400).json({ error: 'Invalid e-mail address' });
    return;
  }
  const payment = await setReceiptDelivery(
    paramString(req.params.id),
    via,
    via === 'email' ? address : null,
  );
  if (!payment) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }
  res.json(payment);
});

// "Simulate …" terminal outcomes — only while the terminal itself is the
// simulator (PAYMENT_TERMINAL unset), so a real terminal can't be faked.
router.post('/api/payments/:id/simulate', requireStand, async (req, res) => {
  if (getPaymentTerminal().provider !== 'simulator') {
    res.status(403).json({ error: 'Simulated payment outcomes are disabled' });
    return;
  }
  const { outcome } = (req.body ?? {}) as { outcome?: unknown };
  if (
    outcome !== 'paid' &&
    outcome !== 'declined' &&
    outcome !== 'cancelled-on-terminal' &&
    outcome !== 'failed'
  ) {
    res.status(400).json({ error: 'Unknown outcome' });
    return;
  }
  const sessionId = await getProviderSessionId(paramString(req.params.id));
  if (!sessionId || !simulatorTerminal.simulate(sessionId, outcome)) {
    res.status(409).json({ error: 'Payment is not waiting for a card' });
    return;
  }
  res.json(await refreshPayment(paramString(req.params.id)));
});

router.post('/api/print-tasks', requireStand, async (req, res) => {
  const {
    sessionId,
    fileId,
    sourceFileOrigin,
    printOrderId,
    paperSize,
    sides,
    color,
    copies,
    orientation,
    scale,
    pages,
    standId,
    pagesPerSheet,
  } = (req.body ?? {}) as {
    pagesPerSheet?: unknown;
    standId?: unknown;
    sessionId?: unknown;
    fileId?: unknown;
    sourceFileOrigin?: unknown;
    printOrderId?: unknown;
    paperSize?: unknown;
    sides?: unknown;
    color?: unknown;
    copies?: unknown;
    orientation?: unknown;
    scale?: unknown;
    pages?: unknown;
  };
  const resolvedSessionId = typeof sessionId === 'string' ? sessionId : null;
  const resolvedStandId =
    (req as StandRequest).standId ??
    (typeof standId === 'string' && STAND_ID_PATTERN.test(standId) ? standId : null);
  const { paymentItemId } = req.body as { paymentItemId?: unknown };

  // Nothing prints unpaid (docs/payments-technical-requirements.md,
  // "Principles" 3): a paid payment item prints exactly once, with the
  // settings that were paid for; a portal order paid in advance prints at
  // most the copies it covers. A repeated submission gets its task back.
  if (typeof paymentItemId === 'string') {
    const claim = await claimPaymentItemForPrint(paymentItemId);
    if (claim.kind === 'not-paid') {
      res.status(402).json({ error: 'This item has not been paid for' });
      return;
    }
    if (claim.kind === 'already-printing') {
      res.json(await withRefund(await getPrintTask(claim.taskId)));
      return;
    }
    const paid = claim.config;
    const task = await createPrintTask(
      resolvedSessionId,
      paid.sourcePaidOrderId,
      {
        fileId: paid.fileId,
        sourceFileOrigin: paid.sourceFileOrigin === 'account' ? 'account' : undefined,
        paperSize: paid.paperSize,
        sides: paid.sides,
        color: paid.color,
        orientation: paid.orientation,
        scale: paid.scale,
        pages: paid.pages,
        pagesPerSheet: isPagesPerSheet(paid.pagesPerSheet) ? paid.pagesPerSheet : undefined,
        copies: paid.quantity,
      },
      resolvedStandId,
      claim.taskId,
    );
    res.status(201).json(await withRefund(await tryPrintTask(task.id, resolvedSessionId)));
    return;
  }
  if (typeof printOrderId !== 'string') {
    res.status(402).json({ error: 'Payment required' });
    return;
  }
  const existing = await findActiveTaskForPrintOrder(printOrderId);
  if (existing) {
    res.json(existing);
    return;
  }
  const paidCopies = await paidOrderQuantity(printOrderId);
  if (paidCopies === null) {
    res.status(402).json({ error: 'This order is not awaiting print' });
    return;
  }

  const options: PrintOptions = {
    fileId: typeof fileId === 'string' ? fileId : undefined,
    sourceFileOrigin: sourceFileOrigin === 'account' ? 'account' : undefined,
    paperSize: typeof paperSize === 'string' ? paperSize : undefined,
    sides: sides === 'double' ? 'double' : sides === 'single' ? 'single' : undefined,
    color: color === 'bw' ? 'bw' : color === 'color' ? 'color' : undefined,
    orientation:
      orientation === 'portrait' || orientation === 'landscape' ? orientation : undefined,
    scale: scale === 'fit' ? 'fit' : scale === 'original' ? 'original' : undefined,
    pages: typeof pages === 'string' ? pages : undefined,
    pagesPerSheet: isPagesPerSheet(pagesPerSheet) ? pagesPerSheet : undefined,
    copies: Math.min(typeof copies === 'number' ? copies : paidCopies, paidCopies),
  };

  const task = await createPrintTask(resolvedSessionId, printOrderId, options, resolvedStandId);
  // Pavilion launch plan (2026-09-16): two stands share one printer feeding
  // a 4-bin mailbox (server/pickupBins.ts) — a task only actually prints
  // once a bin is free. If all four are occupied right now, this call is a
  // no-op that leaves the task 'queued' with no bin; GET /api/print-tasks/:id's
  // own poll below retries it, so the kiosk's existing polling loop is what
  // eventually gets it printed once space opens, with no separate
  // background worker needed.
  res.status(201).json(await tryPrintTask(task.id, resolvedSessionId));
});

router.get('/api/print-tasks/:id', requireStand, async (req, res) => {
  const id = paramString(req.params.id);
  const beforeRetry = await getPrintTask(id);
  if (!beforeRetry) {
    res.status(404).json({ error: 'Print task not found' });
    return;
  }
  const task = await tryPrintTask(id, null);
  res.json(await withRefund(task));
});

// Confirms a customer (or staff) actually took their printout from its
// assigned mailbox bin — no sensor exists on the real hardware to detect
// this automatically (server/pickupBins.ts). Deliberately does NOT try to
// eagerly advance whichever task is "next in line" for the freed bin: with
// no way to tell a genuinely still-active waiting customer apart from a
// long-abandoned queued row (e.g. a request whose client vanished mid-flow),
// a global "oldest queued task" sweep can hijack the freed bin for a stale
// task nobody will ever confirm pickup for, permanently squatting on it
// instead. Each real waiting task's own GET /api/print-tasks/:id poll
// (already happening every few seconds from PrintStatusScreen.tsx) already
// retries tryPrintTask for exactly that task and no other, so the freed bin
// still reaches the right customer within one poll interval.
router.post('/api/print-tasks/:id/picked-up', requireStand, async (req, res) => {
  const id = paramString(req.params.id);
  const task = await getPrintTask(id);
  if (!task) {
    res.status(404).json({ error: 'Print task not found' });
    return;
  }
  await markPrintTaskPickedUp(id);
  res.json(await getPrintTask(id));
});

const SIMULATABLE_OUTCOMES = ['success', 'paper-jam', 'out-of-paper', 'out-of-ink'] as const;
type SimulatableOutcome = (typeof SIMULATABLE_OUTCOMES)[number];

router.post(
  '/api/print-tasks/:id/simulate',
  requireStand,
  requireSimulationAllowed,
  async (req, res) => {
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
    res.json(await withRefund(task));
  },
);

// Phone-Camera Scan (docs/scan-upload-requirements.md, docs/screens/scan-spec.md)
// — same anonymous, session-scoped architecture as QR upload: the kiosk
// creates a scan session and shows its id as a QR code, the phone-facing
// page (server/scanPhoneApp.ts, not yet built) uploads photo+corners here,
// and the kiosk polls GET /api/scan-sessions/:id (scan-status,
// docs/screens/scan-spec.md) the same 3s-interval way QR upload already does.
router.post('/api/scan-sessions', requireStand, async (req, res) => {
  const { sessionId } = (req.body ?? {}) as { sessionId?: unknown };
  if (typeof sessionId !== 'string' || !sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }
  res.status(201).json(await createScanSession(sessionId));
});

router.get('/api/scan-sessions/:id', async (req, res) => {
  const scanSessionId = paramString(req.params.id);
  const scanSession = await getScanSession(scanSessionId);
  if (!scanSession) {
    res.status(404).json({ error: 'Scan session not found' });
    return;
  }
  res.json({ ...scanSession, pages: await listPages(scanSessionId) });
});

// Phone-facing entry point for `scan-qr-code` (docs/screens/scan-spec.md) —
// same "served directly by this backend, no CORS needed" reasoning as
// /upload/:sessionId above.
router.get('/scan/:id', async (req, res) => {
  const scanSessionId = paramString(req.params.id);
  const scanSession = await getScanSession(scanSessionId);
  if (!scanSession) {
    res.status(404).send('Scan session not found.');
    return;
  }
  const portalUrl = portalBaseUrl();
  res.type('html').send(renderScanPhoneApp(scanSessionId, portalUrl));
});

// Separate multer instance from the others above — destination is
// server/scanStore.ts's scansDir, keyed by scan session id, and there's no
// format restriction beyond "an image" (this is always a phone camera
// capture, never an arbitrary file picker).
const scanUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, callback) => {
      const dir = join(scansDir, paramString(req.params.id));
      mkdirSync(dir, { recursive: true });
      callback(null, dir);
    },
    filename: (_req, _file, callback) => {
      callback(null, `raw-${randomUUID()}.jpg`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    callback(null, file.mimetype.startsWith('image/'));
  },
});

function handleScanPhotoUpload(req: Request, res: Response, next: NextFunction) {
  scanUpload.single('photo')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res
        .status(400)
        .json({ error: `File is too large — maximum size is ${MAX_FILE_SIZE_MB} MB.` });
    } else if (err) {
      next(err);
    } else {
      next();
    }
  });
}

// Separate multer instance again — this one's uploads are ephemeral (used
// once for detection, then deleted), so it writes to the OS temp dir
// instead of scansDir, keeping scan sessions' real directories limited to
// files that are actually part of the finished document.
const detectUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, tmpdir()),
    filename: (_req, _file, callback) => callback(null, `scan-detect-${randomUUID()}.jpg`),
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    callback(null, file.mimetype.startsWith('image/'));
  },
});

// P1->P2 best-effort corner auto-detection (docs/screens/scan-spec.md,
// server/documentCornerDetector.ts) — the phone uploads its just-taken
// photo here before showing the draggable corner UI, gets back a suggested
// quad (or null), and always deletes this temp copy immediately after: it's
// never part of the scan session's own record, only the later confirmed
// upload to POST /api/scan-sessions/:id/pages is.
router.post(
  '/api/scan-sessions/:id/detect-corners',
  uploadRateLimiter,
  (req, res, next) => {
    detectUpload.single('photo')(req, res, (err: unknown) => {
      if (err) {
        next(err);
      } else {
        next();
      }
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'A photo is required' });
      return;
    }
    try {
      const corners = await detectDocumentCorners(req.file.path);
      res.json({ corners });
    } catch (err) {
      // Logged, not swallowed — a live bug report ("corners always default,
      // never match the real photo") turned out to be impossible to diagnose
      // without server-side visibility into *why* detection was failing
      // (OpenCV.js's WASM init is memory-hungry; this project's own README
      // already notes the default Railway plan's 1GB limit isn't enough for
      // ClamAV's signature DB, so the same class of failure is plausible
      // here too).
      console.error('[routes] detectDocumentCorners failed:', err);
      res.status(500).json({ error: 'Corner detection failed' });
    } finally {
      await unlink(req.file.path).catch(() => {});
    }
  },
);

// `corners` arrives as a JSON-encoded string (multipart form field, not a
// JSON body) — P2's four confirmed points, `docs/screens/scan-spec.md`'s
// `scan-corner-handle-tl/-tr/-br/-bl`, in that tl/tr/br/bl order.
function parseCorners(raw: unknown): Corners | null {
  if (typeof raw !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 4) return null;
  const points = parsed.map((entry) => {
    const point = entry as { x?: unknown; y?: unknown } | null;
    return point && typeof point.x === 'number' && typeof point.y === 'number'
      ? { x: point.x, y: point.y }
      : null;
  });
  return points.every((point) => point !== null) ? (points as Corners) : null;
}

router.post(
  '/api/scan-sessions/:id/pages',
  uploadRateLimiter,
  handleScanPhotoUpload,
  async (req, res) => {
    const scanSessionId = paramString(req.params.id);
    const corners = parseCorners(req.body.corners);
    if (!req.file || !corners) {
      if (req.file) await unlink(req.file.path).catch(() => {});
      res.status(400).json({ error: 'A photo and four corner points are required' });
      return;
    }
    const existingPages = await listPages(scanSessionId);
    res
      .status(201)
      .json(await addPage(scanSessionId, existingPages.length + 1, req.file.path, corners));
  },
);

// Real preview for P3's scan-page-preview / the thumbnail strip — same
// content-endpoint shape as GET /api/uploaded-files/:fileId/content.
router.get('/api/scan-sessions/:id/pages/:pageId/content', async (req, res) => {
  const path = await getProcessedPagePath(
    paramString(req.params.id),
    paramString(req.params.pageId),
  );
  if (!path) {
    res.status(404).end();
    return;
  }
  res.sendFile(path);
});

// P4's `scan-deliver-done` — combines every ready page into one PDF, then
// fans out to whichever method(s) were checked. `scan-deliver-account`
// requires an Authorization: Bearer session token (same requireSession as
// change-password above) — enforced here, not just on the phone UI, since
// the phone-facing page is a separate untrusted client.
router.post('/api/scan-sessions/:id/deliver', emailSendRateLimiter, async (req, res) => {
  const scanSessionId = paramString(req.params.id);
  const { methods, email } = (req.body ?? {}) as { methods?: unknown; email?: unknown };
  if (
    !Array.isArray(methods) ||
    methods.length === 0 ||
    !methods.every((method) => method === 'email' || method === 'link' || method === 'account')
  ) {
    res.status(400).json({ error: 'At least one valid delivery method is required' });
    return;
  }
  if (methods.includes('email') && (typeof email !== 'string' || !email.includes('@'))) {
    res.status(400).json({ error: 'A valid email is required for email delivery' });
    return;
  }
  let account: Awaited<ReturnType<typeof requireSession>> = null;
  if (methods.includes('account')) {
    account = await requireSession(req);
    if (!account) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
  }

  let pdfPath: string;
  try {
    pdfPath = await combineToPdf(scanSessionId);
  } catch (err) {
    if (err instanceof NoReadyPagesError) {
      res.status(400).json({ error: 'No pages are ready yet' });
      return;
    }
    throw err;
  }
  const pdfBuffer = await readFile(pdfPath);

  if (methods.includes('email')) {
    try {
      await sendScanEmail(email as string, pdfBuffer);
    } catch (err) {
      console.error('[routes] sendScanEmail failed:', err);
      void reportIncident({
        source: 'backend',
        code: 'backend.email-send-failed',
        severity: 'warning',
        message: `Failed to send scanned document to ${email as string}.`,
        context: { email, scanSessionId, error: String(err) },
      });
      res.status(502).json({ error: 'Failed to send the email. Please try again.' });
      return;
    }
  }

  let accountFileId: string | null = null;
  if (methods.includes('account') && account) {
    const accountDir = join(accountUploadsDir, account.id);
    mkdirSync(accountDir, { recursive: true });
    const accountCopyPath = join(accountDir, `scan-${scanSessionId}.pdf`);
    await writeFile(accountCopyPath, pdfBuffer);
    try {
      const file = await addAccountFile(
        account.id,
        `Scan ${new Date().toISOString().slice(0, 10)}.pdf`,
        accountCopyPath,
        pdfBuffer.length,
      );
      accountFileId = file.id;
    } catch (err) {
      // addAccountFile already wrote accountCopyPath before validating quota
      // — clean it up on rejection rather than leaving an orphaned file,
      // same pattern as POST /api/accounts/files above.
      await unlink(accountCopyPath).catch(() => {});
      if (err instanceof AccountStorageQuotaExceededError) {
        res.status(400).json({ error: 'Storage quota exceeded for this account.' });
        return;
      }
      throw err;
    }
  }

  await markDelivered(
    scanSessionId,
    methods,
    methods.includes('email') ? (email as string) : null,
    accountFileId,
  );
  res.json({ ok: true });
});

// P5/"download link" delivery — same unguessable-UUID posture the requirements
// doc calls for (docs/scan-upload-requirements.md, "Retention"): the scan
// session id itself already is that token, so no separate one is needed.
router.get('/api/scan-sessions/:id/download', (req, res) => {
  const path = finalPdfPath(paramString(req.params.id));
  if (!existsSync(path)) {
    res.status(404).end();
    return;
  }
  res.download(path, 'scan.pdf');
});

// Copy (docs/copy-upload-requirements.md, docs/screens/copy-spec.md) —
// reuses Scan's own capture architecture (anonymous, session-scoped QR
// flow, same server-side warp/cleanup pipeline) but has no delivery step;
// see server/copyStore.ts's own header comment for why there's no
// deliver/download route here the way Scan has one.
router.post('/api/copy-sessions', requireStand, async (req, res) => {
  const { sessionId } = (req.body ?? {}) as { sessionId?: unknown };
  if (typeof sessionId !== 'string' || !sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }
  res.status(201).json(await createCopySession(sessionId));
});

router.get('/api/copy-sessions/:id', async (req, res) => {
  const copySessionId = paramString(req.params.id);
  const copySession = await getCopySession(copySessionId);
  if (!copySession) {
    res.status(404).json({ error: 'Copy session not found' });
    return;
  }
  res.json({ ...copySession, pages: await listCopyPages(copySessionId) });
});

// Phone-facing entry point for `copy-qr-code` (docs/screens/copy-spec.md) —
// same "served directly by this backend, no CORS needed" reasoning as
// /scan/:id above.
router.get('/copy/:id', async (req, res) => {
  const copySessionId = paramString(req.params.id);
  const copySession = await getCopySession(copySessionId);
  if (!copySession) {
    res.status(404).send('Copy session not found.');
    return;
  }
  res.type('html').send(renderCopyPhoneApp(copySessionId));
});

// Separate multer instances, mirroring the scan ones above exactly (own
// destination directories, same size/format rules) — see those for the
// reasoning behind each.
const copyUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, callback) => {
      const dir = join(copiesDir, paramString(req.params.id));
      mkdirSync(dir, { recursive: true });
      callback(null, dir);
    },
    filename: (_req, _file, callback) => {
      callback(null, `raw-${randomUUID()}.jpg`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    callback(null, file.mimetype.startsWith('image/'));
  },
});

function handleCopyPhotoUpload(req: Request, res: Response, next: NextFunction) {
  copyUpload.single('photo')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res
        .status(400)
        .json({ error: `File is too large — maximum size is ${MAX_FILE_SIZE_MB} MB.` });
    } else if (err) {
      next(err);
    } else {
      next();
    }
  });
}

const copyDetectUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, tmpdir()),
    filename: (_req, _file, callback) => callback(null, `copy-detect-${randomUUID()}.jpg`),
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    callback(null, file.mimetype.startsWith('image/'));
  },
});

// Same detection function as /api/scan-sessions/:id/detect-corners
// (server/documentCornerDetector.ts) — stateless image processing, no
// coupling to either store, so both routes share it directly rather than
// duplicating the call.
router.post(
  '/api/copy-sessions/:id/detect-corners',
  uploadRateLimiter,
  (req, res, next) => {
    copyDetectUpload.single('photo')(req, res, (err: unknown) => {
      if (err) {
        next(err);
      } else {
        next();
      }
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'A photo is required' });
      return;
    }
    try {
      const corners = await detectDocumentCorners(req.file.path);
      res.json({ corners });
    } catch (err) {
      console.error('[routes] detectDocumentCorners (copy) failed:', err);
      res.status(500).json({ error: 'Corner detection failed' });
    } finally {
      await unlink(req.file.path).catch(() => {});
    }
  },
);

router.post(
  '/api/copy-sessions/:id/pages',
  uploadRateLimiter,
  handleCopyPhotoUpload,
  async (req, res) => {
    const copySessionId = paramString(req.params.id);
    const corners = parseCorners(req.body.corners);
    if (!req.file || !corners) {
      if (req.file) await unlink(req.file.path).catch(() => {});
      res.status(400).json({ error: 'A photo and four corner points are required' });
      return;
    }
    const existingPages = await listCopyPages(copySessionId);
    res
      .status(201)
      .json(await addCopyPage(copySessionId, existingPages.length + 1, req.file.path, corners));
  },
);

router.get('/api/copy-sessions/:id/pages/:pageId/content', async (req, res) => {
  const path = await getProcessedCopyPagePath(
    paramString(req.params.id),
    paramString(req.params.pageId),
  );
  if (!path) {
    res.status(404).end();
    return;
  }
  res.sendFile(path);
});

// `copy-finish` (docs/screens/copy-spec.md) — combines every ready page
// into one PDF and hands it to the real, session-scoped upload store
// (server/uploadStore.ts), exactly as server/copyStore.ts's own
// finishCopySession describes. No method choice, no auth — unlike Scan's
// /deliver, there's nothing to choose here.
router.post('/api/copy-sessions/:id/finish', async (req, res) => {
  const copySessionId = paramString(req.params.id);
  try {
    const result = await finishCopySession(copySessionId);
    res.json(result);
  } catch (err) {
    if (err instanceof NoReadyCopyPagesError) {
      res.status(400).json({ error: 'No pages are ready yet' });
      return;
    }
    throw err;
  }
});
