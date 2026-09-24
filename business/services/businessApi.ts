// The handful of endpoints that are genuinely new for the B2B
// company-billing portal (docs — "B2B company-billing portal" plan) —
// everything else (login, file upload, order creation/listing) is already
// built and reused directly from src/services/ (accountApi.ts,
// accountFileApi.ts), same cross-mini-app pattern portal/shop/photo-kiosk
// already use for their own src/ imports.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

async function authedRequest<T>(
  path: string,
  sessionToken: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${sessionToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? 'Request failed');
  }
  return data as T;
}

export interface CompanyMembership {
  company: {
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
  };
  role: 'admin' | 'member';
}

/** Null for an ordinary account, or one whose invite hasn't been accepted
 * yet — a normal, expected answer, not an error. */
export async function getMyCompany(sessionToken: string): Promise<CompanyMembership | null> {
  return authedRequest('/api/accounts/me/company', sessionToken);
}

export interface CompanyInvoice {
  id: string;
  periodStart: string;
  periodEnd: string;
  vatRatePercent: number;
  totalNetCents: number;
  totalVatCents: number;
  totalCents: number;
  status: 'draft' | 'issued' | 'paid' | 'failed';
  pdfUrl: string | null;
  issuedAt: string | null;
}

/** 403s server-side for a 'member' role — only a company admin sees
 * invoices (server/routes.ts). */
export async function listMyCompanyInvoices(sessionToken: string): Promise<CompanyInvoice[]> {
  return authedRequest('/api/accounts/me/company/invoices', sessionToken);
}

/** Bills a 'created' order to the account's company instead of a real
 * payment (server/accountOrderStore.ts's payOrderForCompany) — the
 * "checkout" step for anyone this portal lets in at all, since every
 * business/ visitor is, by definition, a company member. */
export async function payOrderForCompany(sessionToken: string, orderId: string): Promise<void> {
  await authedRequest(`/api/accounts/orders/${orderId}/pay-company`, sessionToken, {
    method: 'POST',
  });
}

/** Sets the invited person's real password and marks their invite accepted
 * in one step (server/routes.ts) — unauthenticated, the token itself
 * (emailed by server/companyStore.ts's inviteCompanyMember) is the proof of
 * identity, same as email-verification. Returns a session, logging them
 * straight in. */
export async function acceptCompanyInvite(
  token: string,
  password: string,
): Promise<{ accountId: string; email: string; sessionToken: string }> {
  const response = await fetch(`${API_BASE_URL}/api/companies/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? 'Request failed');
  }
  return data;
}
