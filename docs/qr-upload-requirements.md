# QR Upload — Confirmed Requirements

Internal project document. Consolidates the requirements confirmed with the product owner for the QR upload method (`upload-method-qr` on the Upload Method Selection Screen). This document defines requirements only — no visual design, specification, or wireframe exists yet for the screen this flow touches.

## Purpose

Lets the user upload a document from their phone by scanning a QR code shown on the kiosk, without installing an app.

## How it works (implemented — dev-only backend)

Implemented as of this revision, via a small Express backend in `server/` (see `CLAUDE.md`, "Backend"). This is a _dev-only_ backend — it runs on the developer's own machine, with no hosting/domain/HTTPS, permissive CORS, and no auth/validation, matching `docs/product-overview.md`'s "production-ready backend" and "security hardening" being out of scope:

- The Kiosk Session's own `session.id` is reused directly as the upload token (the same simplification already used for the mock Email address) — no separate token-minting step.
- The QR code encodes `http://<lan-ip>:3001/upload/<sessionId>`, where `<lan-ip>` is the backend's own LAN-facing IPv4, auto-detected via `GET /api/config` (so the phone, a separate device on the same Wi-Fi, can actually reach it — `localhost` only resolves on the kiosk machine itself). Scanning it opens the URL directly in the phone's browser — no dedicated app required.
- The destination is a lightweight, server-rendered HTML page (plain file input + upload button) served by the same backend — a real "lightweight web page," not a placeholder.
- Uploaded files are sent from the phone's browser via a standard multipart form post, stored on the backend's disk under `server/uploads/<sessionId>/`, and tracked in an in-memory store (`server/uploadStore.ts`) — nothing persists across a backend restart.
- The kiosk learns about newly arrived files by polling the backend every 3 seconds while the QR screen is open (`GET /api/qr-sessions/:sessionId/files`) — a WebSocket/SSE push remains a possible future refinement, polling was the simpler, confirmed choice.

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
- **Implemented, real scanning:** a local ClamAV daemon (`clamd`), scanned via the `clamscan` npm package over TCP (`server/uploadStore.ts`) — chosen over a cloud scanning API specifically so uploaded files never leave the machine. Must be running (`clamd.exe`) before testing QR uploads — see `README.md`.
- **Infected file:** deleted from disk immediately; the kiosk's file list shows it as `'rejected'` — "Blocked — failed virus scan," non-selectable, but still visible (not silently removed). See `docs/domain/kiosk-session.md`, "File scanning status," for the full shared rule.
- **Dev-only fail-open:** if `clamd` isn't reachable, the file is logged server-side and still let through as `'ready'` — a deliberate dev convenience, not the production answer (a production system should fail closed instead).

## Known gaps (dev-only backend)

- No server-side cleanup on End Session: uploaded files and their in-memory records simply stay until the backend process restarts. `docs/domain/kiosk-session.md`'s "deleted on session end" contract remains aspirational for QR, as it already is for every other resource in this prototype.
- Nothing survives a backend restart (in-memory store, per `server/uploadStore.ts`).

## Scope boundaries

Out of scope for this document: the six-method selection screen itself (see `docs/upload-method-requirements.md`), Print Order Configuration's full field-level requirements, and a production-ready version of the backend (hosting, domain, HTTPS, auth, real cleanup) — the dev-only backend implemented here is a deliberate stepping stone, not that. Format/size validation, unlike those, is implemented now — see "File format and size limits" below.

## File format and size limits

**Confirmed and implemented** (`server/routes.ts`) — see `docs/domain/kiosk-session.md`, "File format and size limits," for the shared rule (accepted formats, 20 MB max, shared across every upload method). QR-specific behavior: rejected uploads (wrong format or too large) redirect back to the same upload page (`GET /upload/:sessionId`) with an inline error message — the user sees the problem immediately and can pick a different file without leaving the page or involving the kiosk screen at all.

## Open items

- Same real antivirus scanning for Email once it has a real backend (currently mocked there — see `docs/email-upload-requirements.md`).
- Production-ready backend (hosting, domain, HTTPS, auth/session-token hardening, real cleanup on session end) — deferred; see "Known gaps" above for what today's dev-only backend does instead.
