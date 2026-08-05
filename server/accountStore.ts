import { eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { accounts } from './db/schema.js';

// Real accounts — used by the login/register routes (server/routes.ts). See
// README.md, "Database" (schema in server/db/schema.ts).

export interface Account {
  id: string;
  username: string;
}

export interface AccountWithHash extends Account {
  passwordHash: string;
}

// Thrown by createAccount() when the username's UNIQUE constraint is
// violated — mirrors the existing InvalidFileFormatError pattern in
// server/routes.ts, so the register route can catch this specific class
// and respond 409 instead of a raw 500.
export class UsernameTakenError extends Error {}

// node-postgres's raw unique-violation error (code '23505') — Drizzle wraps
// it in a DrizzleQueryError, with the original error on `.cause`.
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { code, cause } = err as { code?: string; cause?: unknown };
  if (code === '23505') return true;
  return (
    typeof cause === 'object' && cause !== null && (cause as { code?: string }).code === '23505'
  );
}

export async function createAccount(username: string, passwordHash: string): Promise<Account> {
  try {
    const [row] = await db
      .insert(accounts)
      .values({ username, passwordHash })
      .returning({ id: accounts.id, username: accounts.username });
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new UsernameTakenError();
    throw err;
  }
}

// Includes the password hash — only the login route should call this.
export async function findAccountByUsername(username: string): Promise<AccountWithHash | null> {
  const [row] = await db
    .select({
      id: accounts.id,
      username: accounts.username,
      passwordHash: accounts.passwordHash,
    })
    .from(accounts)
    .where(eq(accounts.username, username));
  return row ?? null;
}
