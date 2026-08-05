import { eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { accounts } from './db/schema.js';

// Minimal account functions — not yet called from any route. Exists now so
// the `accounts` table (server/db/schema.ts) can be smoke-tested end-to-end
// before a later phase wires real login into LoginPanel.

export interface Account {
  id: string;
  username: string;
}

export async function createAccount(username: string, passwordHash: string): Promise<Account> {
  const [row] = await db
    .insert(accounts)
    .values({ username, passwordHash })
    .returning({ id: accounts.id, username: accounts.username });
  return row;
}

export async function findAccountByUsername(username: string): Promise<Account | null> {
  const [row] = await db
    .select({ id: accounts.id, username: accounts.username })
    .from(accounts)
    .where(eq(accounts.username, username));
  return row ?? null;
}
