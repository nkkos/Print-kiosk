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

export const db = drizzle(pool, { schema });
