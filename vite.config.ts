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
    // Multi-page build: the kiosk (index.html), the minimal portal
    // (portal/, deployed separately to Cloudflare Pages — see README.md,
    // "Portal"), and the admin panel (admin/ — a third mini-app in this
    // same repo, same "separate concern, separate entry" reasoning as
    // portal's own split, but a single page with client-side view
    // switching rather than portal's several separate HTML pages, since an
    // operator navigates between its screens repeatedly across a shift —
    // see docs/screens/admin-panel-wireframes.md). Local dev already
    // serves all of these without any extra config (npm run dev, then
    // visit /portal/register.html or /admin/ etc.). Output mirrors input
    // paths, so these land at dist/portal/*.html / dist/admin/index.html.
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
        admin: resolve(rootDir, 'admin/index.html'),
      },
    },
  },
});
