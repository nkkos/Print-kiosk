// Talks to the real shop backend (server/routes.ts's /api/shop/* and the shared
// /api/accounts/* routes) — see docs/shop-requirements.md, docs/shop-checkout-requirements.md.
// Reuses src/services/accountApi.ts's login/register directly rather than
// re-implementing them — same accounts table, same account, no separate shop identity.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string;
  fulfillmentType: 'self-service' | 'staff-fulfilled';
  priceCents: number;
  variantLabel: string | null;
  imageUrl: string | null;
  stockQuantity: number | null;
  active: boolean;
}

export interface AccountProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  invoiceCompanyName: string | null;
  invoiceTaxId: string | null;
}

export interface PrintOrder {
  id: string;
  fileName: string;
  quantity: number;
  unitPriceCents: number;
  status: 'created' | 'paid' | 'issued';
}

export interface ShopOrderItem {
  productId: string | null;
  productName: string;
  unitPriceCents: number;
  quantity: number;
}

export interface ShopOrder {
  id: string;
  fulfillmentMethod: string;
  status: string;
  createdAt: string;
  items: ShopOrderItem[];
}

export interface CheckoutResult {
  paymentOrderId: string;
  printOrderIds: string[];
  shopOrderId: string | null;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  sessionToken?: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? 'Request failed');
  }
  return data as T;
}

export async function listProducts(): Promise<Product[]> {
  return request('GET', '/api/shop/products');
}

export async function getMe(sessionToken: string): Promise<AccountProfile> {
  return request('GET', '/api/accounts/me', sessionToken);
}

export async function updateInvoiceDetails(
  sessionToken: string,
  invoiceCompanyName: string | null,
  invoiceTaxId: string | null,
): Promise<void> {
  await request('PATCH', '/api/accounts/invoice-details', sessionToken, {
    invoiceCompanyName,
    invoiceTaxId,
  });
}

export async function listPrintOrders(sessionToken: string): Promise<PrintOrder[]> {
  return request('GET', '/api/accounts/orders', sessionToken);
}

export async function listShopOrders(sessionToken: string): Promise<ShopOrder[]> {
  return request('GET', '/api/accounts/shop-orders', sessionToken);
}

export async function checkout(
  sessionToken: string,
  printOrderIds: string[],
  shopItems: { productId: string; quantity: number }[],
): Promise<CheckoutResult> {
  return request('POST', '/api/shop/checkout', sessionToken, { printOrderIds, shopItems });
}
