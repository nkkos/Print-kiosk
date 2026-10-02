import { standHeaders } from './standAuth';
import type { PrintOrder } from '../types/kiosk';

// Talks to the kiosk card-payment backend (server/paymentStore.ts) — see
// docs/payments-technical-requirements.md, "Kiosk payment flow". The server
// prices the selection itself; the totals shown come from its answer.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export type PaymentStatus =
  'awaiting-card' | 'unknown' | 'paid' | 'declined' | 'cancelled' | 'timed-out' | 'failed';

export type ReceiptDelivery = 'qr' | 'email' | 'paper';

export interface Payment {
  id: string;
  status: PaymentStatus;
  provider: string | null;
  receiptDelivery: ReceiptDelivery | null;
  amountCents: number;
  failureReason: string | null;
  expiresAt: string | null;
  items: {
    id: string;
    cartItemId: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    amountCents: number;
  }[];
}

export type SimulatedPaymentOutcome = 'paid' | 'declined' | 'cancelled-on-terminal' | 'failed';

async function readPayment(response: Response): Promise<Payment> {
  if (!response.ok) throw new Error(`Payment request failed (${response.status})`);
  return response.json();
}

/** Starts the sale on this stand's terminal. `null` = nothing to pay (every
 * item was paid in advance on the portal). */
export async function createPayment(
  sessionId: string | null,
  standId: string | null,
  items: PrintOrder[],
): Promise<Payment | null> {
  const response = await fetch(`${API_BASE_URL}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...standHeaders() },
    body: JSON.stringify({
      sessionId,
      standId,
      items: items.map((item) => ({
        cartItemId: item.id,
        fileName: item.fileName,
        fileId: item.sourceFileId,
        sourceFileOrigin: item.sourceFileOrigin,
        sourcePaidOrderId: item.sourcePaidOrderId,
        paperSize: item.paperSize,
        sides: item.sides,
        color: item.color,
        orientation: item.orientation,
        scale: item.scale,
        pages: item.pageRange,
        pagesPerSheet: item.pagesPerSheet ?? 1,
        pageCount: item.pageCount,
        quantity: item.quantity,
      })),
    }),
  });
  if (response.status === 204) return null;
  return readPayment(response);
}

export async function getPayment(id: string): Promise<Payment> {
  return readPayment(
    await fetch(`${API_BASE_URL}/api/payments/${id}`, { headers: standHeaders() }),
  );
}

export async function cancelPayment(id: string): Promise<Payment> {
  return readPayment(
    await fetch(`${API_BASE_URL}/api/payments/${id}/cancel`, {
      method: 'POST',
      headers: standHeaders(),
    }),
  );
}

export async function chooseReceipt(
  id: string,
  via: ReceiptDelivery,
  email?: string,
): Promise<Payment> {
  return readPayment(
    await fetch(`${API_BASE_URL}/api/payments/${id}/receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...standHeaders() },
      body: JSON.stringify({ via, email }),
    }),
  );
}

/** Simulator only — the backend refuses it once a real terminal is set up. */
export async function simulatePayment(
  id: string,
  outcome: SimulatedPaymentOutcome,
): Promise<Payment> {
  return readPayment(
    await fetch(`${API_BASE_URL}/api/payments/${id}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...standHeaders() },
      body: JSON.stringify({ outcome }),
    }),
  );
}
