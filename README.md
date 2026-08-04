# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## Running the backend (dev-only, QR + Email upload)

The QR (`docs/qr-upload-requirements.md`) and Email (`docs/email-upload-requirements.md`) upload methods are backed by a real Express server in `server/` — everything else in this prototype is still mocked in the frontend. Locally this is a dev-only backend; it can also be deployed to Railway (see "Deploying to Railway" below) for real inbound email and for QR to work off the kiosk's own network.

1. `npm install` (already covers backend dependencies — no separate install step).
2. Copy `.env.example` to `.env` (optional — the defaults already point at the local backend; set `VITE_EMAIL_DOMAIN` if you want the Email screen's address to match a real domain you've wired up, see "Deploying to Railway").
3. **Antivirus scanning (real, local ClamAV — see `docs/qr-upload-requirements.md`, "File scanning status"):** one-time setup — install ClamAV (`winget install --id Cisco.ClamAV`), then run `freshclam.exe` once to download virus definitions (~110 MB, needs internet). Every dev session, before testing uploads, start the daemon: `"C:\Program Files\ClamAV\clamd.exe" --config-file="$env:LOCALAPPDATA\ClamAV\clamd.conf"` (a plain foreground process, not a Windows service — matches how the backend itself is just run as a dev process, not installed). If `clamd` isn't running, uploads still work (fail-open, dev-only convenience) but nothing is actually being scanned.
4. Run both dev servers: `npm run dev:all` (or two terminals: `npm run dev` for the frontend, `npm run dev:server` for the backend).
5. To actually test QR uploading from a phone against the _local_ backend: the phone must be on the **same Wi-Fi/LAN** as this machine (not a guest network with client isolation). On first run, Windows Firewall may prompt to allow Node.js to accept incoming connections — you'll need to click "Allow" yourself. Once the backend is deployed to Railway, QR works from any network instead — see "Deploying to Railway".
6. Testing Email locally requires the backend's `/api/email/incoming` endpoint to actually receive mail, which needs the real Cloudflare Email Routing → Worker setup below — there's no local-only way to simulate inbound email.

### Backend environment variables

| Variable                    | Used by  | Default                 | Purpose                                                                                                                                                                      |
| --------------------------- | -------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                      | backend  | `3001`                  | Port the Express server listens on — Railway sets this automatically.                                                                                                        |
| `CLAMD_HOST` / `CLAMD_PORT` | backend  | `127.0.0.1` / `3310`    | Where to reach the ClamAV daemon — set to `clamav.railway.internal` / `3310` on Railway.                                                                                     |
| `RAILWAY_PUBLIC_DOMAIN`     | backend  | unset                   | Set automatically by Railway once the `backend` service has a public domain — when present, `GET /api/config` returns it instead of the LAN-IP fallback.                     |
| `VITE_API_BASE_URL`         | frontend | `http://localhost:3001` | Where the frontend itself (not the phone) reaches the backend.                                                                                                               |
| `VITE_EMAIL_DOMAIN`         | frontend | `kiosk.example`         | The domain the Email screen builds its `upload-<prefix>@<domain>` address from — must match a domain with Cloudflare Email Routing enabled and the Worker below bound to it. |

## Deploying to Railway

Two Railway services, in one project:

1. **`clamav`** — add a service from the Docker image `clamav/clamav` (Docker Hub, no build needed). Attach a persistent volume at `/var/lib/clamav` so the virus database survives restarts instead of re-downloading (~100–200 MB) every time. Not exposed publicly — reachable only from other services in the same project via Railway's automatic private networking, at `clamav.railway.internal:3310`. The service must be named exactly `clamav` for that hostname to resolve.
2. **`backend`** — connect this GitHub repo. Nixpacks auto-detects Node; set the Start Command explicitly to `npm start` (not the default) so it runs the production entrypoint, not `dev:server`'s watch mode. Set `CLAMD_HOST=clamav.railway.internal` and `CLAMD_PORT=3310`. Generate a public domain for it (Settings → Networking) — this is what `RAILWAY_PUBLIC_DOMAIN` picks up automatically and what QR's `GET /api/config` and the Cloudflare Worker's `BACKEND_URL` both point at. A persistent volume for `server/uploads/` is optional (avoids losing in-flight uploads on redeploy, but nothing here is meant to persist long-term anyway).

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
