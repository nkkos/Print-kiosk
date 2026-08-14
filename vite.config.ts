import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const rootDir = import.meta.dirname;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Listens on all interfaces (not just localhost) so a phone on the same
  // Wi-Fi can actually reach the portal pages the kiosk QR-encodes (e.g.
  // register.html) — the backend (server/index.ts) already does this via
  // plain app.listen(port); Vite's dev server needs it explicitly.
  server: {
    host: true,
  },
  build: {
    // Multi-page build: the kiosk (index.html) plus the minimal portal
    // (portal/, deployed separately to Cloudflare Pages — see README.md,
    // "Portal"). Local dev already serves both without any extra config
    // (npm run dev, then visit /portal/register.html etc.). Output mirrors
    // input paths, so these land at dist/portal/*.html.
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        register: resolve(rootDir, 'portal/register.html'),
        verifyEmail: resolve(rootDir, 'portal/verify-email.html'),
        forgotPassword: resolve(rootDir, 'portal/forgot-password.html'),
        resetPassword: resolve(rootDir, 'portal/reset-password.html'),
        account: resolve(rootDir, 'portal/account.html'),
        files: resolve(rootDir, 'portal/files.html'),
        start: resolve(rootDir, 'portal/start.html'),
        orders: resolve(rootDir, 'portal/orders.html'),
      },
    },
  },
});
