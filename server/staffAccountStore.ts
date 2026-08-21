import { randomBytes, createHash } from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db } from './db/client.js';
import { staffAccounts, staffSessions } from './db/schema.js';

// Admin panel staff accounts (docs/screens/admin-panel-wireframes.md,
// docs/screens/admin-panel-spec.md) — deliberately separate from
// server/accountStore.ts's `accounts` (see server/db/schema.ts's comment on
// `staffAccounts` for why). Same bcrypt+session-token mechanism, no public
// registration route: provisioning is out-of-band
// (server/scripts/seedStaffAccount.ts).

export type StaffRole = 'operator' | 'senior';

export interface StaffAccount {
  id: string;
  email: string;
  role: StaffRole;
}

export interface StaffAccountWithHash extends StaffAccount {
  passwordHash: string;
}

export class StaffEmailTakenError extends Error {}

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

/** Not exposed via any HTTP route — only `server/scripts/seedStaffAccount.ts`
 * calls this, matching the confirmed "no public registration" decision. */
export async function createStaffAccount(
  email: string,
  passwordHash: string,
  role: StaffRole,
): Promise<StaffAccount> {
  try {
    const [row] = await db
      .insert(staffAccounts)
      .values({ email, passwordHash, role })
      .returning({ id: staffAccounts.id, email: staffAccounts.email, role: staffAccounts.role });
    return row as StaffAccount;
  } catch (err) {
    const constraint = getViolatedConstraint(err);
    if (constraint === 'staff_accounts_email_unique') throw new StaffEmailTakenError();
    throw err;
  }
}

export async function findStaffAccountByEmail(email: string): Promise<StaffAccountWithHash | null> {
  const [row] = await db
    .select({
      id: staffAccounts.id,
      email: staffAccounts.email,
      role: staffAccounts.role,
      passwordHash: staffAccounts.passwordHash,
    })
    .from(staffAccounts)
    .where(eq(staffAccounts.email, email));
  return (row as StaffAccountWithHash) ?? null;
}

export async function createStaffSession(
  staffAccountId: string,
  expiresInMs: number,
): Promise<string> {
  const rawToken = randomBytes(32).toString('hex');
  await db.insert(staffSessions).values({
    staffAccountId,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + expiresInMs),
  });
  return rawToken;
}

export async function findStaffAccountBySessionToken(
  rawToken: string,
): Promise<StaffAccount | null> {
  const [row] = await db
    .select({
      id: staffAccounts.id,
      email: staffAccounts.email,
      role: staffAccounts.role,
    })
    .from(staffSessions)
    .innerJoin(staffAccounts, eq(staffSessions.staffAccountId, staffAccounts.id))
    .where(
      and(
        eq(staffSessions.tokenHash, hashToken(rawToken)),
        gt(staffSessions.expiresAt, new Date()),
      ),
    );
  return (row as StaffAccount) ?? null;
}
