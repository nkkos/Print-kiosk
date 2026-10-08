import { vivaTerminal } from './vivaTerminal.js';

// The one seam to the card terminal (docs/payments-technical-requirements.md,
// "Principles" 4) — same role printerAdapter.ts plays for the printer.
// PAYMENT_TERMINAL=simulator (default) keeps every sale waiting until a
// "Simulate …" outcome is posted; PAYMENT_TERMINAL=viva uses the Viva Cloud
// Terminal API (server/vivaTerminal.ts).

export type TerminalOutcome =
  | { state: 'pending' }
  | { state: 'paid'; transactionId: string }
  | { state: 'declined'; reason: string }
  | { state: 'cancelled'; reason: string }
  | { state: 'timed-out'; reason: string }
  | { state: 'failed'; reason: string };

export interface StartSaleInput {
  /** Our payment order id — sent to the provider as the merchant reference,
   * so a sale can always be looked up again after a lost connection. */
  reference: string;
  standId: string | null;
  amountCents: number;
}

export interface PaymentTerminal {
  readonly provider: 'simulator' | 'viva';
  /** Starts the sale on the stand's own terminal; returns the provider's
   * session id. */
  startSale(input: StartSaleInput): Promise<{ sessionId: string }>;
  /** The provider's current view of a sale. */
  getOutcome(sessionId: string): Promise<TerminalOutcome>;
  /** Asks the terminal to stop waiting for a card. The returned outcome is
   * authoritative: a card accepted just before the abort means 'paid'. */
  abort(sessionId: string): Promise<TerminalOutcome>;
  /** Returns part or all of a paid sale to the same card, without the card
   * being presented again (to confirm with Viva for the CM30P). */
  refund(input: RefundInput): Promise<RefundOutcome>;
}

export interface RefundInput {
  /** The original sale's provider transaction id. */
  transactionId: string;
  amountCents: number;
  /** Our refund id — the provider's merchant reference for this refund. */
  reference: string;
}

export type RefundOutcome =
  { state: 'succeeded'; refundId: string } | { state: 'failed'; reason: string };

export type SimulatedOutcome = 'paid' | 'declined' | 'cancelled-on-terminal' | 'failed';

// In-memory simulator: a sale stays 'pending' until simulate() settles it.
// Lost on restart — a pending simulated sale then reads as 'failed', which
// is exactly the recovery path a real lost session takes.
const simulatedSales = new Map<string, TerminalOutcome>();

export const simulatorTerminal: PaymentTerminal & {
  simulate(sessionId: string, outcome: SimulatedOutcome): boolean;
} = {
  provider: 'simulator',
  async startSale({ reference }) {
    const sessionId = `sim-${reference}`;
    simulatedSales.set(sessionId, { state: 'pending' });
    return { sessionId };
  },
  async getOutcome(sessionId) {
    return simulatedSales.get(sessionId) ?? { state: 'failed', reason: 'unknown-session' };
  },
  async abort(sessionId) {
    const current = simulatedSales.get(sessionId);
    if (!current || current.state !== 'pending') {
      return current ?? { state: 'failed', reason: 'unknown-session' };
    }
    const aborted: TerminalOutcome = { state: 'cancelled', reason: 'aborted' };
    simulatedSales.set(sessionId, aborted);
    return aborted;
  },
  async refund({ reference }) {
    // PAYMENT_SIMULATE_REFUND_FAILURE=true exercises the "refund failed →
    // staff refund by hand" path without a real terminal.
    if (process.env.PAYMENT_SIMULATE_REFUND_FAILURE === 'true') {
      return { state: 'failed', reason: 'simulated-refund-failure' };
    }
    return { state: 'succeeded', refundId: `sim-refund-${reference}` };
  },
  simulate(sessionId, outcome) {
    const current = simulatedSales.get(sessionId);
    if (!current || current.state !== 'pending') return false;
    simulatedSales.set(
      sessionId,
      outcome === 'paid'
        ? { state: 'paid', transactionId: `sim-tx-${Date.now()}` }
        : outcome === 'declined'
          ? { state: 'declined', reason: 'card-declined' }
          : outcome === 'cancelled-on-terminal'
            ? { state: 'cancelled', reason: 'cancelled-on-terminal' }
            : { state: 'failed', reason: 'terminal-error' },
    );
    return true;
  },
};

export function getPaymentTerminal(): PaymentTerminal {
  const configured = process.env.PAYMENT_TERMINAL ?? 'simulator';
  if (configured === 'viva') return vivaTerminal;
  if (configured !== 'simulator') {
    // Refuse loudly rather than silently take simulated payments.
    throw new Error(`PAYMENT_TERMINAL=${configured} is not a known terminal`);
  }
  return simulatorTerminal;
}
