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

const { router, DEFAULT_PORT } = await import('./routes.js');
const { getLanIPv4 } = await import('./lanIp.js');
const { db } = await import('./db/client.js');
const { sweepExpiredFiles, ORPHAN_FILE_TTL_MS } = await import('./sessionLifecycle.js');
const { sweepExpiredAccountFiles } = await import('./accountFileStore.js');
const { ACCOUNT_FILE_RETENTION_DAYS } = await import('./accountFileLimits.js');
const { sweepExpiredScanSessions, SCAN_SESSION_RETENTION_HOURS } = await import('./scanStore.js');
const { sweepOrphanedCopySessions } = await import('./copyStore.js');
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

  // Personal Account files' own retention sweep (docs/personal-account-requirements.md,
  // "Open items"; server/accountFileLimits.ts) — separate window/config from
  // the session-scoped sweep above.
  const runAccountFileSweep = () =>
    sweepExpiredAccountFiles(ACCOUNT_FILE_RETENTION_DAYS)
      .then((count) => {
        if (count > 0) console.log(`[index] Account-file retention sweep deleted ${count} file(s)`);
      })
      .catch((err: unknown) => console.error('[index] Account-file retention sweep failed:', err));
  void runAccountFileSweep();
  setInterval(runAccountFileSweep, 30 * 60 * 1000);

  // Phone-Camera Scan's own, much shorter retention sweep
  // (docs/scan-upload-requirements.md, "Retention (anonymous delivery)") —
  // 24h, not 30 days like the account-file sweep above.
  const runScanSweep = () =>
    sweepExpiredScanSessions(SCAN_SESSION_RETENTION_HOURS)
      .then((count) => {
        if (count > 0)
          console.log(`[index] Scan session retention sweep deleted ${count} session(s)`);
      })
      .catch((err: unknown) => console.error('[index] Scan session retention sweep failed:', err));
  void runScanSweep();
  setInterval(runScanSweep, 30 * 60 * 1000);

  // Copy's own orphan safety-net (server/copyStore.ts) — the primary
  // cleanup path is the explicit session-end hook in sessionLifecycle.ts's
  // endSession; this only catches a capture abandoned without ever reaching
  // "Finish" and without a clean session-end signal either (crash,
  // connectivity loss) — same role/window as ORPHAN_FILE_TTL_MS above, not
  // Scan's separate 24h retention.
  const runCopySweep = () =>
    sweepOrphanedCopySessions(ORPHAN_FILE_TTL_MS)
      .then((count) => {
        if (count > 0)
          console.log(`[index] Orphaned copy-session sweep deleted ${count} session(s)`);
      })
      .catch((err: unknown) => console.error('[index] Orphaned copy-session sweep failed:', err));
  void runCopySweep();
  setInterval(runCopySweep, 30 * 60 * 1000);

  // Pays LibreOffice's cold-start cost once now instead of during a real
  // user's first .doc/.docx conversion (server/documentConverter.ts).
  // Fire-and-forget — doesn't delay the server accepting requests. The
  // .catch() here matters, not just style: an unhandled rejection (there was
  // none before) crashes the whole Node process by default — this was
  // silently taking the dev server down on an intermittent Windows-only
  // EPERM from libreoffice-convert's own temp-dir cleanup, unrelated to
  // whether the actual conversion succeeded.
  console.log('[index] Warming up LibreOffice...');
  void warmUpLibreOffice()
    .then(() => console.log('[index] LibreOffice warm-up complete'))
    .catch((err: unknown) => console.error('[index] LibreOffice warm-up failed:', err));
}

main().catch((err: unknown) => {
  console.error('[index] Failed to start:', err);
  process.exit(1);
});

// Survives a specific, recurring, external failure: libreoffice-convert's
// bundled `tmp` package cleans up its temp dir via its own internal
// callback/exit hook, not as part of the Promise warmUpLibreOffice()
// returns — so the `.catch()` above (added for exactly this reason) doesn't
// actually see it. On Windows, that cleanup can race soffice.exe still
// holding a lock on the directory right after a failed cold-start
// conversion, throwing EPERM from deep inside `tmp`'s rimraf, well outside
// any promise chain this codebase controls — and by default Node kills the
// whole process for an uncaught exception/unhandled rejection, taking the
// dev server down over one leftover temp folder. Anything else still
// crashes normally; this only swallows this exact external, non-critical
// failure signature. Two known temp-dir prefixes have been observed causing
// this — `libreofficeConvert_...` (a real conversion) and `soffice-<pid>-...`
// (the warm-up call's own UserInstallation profile dir, confirmed
// reproducible while testing server/printerAdapter.ts's new submit-timeout
// path — a tsx-watch restart re-runs the warm-up, and this raced again) —
// both are the same underlying soffice.exe-holds-a-lock-during-rimraf issue,
// just from different internal call sites inside libreoffice-convert.
function isBenignTmpCleanupError(err: unknown): boolean {
  if (!(err instanceof Error) || (err as NodeJS.ErrnoException).code !== 'EPERM') return false;
  const path = (err as NodeJS.ErrnoException).path ?? '';
  return (
    /libreofficeConvert_|soffice-\d+-/.test(err.message) ||
    /libreofficeConvert_|soffice-\d+-/.test(path)
  );
}
process.on('uncaughtException', (err) => {
  if (isBenignTmpCleanupError(err)) {
    console.error('[index] Ignoring benign LibreOffice temp-dir cleanup EPERM:', err.message);
    return;
  }
  console.error('[index] Uncaught exception, exiting:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  if (isBenignTmpCleanupError(reason)) {
    console.error('[index] Ignoring benign LibreOffice temp-dir cleanup EPERM:', reason);
    return;
  }
  console.error('[index] Unhandled rejection, exiting:', reason);
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
