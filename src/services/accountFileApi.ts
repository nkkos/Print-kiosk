import type { PagesPerSheet } from '../utils/nUpLayout';

// Personal Account's "My files"/"My orders" (docs/personal-account-requirements.md,
// server/accountFileStore.ts, server/accountOrderStore.ts). Two audiences,
// two auth models, both hitting the same backend:
// - The portal (session-token-authenticated, mirrors src/services/accountApi.ts's
//   postJson) creates/manages folders, files, and paid orders.
// - The kiosk (accountId-only, no token — it's never carried one) only reads.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export interface AccountFolder {
  id: string;
  name: string;
}

export interface AccountFile {
  id: string;
  fileName: string;
  folderId: string | null;
  status: 'scanning' | 'converting' | 'ready' | 'rejected' | 'scan-unavailable';
}

export interface AccountFileLimits {
  acceptedExtensions: string[];
  retentionDays: number;
  maxTotalStorageMb: number;
}

/** The current, env-configured Personal Account file limits
 * (server/accountFileLimits.ts) — fetched live rather than hardcoded on the
 * frontend, since they're expected to change often. */
export async function getAccountFileLimits(): Promise<AccountFileLimits> {
  const response = await fetch(`${API_BASE_URL}/api/accounts/file-limits`);
  return response.json();
}

export interface AccountOrder {
  id: string;
  fileName: string;
  accountFileId: string | null;
  paperSize: 'A4' | 'A5';
  sides: 'single' | 'double';
  color: 'bw' | 'color';
  orientation: 'portrait' | 'landscape';
  scale: 'fit' | 'original';
  /** The exact pdf-to-printer page-range syntax ("2-5") — null means every
   * page, matching the kiosk's own PrintOrder.pageRange (src/types/kiosk.ts). */
  pageRange: string | null;
  /** Pages per printed sheet side (src/utils/nUpLayout.ts) — 1 for orders
   * created before this existed. */
  pagesPerSheet: PagesPerSheet;
  quantity: number;
  unitPriceCents: number;
  /** 'created' (configured, not paid) | 'paid' (awaiting fulfillment) |
   * 'issued' (its print job succeeded at the kiosk) — see
   * docs/personal-account-requirements.md, "Order status lifecycle". */
  status: 'created' | 'paid' | 'issued';
}

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

// --- Portal ---

export async function createFolder(sessionToken: string, name: string): Promise<AccountFolder> {
  return authedRequest('/api/accounts/folders', sessionToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function listMyFolders(sessionToken: string): Promise<AccountFolder[]> {
  return authedRequest('/api/accounts/folders', sessionToken);
}

export async function renameFolder(sessionToken: string, id: string, name: string): Promise<void> {
  await authedRequest(`/api/accounts/folders/${id}`, sessionToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function deleteFolder(sessionToken: string, id: string): Promise<void> {
  await authedRequest(`/api/accounts/folders/${id}`, sessionToken, { method: 'DELETE' });
}

export async function uploadFiles(
  sessionToken: string,
  files: File[],
  folderId?: string,
): Promise<AccountFile[]> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  if (folderId) form.append('folderId', folderId);
  return authedRequest('/api/accounts/files', sessionToken, { method: 'POST', body: form });
}

export async function listMyFiles(sessionToken: string): Promise<AccountFile[]> {
  return authedRequest('/api/accounts/files', sessionToken);
}

export async function deleteFile(sessionToken: string, id: string): Promise<void> {
  await authedRequest(`/api/accounts/files/${id}`, sessionToken, { method: 'DELETE' });
}

// Deliberately unauthenticated (no token param) — server/routes.ts's content
// endpoint is intentionally open, since the kiosk (tokenless) needs to hit
// the exact same URL for its own real preview.
export function getAccountFileContentUrl(fileId: string): string {
  return `${API_BASE_URL}/api/account-files/${fileId}/content`;
}

export interface CreateOrderParams {
  accountFileId: string;
  fileName: string;
  paperSize: 'A4' | 'A5';
  sides: 'single' | 'double';
  color: 'bw' | 'color';
  orientation: 'portrait' | 'landscape';
  scale: 'fit' | 'original';
  pageRange?: string;
  pagesPerSheet?: PagesPerSheet;
  quantity: number;
  /** Pages selected for printing — the server prices the order from it
   * (src/utils/tariff.ts). */
  pageCount: number;
}

/** Configures an order without paying for it yet — 'created' state
 * (docs/personal-account-requirements.md, "Order status lifecycle"). */
export async function createOrder(
  sessionToken: string,
  params: CreateOrderParams,
): Promise<AccountOrder> {
  return authedRequest('/api/accounts/orders', sessionToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export interface OnlineCheckoutStart {
  paymentId: string;
  /** The payment page to send the customer to — null when nothing was due
   * and the order is already paid. */
  checkoutUrl: string | null;
}

/** Opens an online payment for a 'created' order
 * (server/onlineCheckoutStore.ts) — the order becomes 'paid' once the
 * payment provider confirms, after the customer returns. */
export async function payOrder(
  sessionToken: string,
  orderId: string,
): Promise<OnlineCheckoutStart> {
  return authedRequest(`/api/accounts/orders/${orderId}/pay`, sessionToken, { method: 'POST' });
}

export interface OnlinePayment {
  id: string;
  /** 'awaiting-payment' | 'paid' | 'cancelled' | 'timed-out' | 'failed' */
  status: string;
  amountCents: number;
  returnTo: 'portal' | 'shop';
  result: { paymentOrderId: string; printOrderIds: string[]; shopOrderId: string | null } | null;
}

/** An online payment's outcome — confirmed with the provider by the server. */
export async function getOnlinePayment(
  sessionToken: string,
  paymentId: string,
): Promise<OnlinePayment> {
  return authedRequest(`/api/online-payments/${paymentId}`, sessionToken);
}

/** Polls an online payment until it leaves 'awaiting-payment' (or gives up
 * after about a minute, leaving it to the server's own background check). */
export async function waitForOnlinePayment(
  sessionToken: string,
  paymentId: string,
): Promise<OnlinePayment> {
  let payment = await getOnlinePayment(sessionToken, paymentId);
  for (let attempt = 0; payment.status === 'awaiting-payment' && attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    payment = await getOnlinePayment(sessionToken, paymentId);
  }
  return payment;
}

/** Every order for the account, any status — the portal's own full "My
 * orders" history. */
export async function listMyOrders(sessionToken: string): Promise<AccountOrder[]> {
  return authedRequest('/api/accounts/orders', sessionToken);
}

// --- Kiosk ---

export async function listAccountFiles(
  accountId: string,
  sessionToken: string,
): Promise<AccountFile[]> {
  const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/files`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  return response.json();
}

export async function listAccountFolders(
  accountId: string,
  sessionToken: string,
): Promise<AccountFolder[]> {
  const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/folders`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  return response.json();
}

export async function listAccountOrders(
  accountId: string,
  sessionToken: string,
): Promise<AccountOrder[]> {
  const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/orders`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  return response.json();
}
