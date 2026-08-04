// Thin relay for real inbound Email upload (docs/email-upload-requirements.md).
// Deliberately does no parsing of its own — just forwards the raw MIME
// message and the original recipient address to the backend's fixed
// POST /api/email/incoming (server/routes.ts), which does the real parsing
// (mailparser) and validation/scanning. Keeps this Worker swappable for a
// different relay mechanism later without touching backend logic.
//
// Setup (Cloudflare dashboard, not part of the Vite/Node build):
// 1. Workers & Pages → Create Worker → paste this file's contents.
// 2. Worker → Settings → Variables → add BACKEND_URL, set to the deployed
//    backend's public URL (e.g. the Railway `backend` service's domain),
//    no trailing slash.
// 3. Email → Email Routing → Routing rules → Catch-all address → Send to a
//    Worker → select this Worker.
export default {
  async email(message, env, _ctx) {
    const response = await fetch(`${env.BACKEND_URL}/api/email/incoming`, {
      method: 'POST',
      headers: {
        'Content-Type': 'message/rfc822',
        'X-Original-To': message.to,
      },
      body: message.raw,
    });

    if (!response.ok) {
      throw new Error(`Backend responded ${response.status} for message to ${message.to}`);
    }
  },
};
