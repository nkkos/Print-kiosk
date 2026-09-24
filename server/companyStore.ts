import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { db } from './db/client.js';
import { companies, companyMembers, accounts } from './db/schema.js';
import { createAccount, findAccountByEmail, createAccountToken } from './accountStore.js';

// B2B company-billing portal (business/, docs — "B2B company-billing
// portal" plan, 2026-09-17). A company's employees are ordinary `accounts`
// rows — this module only links them to a `companies` row and tracks the
// invite lifecycle, deliberately not a parallel identity system (see
// db/schema.ts's own comment on why `staffAccounts`'s isolation doesn't
// apply here).

export interface Company {
  id: string;
  name: string;
  ico: string;
  dic: string;
  icDph: string | null;
  billingEmail: string;
  billingAddress: string | null;
  pricePerPageBwCents: number;
  pricePerPageColorCents: number;
  vatRatePercent: number;
  active: boolean;
}

const COMPANY_COLUMNS = {
  id: companies.id,
  name: companies.name,
  ico: companies.ico,
  dic: companies.dic,
  icDph: companies.icDph,
  billingEmail: companies.billingEmail,
  billingAddress: companies.billingAddress,
  pricePerPageBwCents: companies.pricePerPageBwCents,
  pricePerPageColorCents: companies.pricePerPageColorCents,
  vatRatePercent: companies.vatRatePercent,
  active: companies.active,
};

export interface CreateCompanyParams {
  name: string;
  ico: string;
  dic: string;
  icDph?: string;
  billingEmail: string;
  billingAddress?: string;
  pricePerPageBwCents: number;
  pricePerPageColorCents: number;
  /** Defaults to companies.vatRatePercent's own schema default (Slovakia's
   * standard rate) when omitted — see that column's comment for why this is
   * a per-company override, not a hardcoded constant. */
  vatRatePercent?: number;
}

export async function createCompany(params: CreateCompanyParams): Promise<Company> {
  const [row] = await db
    .insert(companies)
    .values({
      name: params.name,
      ico: params.ico,
      dic: params.dic,
      icDph: params.icDph ?? null,
      billingEmail: params.billingEmail,
      billingAddress: params.billingAddress ?? null,
      pricePerPageBwCents: params.pricePerPageBwCents,
      pricePerPageColorCents: params.pricePerPageColorCents,
      ...(params.vatRatePercent !== undefined && { vatRatePercent: params.vatRatePercent }),
    })
    .returning(COMPANY_COLUMNS);
  return row as Company;
}

export async function listCompanies(): Promise<Company[]> {
  const rows = await db.select(COMPANY_COLUMNS).from(companies);
  return rows as Company[];
}

export async function getCompany(id: string): Promise<Company | null> {
  const [row] = await db.select(COMPANY_COLUMNS).from(companies).where(eq(companies.id, id));
  return (row as Company) ?? null;
}

export interface CompanyMember {
  id: string;
  companyId: string;
  accountId: string;
  email: string;
  role: 'admin' | 'member';
  invitedAt: Date;
  joinedAt: Date | null;
}

export async function listCompanyMembers(companyId: string): Promise<CompanyMember[]> {
  const rows = await db
    .select({
      id: companyMembers.id,
      companyId: companyMembers.companyId,
      accountId: companyMembers.accountId,
      email: accounts.email,
      role: companyMembers.role,
      invitedAt: companyMembers.invitedAt,
      joinedAt: companyMembers.joinedAt,
    })
    .from(companyMembers)
    .innerJoin(accounts, eq(companyMembers.accountId, accounts.id))
    .where(eq(companyMembers.companyId, companyId));
  return rows as CompanyMember[];
}

/** Invites an employee by email — reuses their existing account if one
 * exists, otherwise creates one with a random, never-communicated password
 * (accounts.passwordHash can't be null; the invited person sets their real
 * password via the same token in acceptCompanyInvite). Returns the raw
 * invite token to email via server/emailSender.ts's sendCompanyInviteEmail —
 * this function doesn't send it itself, matching how createAccountToken
 * itself stays decoupled from sending (server/routes.ts wires the two
 * together for registration, same pattern here). */
export async function inviteCompanyMember(
  companyId: string,
  email: string,
  role: 'admin' | 'member',
): Promise<string> {
  const existing = await findAccountByEmail(email);
  const account =
    existing ??
    (await createAccount(email, await bcrypt.hash(randomBytes(24).toString('hex'), 10)));

  await db
    .insert(companyMembers)
    .values({ companyId, accountId: account.id, role, joinedAt: null })
    .onConflictDoNothing();

  return createAccountToken(account.id, 'company-invite', 7 * 24 * 60 * 60 * 1000);
}

/** Marks a pending invite accepted — called once the invited person sets
 * their password via the emailed link (server/routes.ts). No-op if there's
 * no pending (unjoined) invite for this account. */
export async function acceptCompanyInvite(accountId: string): Promise<void> {
  await db
    .update(companyMembers)
    .set({ joinedAt: new Date() })
    .where(and(eq(companyMembers.accountId, accountId), isNull(companyMembers.joinedAt)));
}

/** The company an account can bill to, if any — null for an ordinary
 * account or one whose invite hasn't been accepted yet (an unaccepted
 * invite's placeholder account has no usable password anyway, so it
 * couldn't reach this check by logging in, but the joinedAt filter keeps
 * the intent explicit rather than relying on that side effect). Backs
 * GET /api/accounts/me/company and the "Bill to <Company>" checkout option
 * (server/accountOrderStore.ts's payOrderForCompany). */
export async function getCompanyForAccount(
  accountId: string,
): Promise<{ company: Company; role: 'admin' | 'member' } | null> {
  const [row] = await db
    .select({ company: COMPANY_COLUMNS, role: companyMembers.role })
    .from(companyMembers)
    .innerJoin(companies, eq(companyMembers.companyId, companies.id))
    .where(and(eq(companyMembers.accountId, accountId), isNotNull(companyMembers.joinedAt)))
    .limit(1);
  return row
    ? ({ company: row.company, role: row.role } as { company: Company; role: 'admin' | 'member' })
    : null;
}
