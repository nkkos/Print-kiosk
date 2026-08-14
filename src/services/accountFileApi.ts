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
  quantity: number;
  unitPriceCents: number;
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

/** Pays a 'created' order — 'created' -> 'paid'. */
export async function payOrder(sessionToken: string, orderId: string): Promise<AccountOrder> {
  return authedRequest(`/api/accounts/orders/${orderId}/pay`, sessionToken, { method: 'POST' });
}

/** Every order for the account, any status — the portal's own full "My
 * orders" history. */
export async function listMyOrders(sessionToken: string): Promise<AccountOrder[]> {
  return authedRequest('/api/accounts/orders', sessionToken);
}

// --- Kiosk ---

export async function listAccountFiles(accountId: string): Promise<AccountFile[]> {
  const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/files`);
  return response.json();
}

export async function listAccountFolders(accountId: string): Promise<AccountFolder[]> {
  const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/folders`);
  return response.json();
}

export async function listAccountOrders(accountId: string): Promise<AccountOrder[]> {
  const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/orders`);
  return response.json();
}
