import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db/client.js';
import { paymentItems, paymentOrders, printOrders } from './db/schema.js';
import { getPaymentTerminal, type TerminalOutcome } from './paymentTerminal.js';
import { isPaperSizeOffered, supportsDuplex } from './printerAdapter.js';
import { isPagesPerSheet, sheetSidesFor } from '../src/utils/nUpLayout.js';
import { PRINT_VAT_RATE_PERCENT, unitPriceCentsFor } from '../src/utils/tariff.js';

// Kiosk card payments on the stand's terminal (docs/payments-technical-requirements.md,
// "Kiosk payment flow"). The server prices the selection itself — the
// stand's own total is display only — and owns the payment's state machine:
// 'awaiting-card' -> 'paid' | 'declined' | 'cancelled' | 'timed-out' | 'failed'.

/** How long the customer has to pay on the terminal (business requirements,
 * "Kiosk: the customer's journey"). */
export const PAYMENT_WINDOW_MS = 90_000;

const OPEN_STATUSES = ['awaiting-card', 'unknown'];

export interface PaymentItemInput {
  cartItemId: string;
  fileName: string;
  fileId?: string;
  sourceFileOrigin?: 'upload' | 'account';
  /** The portal order this item was paid in advance by, if any. */
  sourcePaidOrderId?: string;
  paperSize: string;
  sides: 'single' | 'double';
  color: 'bw' | 'color';
  orientation: 'portrait' | 'landscape';
  scale: 'fit' | 'original';
  pages?: string;
  pagesPerSheet: number;
  /** Pages selected for printing — what the stand priced from. */
  pageCount: number;
  quantity: number;
}

export interface PaymentView {
  id: string;
  status: string;
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

export class PaymentInputError extends Error {}

/** Receipt line text — Slovak, since it ends up on the eKasa receipt. */
function describeItem(item: PaymentItemInput): string {
  const color = item.color === 'color' ? 'farebne' : 'ČB';
  const sides = item.sides === 'double' ? 'obojstranne' : 'jednostranne';
  return `Tlač ${item.paperSize} ${color} ${sides}`;
}

function parseItem(raw: unknown): PaymentItemInput {
  const item = (raw ?? {}) as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
  const int = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
  const cartItemId = str(item.cartItemId);
  const pageCount = int(item.pageCount);
  const quantity = int(item.quantity);
  const paperSize = str(item.paperSize);
  if (!cartItemId || !pageCount || !quantity || !paperSize || !isPaperSizeOffered(paperSize)) {
    throw new PaymentInputError('Invalid cart item');
  }
  if (item.sides !== 'single' && item.sides !== 'double') throw new PaymentInputError('sides');
  if (item.color !== 'bw' && item.color !== 'color') throw new PaymentInputError('color');
  if (item.sides === 'double' && !supportsDuplex(paperSize)) {
    throw new PaymentInputError('Double-sided printing is not available for this paper size');
  }
  const pagesPerSheet = item.pagesPerSheet ?? 1;
  if (!isPagesPerSheet(pagesPerSheet)) throw new PaymentInputError('pagesPerSheet');
  return {
    cartItemId,
    fileName: str(item.fileName) ?? 'document',
    fileId: str(item.fileId),
    sourceFileOrigin: item.sourceFileOrigin === 'account' ? 'account' : 'upload',
    sourcePaidOrderId: str(item.sourcePaidOrderId),
    paperSize,
    sides: item.sides,
    color: item.color,
    orientation: item.orientation === 'landscape' ? 'landscape' : 'portrait',
    scale: item.scale === 'original' ? 'original' : 'fit',
    pages: str(item.pages),
    pagesPerSheet,
    pageCount,
    quantity,
  };
}

/** Copies already paid for online — read from the portal order itself,
 * never taken from the stand. */
async function prepaidQuantities(orderIds: string[]): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map();
  const rows = await db
    .select({ id: printOrders.id, quantity: printOrders.quantity })
    .from(printOrders)
    .where(and(inArray(printOrders.id, orderIds), eq(printOrders.status, 'paid')));
  return new Map(rows.map((row) => [row.id, row.quantity]));
}

/** Prices the selection and starts the sale on the stand's terminal. Items
 * fully paid in advance cost nothing; returns null when nothing is payable
 * (the stand then prints straight away, as today). */
export async function createKioskPayment(input: {
  sessionId: string | null;
  standId: string | null;
  items: unknown[];
}): Promise<PaymentView | null> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new PaymentInputError('No items');
  }
  const items = input.items.map(parseItem);
  const prepaid = await prepaidQuantities(
    items.flatMap((item) => (item.sourcePaidOrderId ? [item.sourcePaidOrderId] : [])),
  );

  const priced = items.map((item) => {
    const unitPriceCents = unitPriceCentsFor(
      sheetSidesFor(item.pageCount, item.pagesPerSheet as 1 | 2 | 4 | 6),
      item.paperSize,
      item.color,
      item.sides,
    );
    if (unitPriceCents === null) throw new PaymentInputError('No price for this configuration');
    const paidQuantity = item.sourcePaidOrderId ? (prepaid.get(item.sourcePaidOrderId) ?? 0) : 0;
    const chargedQuantity = Math.max(0, item.quantity - paidQuantity);
    return { item, unitPriceCents, chargedQuantity };
  });
  const amountCents = priced.reduce(
    (sum, line) => sum + line.unitPriceCents * line.chargedQuantity,
    0,
  );
  if (amountCents === 0) return null;

  const terminal = getPaymentTerminal();
  const [order] = await db
    .insert(paymentOrders)
    .values({
      sessionId: input.sessionId,
      channel: 'kiosk-terminal',
      standId: input.standId,
      provider: terminal.provider,
      status: 'awaiting-card',
      amountCents,
      expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MS),
    })
    .returning({ id: paymentOrders.id });
  await db.insert(paymentItems).values(
    priced.map(({ item, unitPriceCents, chargedQuantity }) => ({
      paymentOrderId: order.id,
      cartItemId: item.cartItemId,
      description: describeItem(item),
      quantity: chargedQuantity,
      unitPriceCents,
      amountCents: unitPriceCents * chargedQuantity,
      vatRatePercent: PRINT_VAT_RATE_PERCENT,
      printConfig: JSON.stringify(item),
    })),
  );

  try {
    const { sessionId } = await terminal.startSale({
      reference: order.id,
      standId: input.standId,
      amountCents,
    });
    await db
      .update(paymentOrders)
      .set({ providerSessionId: sessionId, updatedAt: new Date() })
      .where(eq(paymentOrders.id, order.id));
  } catch (error) {
    await settle(order.id, {
      state: 'failed',
      reason: error instanceof Error ? error.message : 'terminal-unreachable',
    });
  }
  return getPaymentView(order.id);
}

/** Moves an open payment to its final state — a no-op once it's settled, so
 * a webhook and a poll arriving together can't both apply. */
async function settle(id: string, outcome: TerminalOutcome | { state: 'timed-out' }) {
  if (outcome.state === 'pending') return;
  const now = new Date();
  await db
    .update(paymentOrders)
    .set(
      outcome.state === 'paid'
        ? {
            status: 'paid',
            paidAt: now,
            providerTransactionId: outcome.transactionId,
            updatedAt: now,
          }
        : {
            status: outcome.state,
            failureReason: 'reason' in outcome ? outcome.reason : null,
            updatedAt: now,
          },
    )
    .where(and(eq(paymentOrders.id, id), inArray(paymentOrders.status, OPEN_STATUSES)));
}

/** Brings an open payment up to date with the terminal (and the 90-second
 * window), then returns it. Called by the stand's polling. */
export async function refreshPayment(id: string): Promise<PaymentView | null> {
  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, id));
  if (!order || order.channel !== 'kiosk-terminal') return null;
  if (OPEN_STATUSES.includes(order.status) && order.providerSessionId) {
    const terminal = getPaymentTerminal();
    let outcome = await terminal.getOutcome(order.providerSessionId);
    if (outcome.state === 'pending' && order.expiresAt && order.expiresAt.getTime() < Date.now()) {
      outcome = await terminal.abort(order.providerSessionId);
      await settle(id, outcome.state === 'cancelled' ? { state: 'timed-out' } : outcome);
    } else {
      await settle(id, outcome);
    }
  }
  return getPaymentView(id);
}

/** The customer's "Cancel" on the stand. The terminal's answer decides: a
 * card accepted a moment earlier still makes the payment 'paid'. */
export async function cancelPayment(id: string): Promise<PaymentView | null> {
  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, id));
  if (!order || order.channel !== 'kiosk-terminal') return null;
  if (OPEN_STATUSES.includes(order.status) && order.providerSessionId) {
    await settle(id, await getPaymentTerminal().abort(order.providerSessionId));
  }
  return getPaymentView(id);
}

export async function getProviderSessionId(id: string): Promise<string | null> {
  const [order] = await db
    .select({ providerSessionId: paymentOrders.providerSessionId })
    .from(paymentOrders)
    .where(eq(paymentOrders.id, id));
  return order?.providerSessionId ?? null;
}

export async function getPaymentView(id: string): Promise<PaymentView | null> {
  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, id));
  if (!order) return null;
  const items = await db
    .select({
      id: paymentItems.id,
      cartItemId: paymentItems.cartItemId,
      description: paymentItems.description,
      quantity: paymentItems.quantity,
      unitPriceCents: paymentItems.unitPriceCents,
      amountCents: paymentItems.amountCents,
    })
    .from(paymentItems)
    .where(eq(paymentItems.paymentOrderId, id));
  return {
    id: order.id,
    status: order.status,
    amountCents: order.amountCents,
    failureReason: order.failureReason,
    expiresAt: order.expiresAt?.toISOString() ?? null,
    items,
  };
}
