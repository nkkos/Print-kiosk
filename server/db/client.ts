import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

// DATABASE_URL is required — Railway injects it automatically once the Postgres
// service's variable is referenced into this service's environment (README.md,
// "Deploying to Railway"); locally it points at the dev-only Docker container.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — see README.md, "Database" for local setup.');
}

const pool = new Pool({ connectionString });

// Found while wiring docs/equipment-monitoring-requirements.md's Section E:
// pg-pool emits 'error' on an idle client's unexpected disconnect (confirmed
// by reading node_modules/pg-pool/index.js directly), completely separate
// from any query's own promise rejection. With no listener, Node's default
// behavior for an unhandled EventEmitter 'error' is to throw — which
// server/index.ts's uncaughtException handler would then treat as fatal and
// exit the whole process over what's really just a transient DB blip.
// reportIncident is fire-and-forget on purpose: if this listener itself
// throws, we're right back where we started.
pool.on('error', (err) => {
  console.error('[db/client] Unexpected error on idle Postgres client:', err);
  import('../incidentStore.js')
    .then(({ reportIncident }) =>
      reportIncident({
        source: 'backend',
        code: 'backend.db-unreachable',
        severity: 'critical',
        message: 'Unexpected error on an idle Postgres connection — pool recovers on its own.',
        context: { error: String(err) },
      }),
    )
    .catch(() => {});
});

export const db = drizzle(pool, { schema });
