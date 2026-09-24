import { Resend } from 'resend';
import { getLanIPv4 } from './lanIp.js';

// Sends account-lifecycle emails (verification, password reset) via Resend
// — see README.md, "Portal," for domain-verification setup. Dev fallback:
// if RESEND_API_KEY isn't set, logs the link to the console instead of
// sending, matching the project's existing graceful-local-fallback pattern
// (LAN-IP detection, ClamAV fail-open) — no real Resend account needed for
// local testing.

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'noreply@kiosk.example';
// Falls back to this dev machine's LAN IP (not `localhost`) — the console-
// logged link is meant to be opened on whatever device is testing the flow,
// which during local kiosk testing is commonly a phone (a separate device),
// same reasoning as GET /api/config's portalUrl (server/routes.ts).
const PORTAL_URL = process.env.PORTAL_URL ?? `http://${getLanIPv4()}:5173`;

// The SDK does NOT throw on an API-level failure (a rejected recipient, a
// domain-verification issue, etc.) — it resolves normally with `{ data:
// null, error }`. Every send helper in this file checks `error` explicitly
// (confirmed via a real Resend rejection during photo-kiosk testing —
// nothing here threw, so a caller's try/catch never saw it) — without that
// check, a failed send is silently reported as a success.
async function sendEmail(to: string, subject: string, html: string, consoleLink: string) {
  if (!resend) {
    console.log(`[emailSender] RESEND_API_KEY not set — would send to ${to}: ${subject}`);
    console.log(`[emailSender] Link: ${consoleLink}`);
    return;
  }
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
  if (error) {
    throw new Error(error.message);
  }
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const link = `${PORTAL_URL}/portal/verify-email.html?token=${token}`;
  await sendEmail(
    email,
    'Verify your email',
    `<p>Confirm your email address:</p><p><a href="${link}">${link}</a></p>`,
    link,
  );
}

// B2B company-billing portal (business/) — invites an employee to join a
// company's billing account. `business/` is a single SPA like admin/shop
// (docs, "B2B company-billing portal" plan), not separate pages like
// portal/'s — so unlike the two links above, this one carries the token as
// a query param on the app's own root rather than a dedicated .html file;
// BusinessApp.tsx reads it on load and shows the accept-invite screen
// instead of sign-in when present.
export async function sendCompanyInviteEmail(
  email: string,
  token: string,
  companyName: string,
): Promise<void> {
  const link = `${PORTAL_URL}/business/?token=${token}`;
  await sendEmail(
    email,
    `You've been invited to ${companyName} on Digital.Point`,
    `<p>You've been added as a member of <strong>${companyName}</strong>. Set your password to get started:</p><p><a href="${link}">${link}</a></p>`,
    link,
  );
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const link = `${PORTAL_URL}/portal/reset-password.html?token=${token}`;
  await sendEmail(
    email,
    'Reset your password',
    `<p>Reset your password (this link expires in 1 hour):</p><p><a href="${link}">${link}</a></p>`,
    link,
  );
}

// Phone-Camera Scan delivery (docs/scan-upload-requirements.md) — the only
// email this project sends with an attachment, so this doesn't go through
// the plain-HTML sendEmail() helper above (which has no attachment param).
export async function sendScanEmail(email: string, pdfBuffer: Buffer): Promise<void> {
  if (!resend) {
    console.log(`[emailSender] RESEND_API_KEY not set — would send scanned PDF to ${email}`);
    return;
  }
  // Despite the SDK's `content?: string | Buffer` type, it does NOT convert
  // a Buffer for you — parseAttachments() (resend/dist/index.mjs) passes
  // `content` straight into the request body, which then goes through a
  // plain JSON.stringify(). A raw Buffer serializes to `{"type":"Buffer",
  // "data":[...]}`, not a valid attachment, which the API rejects — base64
  // ourselves first.
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Your scanned document',
    html: '<p>Your scanned document is attached as a PDF.</p>',
    attachments: [{ filename: 'scan.pdf', content: pdfBuffer.toString('base64') }],
  });
  if (error) {
    throw new Error(error.message);
  }
}

// Photo kiosk's "send me a copy" delivery (server/photoShareStore.ts's own
// comment explains why this is a deliberate, narrow exception to that
// feature's usual no-server-side-photo-bytes rule) — same attachment
// pattern as sendScanEmail above.
export async function sendPhotoEmail(
  email: string,
  imageBuffer: Buffer,
  filename: string,
): Promise<void> {
  if (!resend) {
    console.log(`[emailSender] RESEND_API_KEY not set — would send photo to ${email}`);
    return;
  }
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Ваше фото',
    html: '<p>Ваше фото на документы — во вложении.</p>',
    attachments: [{ filename, content: imageBuffer.toString('base64') }],
  });
  if (error) {
    throw new Error(error.message);
  }
}
