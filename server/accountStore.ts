import { randomBytes, createHash } from 'node:crypto';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { db } from './db/client.js';
import { accounts, accountTokens } from './db/schema.js';

// Real accounts — used by the account routes (server/routes.ts). See
// README.md, "Database" (schema in server/db/schema.ts).

export interface Account {
  id: string;
  username: string;
}

export interface AccountWithHash extends Account {
  email: string;
  passwordHash: string;
}

export type AccountTokenType = 'email-verification' | 'password-reset' | 'session';

// Thrown by createAccount() when the username's or email's UNIQUE
// constraint is violated — mirrors the existing InvalidFileFormatError
// pattern in server/routes.ts, so the register route can catch a specific
// class and respond 409 instead of a raw 500.
export class UsernameTakenError extends Error {}
export class EmailTakenError extends Error {}

// node-postgres's raw unique-violation error (code '23505', with a
// `constraint` naming which one) — Drizzle wraps it in a DrizzleQueryError,
// with the original error on `.cause`.
function getViolatedConstraint(err: unknown): string | null {
  const raw =
    typeof err === 'object' && err !== null && 'cause' in err
      ? (err as { cause: unknown }).cause
      : err;
  if (typeof raw !== 'object' || raw === null) return null;
  const { code, constraint } = raw as { code?: string; constraint?: string };
  return code === '23505' ? (constraint ?? null) : null;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export async function createAccount(
  username: string,
  email: string,
  passwordHash: string,
): Promise<Account> {
  try {
    const [row] = await db
      .insert(accounts)
      .values({ username, email, passwordHash })
      .returning({ id: accounts.id, username: accounts.username });
    return row;
  } catch (err) {
    const constraint = getViolatedConstraint(err);
    if (constraint === 'accounts_username_unique') throw new UsernameTakenError();
    if (constraint === 'accounts_email_unique') throw new EmailTakenError();
    throw err;
  }
}

// Includes the password hash and email — only the login/password routes
// should call this.
export async function findAccountByUsername(username: string): Promise<AccountWithHash | null> {
  const [row] = await db
    .select({
      id: accounts.id,
      username: accounts.username,
      email: accounts.email,
      passwordHash: accounts.passwordHash,
    })
    .from(accounts)
    .where(eq(accounts.username, username));
  return row ?? null;
}

export async function verifyAccountEmail(accountId: string): Promise<void> {
  await db.update(accounts).set({ emailVerified: true }).where(eq(accounts.id, accountId));
}

export async function updateAccountPassword(
  accountId: string,
  passwordHash: string,
): Promise<void> {
  await db.update(accounts).set({ passwordHash }).where(eq(accounts.id, accountId));
}

// Generates a random token, stores only its hash (same principle as
// password hashing — a leaked DB doesn't leak usable tokens), and returns
// the raw token once so it can be emailed/returned to the caller.
export async function createAccountToken(
  accountId: string,
  type: AccountTokenType,
  expiresInMs: number,
): Promise<string> {
  const rawToken = randomBytes(32).toString('hex');
  await db.insert(accountTokens).values({
    accountId,
    type,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + expiresInMs),
  });
  return rawToken;
}

// Single-use: atomically marks the token used and returns the account id it
// belonged to, or null if it doesn't exist / already used / expired. Used
// for email-verification and password-reset tokens.
export async function consumeAccountToken(
  rawToken: string,
  type: 'email-verification' | 'password-reset',
): Promise<string | null> {
  const [row] = await db
    .update(accountTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(accountTokens.tokenHash, hashToken(rawToken)),
        eq(accountTokens.type, type),
        isNull(accountTokens.usedAt),
        gt(accountTokens.expiresAt, new Date()),
      ),
    )
    .returning({ accountId: accountTokens.accountId });
  return row?.accountId ?? null;
}

// Multi-use (until expiry) — session tokens are never marked used, unlike
// verification/reset tokens above. Used by the change-password route.
export async function findAccountBySessionToken(rawToken: string): Promise<AccountWithHash | null> {
  const [row] = await db
    .select({
      id: accounts.id,
      username: accounts.username,
      email: accounts.email,
      passwordHash: accounts.passwordHash,
    })
    .from(accountTokens)
    .innerJoin(accounts, eq(accountTokens.accountId, accounts.id))
    .where(
      and(
        eq(accountTokens.tokenHash, hashToken(rawToken)),
        eq(accountTokens.type, 'session'),
        gt(accountTokens.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}
