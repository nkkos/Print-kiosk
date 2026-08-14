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

async function sendEmail(to: string, subject: string, html: string, consoleLink: string) {
  if (!resend) {
    console.log(`[emailSender] RESEND_API_KEY not set — would send to ${to}: ${subject}`);
    console.log(`[emailSender] Link: ${consoleLink}`);
    return;
  }
  await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
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
  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Your scanned document',
    html: '<p>Your scanned document is attached as a PDF.</p>',
    attachments: [{ filename: 'scan.pdf', content: pdfBuffer.toString('base64') }],
  });
}
