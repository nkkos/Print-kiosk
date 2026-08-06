# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## Running the backend (dev-only, QR + Email upload)

The QR (`docs/qr-upload-requirements.md`) and Email (`docs/email-upload-requirements.md`) upload methods are backed by a real Express server in `server/` — everything else in this prototype is still mocked in the frontend. Locally this is a dev-only backend; it can also be deployed to Railway (see "Deploying to Railway" below) for real inbound email and for QR to work off the kiosk's own network.

1. `npm install` (already covers backend dependencies — no separate install step).
2. Copy `.env.example` to `.env` (optional — the defaults already point at the local backend; set `VITE_EMAIL_DOMAIN` if you want the Email screen's address to match a real domain you've wired up, see "Deploying to Railway").
3. **Database (real Postgres — see "Database" below for the one-time local setup):** the backend won't start without `DATABASE_URL` pointing at a reachable Postgres.
4. **Antivirus scanning (real, local ClamAV — see `docs/qr-upload-requirements.md`, "File scanning status"):** one-time setup — install ClamAV (`winget install --id Cisco.ClamAV`), then run `freshclam.exe` once to download virus definitions (~110 MB, needs internet). Every dev session, before testing uploads, start the daemon: `"C:\Program Files\ClamAV\clamd.exe" --config-file="$env:LOCALAPPDATA\ClamAV\clamd.conf"` (a plain foreground process, not a Windows service — matches how the backend itself is just run as a dev process, not installed). If `clamd` isn't running, uploads still work (fail-open, dev-only convenience) but nothing is actually being scanned.
5. **Printing real `.doc`/`.docx` files (real, local LibreOffice — see `server/documentConverter.ts`):** one-time setup — install [LibreOffice](https://www.libreoffice.org/download/download/) (the Windows `.msi`). No ongoing config; `libreoffice-convert` spawns it headlessly on demand. `.heic` conversion (`heic-convert`) needs no install (pure JS). If LibreOffice isn't installed, `.doc`/`.docx` files still "print" (they fall back to the placeholder document, same dev convenience as ClamAV's fail-open) — only real conversion is skipped.
6. Run both dev servers: `npm run dev:all` (or two terminals: `npm run dev` for the frontend, `npm run dev:server` for the backend).
7. To actually test QR uploading from a phone against the _local_ backend: the phone must be on the **same Wi-Fi/LAN** as this machine (not a guest network with client isolation). On first run, Windows Firewall may prompt to allow Node.js to accept incoming connections — you'll need to click "Allow" yourself. Once the backend is deployed to Railway, QR works from any network instead — see "Deploying to Railway".
8. Testing Email locally requires the backend's `/api/email/incoming` endpoint to actually receive mail, which needs the real Cloudflare Email Routing → Worker setup below — there's no local-only way to simulate inbound email.

### Database

Real Postgres, via [Drizzle ORM](https://orm.drizzle.team/) — schema in `server/db/schema.ts`, migrations in `server/db/migrations/` (plain SQL, checked into git). The backend runs any pending migrations automatically on startup (`server/index.ts`), so there's no separate "run migrations" step to remember.

**Local dev, one-time setup** — install [Docker Desktop](https://www.docker.com/products/docker-desktop/), then start a local Postgres container:

```
docker run --name print-kiosk-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=print_kiosk -p 5432:5432 -d postgres:16
```

This only needs to run once — the container keeps its data between `docker start print-kiosk-postgres`/`docker stop print-kiosk-postgres` (or just leave it running). `.env.example`'s `DATABASE_URL` default already points at it.

**Changing the schema:** edit `server/db/schema.ts`, then run `npx drizzle-kit generate` to produce a new migration file — review it, commit it alongside the schema change.

### Backend environment variables

| Variable                    | Used by  | Default                                                   | Purpose                                                                                                                                                                      |
| --------------------------- | -------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | backend  | `postgres://postgres:postgres@localhost:5432/print_kiosk` | Postgres connection string — Railway injects this automatically once its Postgres service's variable is referenced into `backend` (see "Deploying to Railway").              |
| `PORT`                      | backend  | `3001`                                                    | Port the Express server listens on — Railway sets this automatically.                                                                                                        |
| `CLAMD_HOST` / `CLAMD_PORT` | backend  | `127.0.0.1` / `3310`                                      | Where to reach the ClamAV daemon — set to `clamav.railway.internal` / `3310` on Railway.                                                                                     |
| `RAILWAY_PUBLIC_DOMAIN`     | backend  | unset                                                     | Set automatically by Railway once the `backend` service has a public domain — when present, `GET /api/config` returns it instead of the LAN-IP fallback.                     |
| `RESEND_API_KEY`            | backend  | unset                                                     | Sends verification/password-reset emails via [Resend](https://resend.com). Unset locally logs the email link to the console instead of sending — no real account needed.     |
| `RESEND_FROM_EMAIL`         | backend  | `noreply@kiosk.example`                                   | The sending address — needs Resend's domain verification (DNS records in Cloudflare) first, see "Portal" below.                                                              |
| `PORTAL_URL`                | backend  | `http://localhost:5173`                                   | Used to build the links inside those emails — set to the deployed Cloudflare Pages URL in production.                                                                        |
| `VITE_API_BASE_URL`         | frontend | `http://localhost:3001`                                   | Where the frontend itself (not the phone) reaches the backend.                                                                                                               |
| `VITE_EMAIL_DOMAIN`         | frontend | `kiosk.example`                                           | The domain the Email screen builds its `upload-<prefix>@<domain>` address from — must match a domain with Cloudflare Email Routing enabled and the Worker below bound to it. |

## Portal

A minimal, separate set of account pages — registration, email verification, password reset, change password (`docs/personal-account-requirements.md`, "Account lifecycle (portal)") — in `portal/`, deployed independently from the kiosk to Cloudflare Pages. Deliberately plain (own `portal/portal.css`, not the kiosk's component library) since it's expected to be redesigned once the portal's fuller scope is decided.

**Local dev:** already served by `npm run dev` alongside the kiosk — visit `http://localhost:5173/portal/register.html` (and `verify-email.html`, `forgot-password.html`, `reset-password.html`, `account.html`). With `RESEND_API_KEY` unset, verification/reset links are logged to the backend's console instead of emailed — copy them from there to test the flow end-to-end locally.

**Sending real email (Resend):**

1. Create a [Resend](https://resend.com) account, add your domain, and follow its DNS-verification instructions — add the records it gives you to your domain in the Cloudflare dashboard (same place as the Email Routing setup).
2. Once verified, create an API key and set `RESEND_API_KEY` (and `RESEND_FROM_EMAIL`, e.g. `noreply@yourdomain.example`) on the Railway `backend` service.

**Deploying the portal (Cloudflare Pages):**

1. Cloudflare dashboard → Workers & Pages → Create → Pages → connect this GitHub repo.
2. Build command: `npm run build`. Build output directory: `dist`.
3. Once deployed, note the Pages URL (e.g. `https://print-kiosk.pages.dev`) and set it as `PORTAL_URL` on the Railway `backend` service, so email links point at the right place.

Known quirk: since it's one Vite build (`vite.config.ts`'s multi-page `rollupOptions.input`), the kiosk's own `index.html` bundle also ends up published on the Pages domain alongside the portal pages — harmless (nothing here is auth-gated beyond the account endpoints anyway), just not hidden.

## Deploying to Railway

Three Railway services, in one project:

1. **Postgres** — add Railway's own managed Postgres ("New" → "Database" → "Add PostgreSQL"). Railway generates a `DATABASE_URL` on this service automatically — it needs to be explicitly referenced into `backend`'s variables (see step 3 below), it isn't shared project-wide by itself.
2. **`clamav`** — add a service from the Docker image `clamav/clamav` (Docker Hub, no build needed). Attach a persistent volume at `/var/lib/clamav` so the virus database survives restarts instead of re-downloading (~100–200 MB) every time. Not exposed publicly — reachable only from other services in the same project via Railway's automatic private networking, at `clamav.railway.internal:3310`. The service must be named exactly `clamav` for that hostname to resolve. **Needs at least ~2–3 GB of memory** to load its virus signature database — the default 1 GB plan limit isn't enough and causes `clamd` to silently fail to start; raise the service's Memory limit under Settings → Scale if you hit this (upgrading the Railway plan first, if needed).
3. **`backend`** — connect this GitHub repo. Nixpacks auto-detects Node; set the Start Command explicitly to `npm start` (not the default) so it runs the production entrypoint, not `dev:server`'s watch mode. Reference the Postgres service's `DATABASE_URL` into this service's variables (Railway's variable-reference UI, e.g. `${{Postgres.DATABASE_URL}}`) — migrations run automatically on boot, nothing else to do. Set `CLAMD_HOST=clamav.railway.internal` and `CLAMD_PORT=3310`. Generate a public domain for it (Settings → Networking) — this is what `RAILWAY_PUBLIC_DOMAIN` picks up automatically and what QR's `GET /api/config` and the Cloudflare Worker's `BACKEND_URL` both point at. A persistent volume for `server/uploads/` is recommended (without one, uploaded files disappear on every redeploy — the database records survive, but the file bytes are on this service's local disk).

Then wire up real inbound email (Cloudflare dashboard):

1. **Email Routing** — Email → Email Routing → enable it for your domain (uses Cloudflare's own DNS records automatically, no manual setup).
2. **Worker** — Workers & Pages → create a Worker → paste in `cloudflare-worker/email-relay.js`. Under the Worker's Settings → Variables, add `BACKEND_URL` set to the `backend` service's Railway public domain (e.g. `https://your-app.up.railway.app`, no trailing slash).
3. **Routing rule** — Email Routing → Routing rules → set the catch-all address to "Send to a Worker" → select the Worker from step 2.
4. Set the frontend's `VITE_EMAIL_DOMAIN` (in `.env`, or wherever the frontend is deployed/built) to your registered domain, so the address the Email screen shows matches what Email Routing is actually catching.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
