# QR Upload — Confirmed Requirements

Internal project document. Consolidates the requirements confirmed with the product owner for the QR upload method (`upload-method-qr` on the Upload Method Selection Screen). This document defines requirements only — no visual design, specification, or wireframe exists yet for the screen this flow touches.

## Purpose

Lets the user upload a document from their phone by scanning a QR code shown on the kiosk, without installing an app.

## How it works (implemented — dev-only backend)

Implemented as of this revision, via a small Express backend in `server/` (see `CLAUDE.md`, "Backend"). This is still a _dev-only_ backend — permissive CORS and no auth/validation beyond format/size, matching `docs/product-overview.md`'s "production-ready backend" and "security hardening" being out of scope — but it can now run either locally on the developer's own machine, or deployed to Railway (see "Where the phone connects" below):

- The Kiosk Session's own `session.id` is reused directly as the upload token (the same simplification already used for the Email address's session prefix) — no separate token-minting step.
- The QR code encodes `<backend base URL>/upload/<sessionId>`, where the base URL comes from `GET /api/config` (see "Where the phone connects" below). Scanning it opens the URL directly in the phone's browser — no dedicated app required.
- The destination is a lightweight, server-rendered HTML page (plain file input + upload button) served by the same backend — a real "lightweight web page," not a placeholder.
- Uploaded files are sent from the phone's browser via a standard multipart form post, stored on the backend's disk under `server/uploads/<sessionId>/`, and tracked in an in-memory store (`server/uploadStore.ts`) — nothing persists across a backend restart.
- The kiosk learns about newly arrived files by polling the backend every 3 seconds while the QR screen is open (`GET /api/qr-sessions/:sessionId/files`) — a WebSocket/SSE push remains a possible future refinement, polling was the simpler, confirmed choice.

## Where the phone connects

- **Deployed (Railway):** `GET /api/config` returns the backend's public Railway URL (`RAILWAY_PUBLIC_DOMAIN`, injected automatically once the `backend` service has a public domain) — the phone just needs any internet connection, not the kiosk's own network. This is the confirmed setup for anything beyond local development, since QR moved to the same Railway hosting as Email (`README.md`, "Deploying to Railway").
- **Local development (fallback, unchanged):** with no `RAILWAY_PUBLIC_DOMAIN` set, `GET /api/config` falls back to auto-detecting the dev machine's LAN-facing IPv4 (`getLanIPv4()` in `server/routes.ts`), same as before — the phone must be on the same Wi-Fi as the dev machine for this path, since `localhost` only resolves on the kiosk machine itself.

## Confirmed flow

Unlike Email (two screens: address+instructions, then a separate received-files list), QR is a **single screen**, split into two halves:

- **Left half:** the QR code plus brief instructional text.
- **Right half:** the list of uploaded files, populated as they arrive. No separate "Next" step — the user scans, uploads from their phone, and watches files appear on the same screen they're looking at, since they're standing at the kiosk waiting.

The list is a **flat list of files** — no grouping (unlike Email's grouping by received message, which doesn't apply here since there's no equivalent of a "message").

## Persistence across revisits

- The QR code is generated once per Kiosk Session and stays the same for the session's lifetime — the user can leave this screen (e.g., back to Upload Method Selection) and return to find the same code and their previously uploaded files still there.
- The user can keep uploading more files to the same code across multiple visits to this screen — uploading is not a one-time action tied to a single visit.

## Batch configure

**Confirmed:** instead of selecting one uploaded file at a time, a single "Configure printing for all files" action covers every currently-selectable (scanned) file at once — see `docs/personal-account-requirements.md`, "Batch configure," for the shared mechanics (sequential Print Order Configuration per file, Cart popup only opens once the whole batch is done).

## File scanning status

- Every uploaded file passes through the same antivirus-scanning step as every other upload method (see `docs/domain/kiosk-session.md`, "File scanning status" — this is a cross-cutting rule, not QR-specific).
- While scanning, the file is shown in the list but is not selectable (visually indicated as pending, e.g., "Scanning for viruses..."). Once scanning completes, it becomes selectable, same as any other received file, to proceed to Print Order Configuration.
- **Implemented, real scanning:** a ClamAV daemon (`clamd`), scanned via the `clamscan` npm package over TCP (`server/uploadStore.ts`) — chosen over a cloud scanning API specifically so uploaded files stay within infrastructure we control. Locally, this is `clamd.exe` running on the dev machine (`CLAMD_HOST`/`CLAMD_PORT` default to `127.0.0.1:3310` — see `README.md`); when deployed, it's the `clamav` Railway service, reached over Railway's private network (`README.md`, "Deploying to Railway").
- **Infected file:** deleted from disk immediately; the kiosk's file list shows it as `'rejected'` — "Blocked — failed virus scan," non-selectable, but still visible (not silently removed). See `docs/domain/kiosk-session.md`, "File scanning status," for the full shared rule.
- **Dev-only fail-open; production fails closed:** if `clamd` isn't reachable, behavior depends on `NODE_ENV` (see `docs/domain/kiosk-session.md`, "File scanning status," for the full shared rule). In dev, the file is logged server-side and still let through as `'ready'` — a deliberate dev convenience. With `NODE_ENV=production` (see `README.md`, "Deploying to Railway"), the file is deleted immediately and shown as `'scan-unavailable'` — "Removed — virus scan unavailable. Please try again later." — distinct from the `'rejected'` message above, since no threat was actually confirmed.

## Known gaps (dev-only backend)

- No server-side cleanup on End Session: uploaded files and their in-memory records simply stay until the backend process restarts. `docs/domain/kiosk-session.md`'s "deleted on session end" contract remains aspirational for QR, as it already is for every other resource in this prototype.
- Nothing survives a backend restart (in-memory store, per `server/uploadStore.ts`).

## Scope boundaries

Out of scope for this document: the six-method selection screen itself (see `docs/upload-method-requirements.md`), Print Order Configuration's full field-level requirements, and a production-ready version of the backend (hosting, domain, HTTPS, auth, real cleanup) — the dev-only backend implemented here is a deliberate stepping stone, not that. Format/size validation, unlike those, is implemented now — see "File format and size limits" below.

## File format and size limits

**Confirmed and implemented** (`server/routes.ts`) — see `docs/domain/kiosk-session.md`, "File format and size limits," for the shared rule (accepted formats, 20 MB max, shared across every upload method). QR-specific behavior: rejected uploads (wrong format or too large) redirect back to the same upload page (`GET /upload/:sessionId`) with an inline error message — the user sees the problem immediately and can pick a different file without leaving the page or involving the kiosk screen at all.

## Open items

- Production-ready backend (auth/session-token hardening, real cleanup on session end) — deferred; see "Known gaps" above for what today's dev-only backend does instead. Hosting/domain/HTTPS themselves are now covered by the Railway deployment (see "Where the phone connects" above), though the backend's own security posture is unchanged (dev-only, not hardened).
