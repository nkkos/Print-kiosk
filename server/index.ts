import express from 'express';
import cors from 'cors';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile();
} catch {
  // no .env file locally (or on Railway, where env vars are injected directly) — fine either way
}

const { router, DEFAULT_PORT, getLanIPv4 } = await import('./routes.js');
const { db } = await import('./db/client.js');
const { sweepExpiredFiles, ORPHAN_FILE_TTL_MS } = await import('./sessionLifecycle.js');
const { warmUpLibreOffice } = await import('./documentConverter.js');

// Dev-only backend for the QR/Email upload methods (docs/qr-upload-requirements.md,
// docs/email-upload-requirements.md). Permissive CORS is intentional here — see
// docs/product-overview.md, "Production-ready backend" and "Security hardening"
// are both out of scope for this milestone. Deployable to Railway as-is: PORT is
// injected there, and CLAMD_HOST/PORT point uploadStore.ts at the `clamav` service.

const serverDir = dirname(fileURLToPath(import.meta.url));

async function main() {
  // Idempotent — safe to run on every boot. Avoids a "forgot to run the
  // migration before deploying" failure class in a project with no CI
  // pipeline — see README.md, "Database."
  await migrate(db, { migrationsFolder: join(serverDir, 'db', 'migrations') });

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(router);

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  app.listen(port, () => {
    console.log(`Upload backend listening on http://localhost:${port}`);
    console.log(`Reachable from phones on the same Wi-Fi at http://${getLanIPv4()}:${port}`);
  });

  // TTL safety net (docs/data-privacy-requirements.md) for a session-end
  // signal that never reached the backend — a single persistent process, so
  // a plain interval is enough; no separate scheduler/service needed.
  const runSweep = () =>
    sweepExpiredFiles(ORPHAN_FILE_TTL_MS)
      .then((count) => {
        if (count > 0) console.log(`[index] Orphaned-file sweep deleted ${count} file(s)`);
      })
      .catch((err: unknown) => console.error('[index] Orphaned-file sweep failed:', err));
  void runSweep();
  setInterval(runSweep, 30 * 60 * 1000);

  // Pays LibreOffice's cold-start cost once now instead of during a real
  // user's first .doc/.docx conversion (server/documentConverter.ts).
  // Fire-and-forget — doesn't delay the server accepting requests.
  console.log('[index] Warming up LibreOffice...');
  void warmUpLibreOffice().then(() => console.log('[index] LibreOffice warm-up complete'));
}

main().catch((err: unknown) => {
  console.error('[index] Failed to start:', err);
  process.exit(1);
});

// Without this, Railway's SIGTERM on every redeploy (replacing this
// container with the new one) exits with a non-zero code by default,
// which Railway then shows as "Crashed" even though it's a routine
// deploy, not a real failure.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[index] Received ${signal}, shutting down`);
    process.exit(0);
  });
}
