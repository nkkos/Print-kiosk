# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## Running the backend (dev-only, QR upload)

The QR upload method (`docs/qr-upload-requirements.md`) is backed by a real, dev-only Express server in `server/` — everything else in this prototype is still mocked in the frontend.

1. `npm install` (already covers backend dependencies — no separate install step).
2. Copy `.env.example` to `.env` (optional — the default already points at the local backend).
3. **Antivirus scanning (real, local ClamAV — see `docs/qr-upload-requirements.md`, "File scanning status"):** one-time setup — install ClamAV (`winget install --id Cisco.ClamAV`), then run `freshclam.exe` once to download virus definitions (~110 MB, needs internet). Every dev session, before testing QR uploads, start the daemon: `"C:\Program Files\ClamAV\clamd.exe" --config-file="$env:LOCALAPPDATA\ClamAV\clamd.conf"` (a plain foreground process, not a Windows service — matches how the backend itself is just run as a dev process, not installed). If `clamd` isn't running, uploads still work (fail-open, dev-only convenience) but nothing is actually being scanned.
4. Run both dev servers: `npm run dev:all` (or two terminals: `npm run dev` for the frontend, `npm run dev:server` for the backend).
5. To actually test uploading from a phone: the phone must be on the **same Wi-Fi/LAN** as this machine (not a guest network with client isolation). On first run, Windows Firewall may prompt to allow Node.js to accept incoming connections — you'll need to click "Allow" yourself.

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
