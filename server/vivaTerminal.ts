import { randomUUID } from 'node:crypto';
import type {
  PaymentTerminal,
  RefundInput,
  RefundOutcome,
  StartSaleInput,
  TerminalOutcome,
} from './paymentTerminal.js';

// Viva Cloud Terminal API client (docs/payments-technical-requirements.md,
// "Kiosk payment flow"; Viva's spec: developer.viva.com/downloads/eft-pos-api.yml).
// Our backend starts a sale on the stand's own terminal over REST — no local
// network link between stand and terminal — then polls the session.
//
// Config (.env / Railway variables):
//   VIVA_ENV=demo|live
//   VIVA_POS_CLIENT_ID / VIVA_POS_CLIENT_SECRET — Settings → API Access →
//     POS APIs credentials (OAuth2 client credentials for the ECR API)
//   VIVA_MERCHANT_ID / VIVA_API_KEY — Basic auth for refunds (Payment API)
//   VIVA_TERMINAL_IDS="A:16001234,B:16005678" — stand id → Viva terminal id;
//     a single entry also serves a request with no stand id (local testing)
//
// Refunds go through the Payment API's cancel/refund call, server to server,
// so the customer needn't present the card again — to confirm with Viva for
// card-present sales on the CM30P.

const LIVE = process.env.VIVA_ENV === 'live';
const ACCOUNTS_URL = LIVE
  ? 'https://accounts.vivapayments.com'
  : 'https://demo-accounts.vivapayments.com';
const ECR_URL = LIVE ? 'https://api.vivapayments.com' : 'https://demo-api.vivapayments.com';
const PAYMENTS_URL = LIVE ? 'https://www.vivapayments.com' : 'https://demo.vivapayments.com';
const EURO = '978';
// Set by us; Viva lets only the cash register that created a session abort it.
const CASH_REGISTER_ID = process.env.VIVA_CASH_REGISTER_ID ?? 'print-kiosk';
const REQUEST_TIMEOUT_MS = 15_000;
// An abort is accepted, then carried out on the terminal — wait this long
// for the session's final state before answering.
const ABORT_SETTLE_MS = 8_000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function terminalIdFor(standId: string | null): string {
  const entries = (process.env.VIVA_TERMINAL_IDS ?? '')
    .split(',')
    .map((pair) => pair.split(':').map((part) => part.trim()))
    .filter((pair): pair is [string, string] => pair.length === 2 && !!pair[0] && !!pair[1]);
  const match = entries.find(([stand]) => stand === standId);
  if (match) return match[1];
  if (entries.length === 1) return entries[0][1];
  throw new Error(`No Viva terminal configured for stand ${standId ?? '(none)'}`);
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function bearerToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const basic = Buffer.from(
    `${required('VIVA_POS_CLIENT_ID')}:${required('VIVA_POS_CLIENT_SECRET')}`,
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
  if (!response.ok) {
    throw new Error(`Viva token request failed (HTTP ${response.status})`);
  }
  const body = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

async function ecr(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${ECR_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${await bearerToken()}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/** Error IDs a finished, unsuccessful session carries (Viva spec, "Error IDs"). */
function failedOutcome(eventId: number | undefined, message: string | undefined): TerminalOutcome {
  const reason = `viva-${eventId ?? 'unknown'}${message ? `: ${message}` : ''}`;
  switch (eventId) {
    case 1000: // canceled by user
      return { state: 'cancelled', reason };
    case 1003: // the terminal stopped waiting for the card (~60 s, its own limit)
      return { state: 'timed-out', reason };
    case 1004: // terminal declined
    case 1006: // declined by server
    case 1007: // declined by card
    case 1010: // invalid card
      return { state: 'declined', reason };
    default:
      return { state: 'failed', reason };
  }
}

interface VivaSession {
  success?: boolean;
  eventId?: number;
  transactionId?: string;
  message?: string;
  abortSuccess?: boolean;
}

async function sessionOutcome(sessionId: string): Promise<TerminalOutcome> {
  const response = await ecr(`/ecr/v1/sessions/${sessionId}`);
  // 202: still on the terminal. 404 right after creating: not saved yet.
  if (response.status === 202 || response.status === 404) return { state: 'pending' };
  if (!response.ok) throw new Error(`Viva session lookup failed (HTTP ${response.status})`);
  const session = (await response.json()) as VivaSession;
  if (session.success && session.transactionId) {
    return { state: 'paid', transactionId: session.transactionId };
  }
  if (session.abortSuccess) return { state: 'cancelled', reason: 'aborted' };
  return failedOutcome(session.eventId, session.message);
}

export const vivaTerminal: PaymentTerminal = {
  provider: 'viva',

  async startSale({ reference, standId, amountCents }: StartSaleInput) {
    const sessionId = randomUUID();
    const response = await ecr('/ecr/v1/transactions:sale', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        terminalId: terminalIdFor(standId),
        cashRegisterId: CASH_REGISTER_ID,
        amount: amountCents,
        currencyCode: EURO,
        merchantReference: reference,
        customerTrns: 'Tlač dokumentov / Document printing',
        tipAmount: 0,
        showTransactionResult: true,
        showReceipt: false,
      }),
    });
    if (!response.ok) {
      const eventId = response.headers.get('X-viva-eventid');
      throw new Error(`Viva sale request failed (HTTP ${response.status}, event ${eventId})`);
    }
    return { sessionId };
  },

  getOutcome: sessionOutcome,

  async abort(sessionId) {
    const response = await ecr(
      `/ecr/v1/sessions/${sessionId}?cashRegisterId=${encodeURIComponent(CASH_REGISTER_ID)}`,
      { method: 'DELETE' },
    );
    // 409: an abort is already under way — just wait for it like this one.
    if (!response.ok && response.status !== 409) {
      return sessionOutcome(sessionId);
    }
    const deadline = Date.now() + ABORT_SETTLE_MS;
    for (;;) {
      const outcome = await sessionOutcome(sessionId);
      if (outcome.state !== 'pending' || Date.now() > deadline) return outcome;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  },

  async refund({ transactionId, amountCents }: RefundInput): Promise<RefundOutcome> {
    const basic = Buffer.from(
      `${required('VIVA_MERCHANT_ID')}:${required('VIVA_API_KEY')}`,
    ).toString('base64');
    const response = await fetch(
      `${PAYMENTS_URL}/api/transactions/${transactionId}?amount=${amountCents}&currencyCode=${EURO}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Basic ${basic}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const body = (await response.json().catch(() => ({}))) as {
      TransactionId?: string;
      ErrorCode?: number;
      ErrorText?: string | null;
      Success?: boolean;
    };
    if (response.ok && (body.Success ?? body.ErrorCode === 0) && body.TransactionId) {
      return { state: 'succeeded', refundId: body.TransactionId };
    }
    return {
      state: 'failed',
      reason: `viva-refund HTTP ${response.status}${body.ErrorText ? `: ${body.ErrorText}` : ''}`,
    };
  },
};

/** The merchant's terminals and their status — for finding Terminal IDs
 * (server/scripts/vivaDevices.ts). */
export async function searchDevices(): Promise<unknown> {
  const response = await ecr('/ecr/v1/devices:search', { method: 'POST', body: '{}' });
  if (!response.ok) throw new Error(`Viva device search failed (HTTP ${response.status})`);
  return response.json();
}

export interface VivaTransaction {
  transactionId: string;
  amountCents: number;
  /** Viva's status letter — F finished, X cancelled (voided the same day),
   * A in progress, E error… */
  statusId: string;
  parentId: string | null;
  merchantReference: string | null;
  createdAt: Date;
}

/** The merchant's transactions Viva recorded on one calendar day (Viva's own
 * time zone) — sales positive, refunds negative — for the daily
 * reconciliation (server/paymentReconciliation.ts). Null when Viva isn't
 * configured. */
export async function listVivaTransactions(day: string): Promise<VivaTransaction[] | null> {
  if (!process.env.VIVA_MERCHANT_ID || !process.env.VIVA_API_KEY) return null;
  const basic = Buffer.from(`${process.env.VIVA_MERCHANT_ID}:${process.env.VIVA_API_KEY}`).toString(
    'base64',
  );
  const response = await fetch(`${PAYMENTS_URL}/api/transactions?date=${day}`, {
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Viva transaction list failed (HTTP ${response.status})`);
  const body = (await response.json()) as {
    Transactions?: {
      TransactionId: string;
      Amount: number;
      StatusId: string;
      ParentId: string | null;
      MerchantTrns: string | null;
      InsDate: string;
    }[];
  };
  return (body.Transactions ?? []).map((t) => ({
    transactionId: t.TransactionId,
    amountCents: Math.round(t.Amount * 100),
    statusId: t.StatusId,
    parentId: t.ParentId,
    merchantReference: t.MerchantTrns,
    createdAt: new Date(t.InsDate),
  }));
}
