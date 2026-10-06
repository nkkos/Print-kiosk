import { publicBackendUrl } from './lanIp.js';

// The one seam to the online payment page (docs/payments-technical-requirements.md,
// "Online checkout (portal)"), same role as paymentTerminal.ts for the stands.
//   ONLINE_CHECKOUT=simulator (default) — a payment page of our own
//     (GET /payments/simulator/:orderCode) with "Pay" / "Cancel" buttons;
//   ONLINE_CHECKOUT=viva — Viva Smart Checkout:
//     VIVA_CHECKOUT_CLIENT_ID / VIVA_CHECKOUT_CLIENT_SECRET (Settings → API
//     Access → Smart Checkout credentials) to create the payment order,
//     VIVA_MERCHANT_ID / VIVA_API_KEY to read its state back,
//     VIVA_CHECKOUT_SOURCE_CODE — the payment source whose Success/Failure
//     URLs point at GET /payments/return (optional; Viva's default source
//     otherwise).
// Whatever the customer's browser comes back with, the payment is only ever
// confirmed by asking the provider (getState), never from the redirect.

export interface CreateCheckoutInput {
  /** Our payment order id — the provider's merchant reference. */
  reference: string;
  amountCents: number;
  email: string | null;
  /** What the customer pays for, shown on the payment page. */
  description: string;
}

export type CheckoutState =
  | { state: 'pending' }
  | { state: 'paid'; transactionId: string | null }
  | { state: 'expired' }
  | { state: 'cancelled' };

export interface OnlineCheckout {
  readonly provider: 'simulator' | 'viva';
  /** Creates the provider's payment order; returns its code and the page to
   * send the customer to. */
  createOrder(input: CreateCheckoutInput): Promise<{ orderCode: string; checkoutUrl: string }>;
  getState(orderCode: string): Promise<CheckoutState>;
}

// --- Simulator --------------------------------------------------------------

const simulatedOrders = new Map<string, CheckoutState>();
let simulatedCounter = 0;

export const simulatorCheckout: OnlineCheckout & {
  settle(orderCode: string, outcome: 'paid' | 'cancelled'): boolean;
} = {
  provider: 'simulator',
  async createOrder() {
    simulatedCounter += 1;
    const orderCode = `${Date.now()}${String(simulatedCounter).padStart(3, '0')}`;
    simulatedOrders.set(orderCode, { state: 'pending' });
    return {
      orderCode,
      checkoutUrl: `${publicBackendUrl()}/payments/simulator/${orderCode}`,
    };
  },
  async getState(orderCode) {
    // Lost on restart — reads as expired, like an abandoned real order.
    return simulatedOrders.get(orderCode) ?? { state: 'expired' };
  },
  settle(orderCode, outcome) {
    if (simulatedOrders.get(orderCode)?.state !== 'pending') return false;
    simulatedOrders.set(
      orderCode,
      outcome === 'paid'
        ? { state: 'paid', transactionId: `sim-checkout-tx-${orderCode}` }
        : { state: 'cancelled' },
    );
    return true;
  },
};

// --- Viva Smart Checkout -----------------------------------------------------

const LIVE = process.env.VIVA_ENV === 'live';
const ACCOUNTS_URL = LIVE
  ? 'https://accounts.vivapayments.com'
  : 'https://demo-accounts.vivapayments.com';
const API_URL = LIVE ? 'https://api.vivapayments.com' : 'https://demo-api.vivapayments.com';
const PAYMENTS_URL = LIVE ? 'https://www.vivapayments.com' : 'https://demo.vivapayments.com';
const REQUEST_TIMEOUT_MS = 15_000;
/** How long Viva keeps the payment order open, in seconds. */
export const CHECKOUT_TIMEOUT_SECONDS = 30 * 60;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function bearerToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const basic = Buffer.from(
    `${required('VIVA_CHECKOUT_CLIENT_ID')}:${required('VIVA_CHECKOUT_CLIENT_SECRET')}`,
  ).toString('base64');
  const response = await fetch(`${ACCOUNTS_URL}/connect/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Viva token request failed (HTTP ${response.status})`);
  const body = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

function merchantBasicAuth(): string {
  return `Basic ${Buffer.from(`${required('VIVA_MERCHANT_ID')}:${required('VIVA_API_KEY')}`).toString('base64')}`;
}

export const vivaCheckout: OnlineCheckout = {
  provider: 'viva',

  async createOrder({ reference, amountCents, email, description }) {
    const sourceCode = process.env.VIVA_CHECKOUT_SOURCE_CODE;
    const response = await fetch(`${API_URL}/checkout/v2/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await bearerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountCents,
        customerTrns: description,
        customer: { ...(email ? { email } : {}), countryCode: 'SK', requestLang: 'sk-SK' },
        paymentTimeout: CHECKOUT_TIMEOUT_SECONDS,
        merchantTrns: reference,
        ...(sourceCode ? { sourceCode } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // The 16-digit order code exceeds JavaScript's safe integers — read it
    // from the raw text, never through JSON.parse (Viva's own advice).
    const text = await response.text();
    const orderCode = /"orderCode"\s*:\s*"?(\d+)"?/.exec(text)?.[1];
    if (!response.ok || !orderCode) {
      throw new Error(`Viva payment order failed (HTTP ${response.status})`);
    }
    return { orderCode, checkoutUrl: `${PAYMENTS_URL}/web/checkout?ref=${orderCode}` };
  },

  async getState(orderCode) {
    const response = await fetch(`${PAYMENTS_URL}/api/orders/${orderCode}`, {
      headers: { Authorization: merchantBasicAuth() },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Viva order lookup failed (HTTP ${response.status})`);
    // StateId: 0 pending, 1 expired, 2 canceled, 3 paid.
    const { StateId } = (await response.json()) as { StateId: number };
    if (StateId === 1) return { state: 'expired' };
    if (StateId === 2) return { state: 'cancelled' };
    if (StateId !== 3) return { state: 'pending' };
    // The transaction id is what a later refund needs.
    const tx = await fetch(`${PAYMENTS_URL}/api/transactions?ordercode=${orderCode}`, {
      headers: { Authorization: merchantBasicAuth() },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = tx.ok
      ? ((await tx.json()) as { Transactions?: { TransactionId: string; StatusId: string }[] })
      : {};
    const paid = body.Transactions?.find((t) => t.StatusId === 'F') ?? body.Transactions?.[0];
    return { state: 'paid', transactionId: paid?.TransactionId ?? null };
  },
};

export function getOnlineCheckout(): OnlineCheckout {
  const configured = process.env.ONLINE_CHECKOUT ?? 'simulator';
  if (configured === 'viva') return vivaCheckout;
  if (configured !== 'simulator') {
    throw new Error(`ONLINE_CHECKOUT=${configured} is not a known checkout`);
  }
  return simulatorCheckout;
}

/** The key Viva's webhook verification GET expects back
 * (GET /api/messages/config/token, Basic auth). */
export async function vivaWebhookKey(): Promise<string> {
  const response = await fetch(`${PAYMENTS_URL}/api/messages/config/token`, {
    headers: { Authorization: merchantBasicAuth() },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Viva webhook key request failed (HTTP ${response.status})`);
  const { Key } = (await response.json()) as { Key: string };
  return Key;
}
