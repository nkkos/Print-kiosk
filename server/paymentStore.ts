import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './db/client.js';
import {
  paymentItems,
  paymentOrders,
  paymentRefunds,
  printOrders,
  shopOrders,
} from './db/schema.js';
import {
  getPaymentTerminal,
  simulatorTerminal,
  type PaymentTerminal,
  type RefundOutcome,
  type TerminalOutcome,
} from './paymentTerminal.js';
import { vivaTerminal } from './vivaTerminal.js';
import { reportIncident } from './incidentStore.js';
import {
  createReturnReceipt,
  createSaleReceipt,
  getSaleReceiptView,
  type SaleReceiptView,
} from './fiscalReceiptStore.js';
import { isPaperSizeOffered, supportsDuplex } from './printerAdapter.js';
import { isPagesPerSheet, sheetSidesFor } from '../src/utils/nUpLayout.js';
import {
  MINIMUM_CHARGE_DESCRIPTION,
  MINIMUM_CHARGE_ITEM_ID,
  PRINT_VAT_RATE_PERCENT,
  minimumChargeTopUp,
  unitPriceCentsFor,
} from '../src/utils/tariff.js';

/** The line that tops a payment up to Viva's minimum (never printed). */
export function minimumChargeItem(
  paymentOrderId: string,
  topUpCents: number,
): typeof paymentItems.$inferInsert {
  return {
    paymentOrderId,
    cartItemId: MINIMUM_CHARGE_ITEM_ID,
    description: MINIMUM_CHARGE_DESCRIPTION,
    quantity: 1,
    unitPriceCents: topUpCents,
    amountCents: topUpCents,
    vatRatePercent: PRINT_VAT_RATE_PERCENT,
    printConfig: '{}',
  };
}

// Kiosk card payments on the stand's terminal (docs/payments-technical-requirements.md,
// "Kiosk payment flow"). The server prices the selection itself — the
// stand's own total is display only — and owns the payment's state machine:
// 'awaiting-card' -> 'paid' | 'declined' | 'cancelled' | 'timed-out' | 'failed'.

/** How long the customer has to pay on the terminal (business requirements,
 * "Kiosk: the customer's journey"). */
export const PAYMENT_WINDOW_MS = 60_000;

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
  /** Pages selected for printing — what the stand priced from. 0 for a
   * paid-in-advance item, which is priced from its portal order instead. */
  pageCount: number;
  quantity: number;
}

export interface PaymentView {
  id: string;
  status: string;
  provider: string | null;
  receiptDelivery: string | null;
  /** The eKasa sale receipt, once the customer has chosen how to get it. */
  receipt: SaleReceiptView | null;
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
  const sourcePaidOrderId = str(item.sourcePaidOrderId);
  if (
    !cartItemId ||
    !quantity ||
    !paperSize ||
    !isPaperSizeOffered(paperSize) ||
    (!pageCount && !sourcePaidOrderId)
  ) {
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
    sourcePaidOrderId,
    paperSize,
    sides: item.sides,
    color: item.color,
    orientation: item.orientation === 'landscape' ? 'landscape' : 'portrait',
    scale: item.scale === 'original' ? 'original' : 'fit',
    pages: str(item.pages),
    pagesPerSheet,
    pageCount: pageCount ?? 0,
    quantity,
  };
}

/** Portal orders paid in advance — read from the order itself, never taken
 * from the stand: how many copies are paid, and the order's own unit price,
 * which extra copies raised on-site are charged at (the same price the
 * stand's Cart shows for them). */
async function prepaidOrders(
  orderIds: string[],
): Promise<Map<string, { quantity: number; unitPriceCents: number }>> {
  if (orderIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: printOrders.id,
      quantity: printOrders.quantity,
      unitPriceCents: printOrders.unitPriceCents,
    })
    .from(printOrders)
    .where(and(inArray(printOrders.id, orderIds), eq(printOrders.status, 'paid')));
  return new Map(rows.map((row) => [row.id, row]));
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
  const prepaid = await prepaidOrders(
    items.flatMap((item) => (item.sourcePaidOrderId ? [item.sourcePaidOrderId] : [])),
  );

  const priced = items.map((item) => {
    const order = item.sourcePaidOrderId ? prepaid.get(item.sourcePaidOrderId) : undefined;
    if (item.sourcePaidOrderId && !order) {
      throw new PaymentInputError('The paid order is not awaiting print');
    }
    const unitPriceCents = order
      ? order.unitPriceCents
      : unitPriceCentsFor(
          sheetSidesFor(item.pageCount, item.pagesPerSheet as 1 | 2 | 4 | 6),
          item.paperSize,
          item.color,
          item.sides,
        );
    if (unitPriceCents === null) throw new PaymentInputError('No price for this configuration');
    const chargedQuantity = Math.max(0, item.quantity - (order?.quantity ?? 0));
    return { item, unitPriceCents, chargedQuantity };
  });
  // Lines that cost nothing (fully paid in advance) aren't part of this
  // payment — they print on their portal order alone.
  const charged = priced.filter((line) => line.chargedQuantity > 0);
  const itemsCents = charged.reduce(
    (sum, line) => sum + line.unitPriceCents * line.chargedQuantity,
    0,
  );
  if (itemsCents === 0) return null;
  // Below Viva's minimum card payment the order is topped up with its own
  // line (src/utils/tariff.ts, MIN_CARD_PAYMENT_CENTS).
  const topUpCents = minimumChargeTopUp(itemsCents);
  const amountCents = itemsCents + topUpCents;

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
    charged.map(({ item, unitPriceCents, chargedQuantity }) => ({
      paymentOrderId: order.id,
      cartItemId: item.cartItemId,
      description: describeItem(item),
      quantity: chargedQuantity,
      unitPriceCents,
      amountCents: unitPriceCents * chargedQuantity,
      vatRatePercent: PRINT_VAT_RATE_PERCENT,
      // Everything needed to print the item — but not the customer's file
      // name, which a payment record doesn't need (server/dataRetention.ts).
      printConfig: JSON.stringify({ ...item, fileName: undefined }),
    })),
  );
  if (topUpCents > 0) {
    await db.insert(paymentItems).values(minimumChargeItem(order.id, topUpCents));
  }

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
async function settle(id: string, outcome: TerminalOutcome) {
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

/** Brings an open payment up to date with the terminal (and the 60-second
 * window), then returns it. Called by the stand's polling. */
export async function refreshPayment(id: string): Promise<PaymentView | null> {
  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, id));
  if (!order || order.channel !== 'kiosk-terminal') return null;
  if (OPEN_STATUSES.includes(order.status) && order.providerSessionId) {
    const terminal = getPaymentTerminal();
    let outcome = await terminal.getOutcome(order.providerSessionId);
    if (outcome.state === 'pending' && order.expiresAt && order.expiresAt.getTime() < Date.now()) {
      outcome = await terminal.abort(order.providerSessionId);
      await settle(
        id,
        outcome.state === 'cancelled'
          ? { state: 'timed-out', reason: 'payment-window-expired' }
          : outcome,
      );
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
    provider: order.provider,
    receiptDelivery: order.receiptDelivery,
    receipt: await getSaleReceiptView(order.id),
    amountCents: order.amountCents,
    failureReason: order.failureReason,
    expiresAt: order.expiresAt?.toISOString() ?? null,
    items,
  };
}

/** The customer's receipt choice (docs/payments-business-requirements.md,
 * "Receipts") — only once paid, and only once. Actual delivery is the
 * fiscal register's job (B4). */
export async function setReceiptDelivery(
  id: string,
  via: 'qr' | 'email' | 'paper',
  email: string | null,
): Promise<PaymentView | null> {
  await db
    .update(paymentOrders)
    .set({ receiptDelivery: via, receiptEmail: email, updatedAt: new Date() })
    .where(
      and(
        eq(paymentOrders.id, id),
        eq(paymentOrders.status, 'paid'),
        isNull(paymentOrders.receiptDelivery),
      ),
    );
  // Registered now that the delivery is known — paper has to be decided
  // before the register prints (server/fiscalReceiptStore.ts).
  await createSaleReceipt(id);
  return getPaymentView(id);
}

export type PrintClaim =
  | { kind: 'claimed'; taskId: string; config: PaymentItemInput }
  | { kind: 'already-printing'; taskId: string }
  | { kind: 'not-paid' };

/** Nothing prints unpaid (docs/payments-technical-requirements.md,
 * "Principles" 3): reserves a paid payment item for exactly one print task.
 * The print settings come from what was paid for, not from the request. A
 * repeated submission gets the existing task back. */
export async function claimPaymentItemForPrint(paymentItemId: string): Promise<PrintClaim> {
  const taskId = randomUUID();
  const [claimed] = await db
    .update(paymentItems)
    .set({ printTaskId: taskId })
    .where(
      and(
        eq(paymentItems.id, paymentItemId),
        isNull(paymentItems.printTaskId),
        inArray(
          paymentItems.paymentOrderId,
          db
            .select({ id: paymentOrders.id })
            .from(paymentOrders)
            .where(inArray(paymentOrders.status, ['paid', 'partially-refunded'])),
        ),
      ),
    )
    .returning({ printConfig: paymentItems.printConfig });
  if (claimed) {
    return {
      kind: 'claimed',
      taskId,
      config: JSON.parse(claimed.printConfig) as PaymentItemInput,
    };
  }
  const [existing] = await db
    .select({ printTaskId: paymentItems.printTaskId })
    .from(paymentItems)
    .where(eq(paymentItems.id, paymentItemId));
  return existing?.printTaskId
    ? { kind: 'already-printing', taskId: existing.printTaskId }
    : { kind: 'not-paid' };
}

/** How many copies a paid-in-advance portal order covers, if it's still
 * awaiting print — the cap for printing it without a payment. */
export async function paidOrderQuantity(printOrderId: string): Promise<number | null> {
  const order = (await prepaidOrders([printOrderId])).get(printOrderId);
  return order?.quantity ?? null;
}

function formatCents(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

interface ClaimedItem {
  id: string;
  paymentOrderId: string;
  amountCents: number;
  description: string;
  printOrderId: string | null;
  shopOrderId: string | null;
}

const CLAIMED_ITEM_COLUMNS = {
  id: paymentItems.id,
  paymentOrderId: paymentItems.paymentOrderId,
  amountCents: paymentItems.amountCents,
  description: paymentItems.description,
  printOrderId: paymentItems.printOrderId,
  shopOrderId: paymentItems.shopOrderId,
};

/** Refunds go back through whoever took the money: a payment remembers its
 * provider, so a simulated payment is never refunded at Viva and vice versa,
 * whatever PAYMENT_TERMINAL says today. */
function refundProviderFor(provider: string | null): Pick<PaymentTerminal, 'refund'> {
  if (provider === 'viva') return vivaTerminal;
  if (provider === 'simulator') return simulatorTerminal;
  return getPaymentTerminal();
}

/** What an online checkout line paid for stops being deliverable once its
 * money is back: a portal print order can no longer be printed at the
 * kiosk, a shop order whose every line is refunded is closed. */
async function withdrawRefundedOrder(item: ClaimedItem): Promise<void> {
  if (item.printOrderId) {
    await db
      .update(printOrders)
      .set({ status: 'refunded' })
      .where(
        and(
          eq(printOrders.id, item.printOrderId),
          inArray(printOrders.status, ['paid', 'created']),
        ),
      );
  }
  if (item.shopOrderId) {
    const lines = await db
      .select({ amountCents: paymentItems.amountCents, refundedCents: paymentItems.refundedCents })
      .from(paymentItems)
      .where(eq(paymentItems.shopOrderId, item.shopOrderId));
    if (lines.every((line) => line.refundedCents >= line.amountCents)) {
      await db
        .update(shopOrders)
        .set({ status: 'refunded' })
        .where(eq(shopOrders.id, item.shopOrderId));
    }
  }
}

/** Returns one item's money — the part both refund paths share: the
 * provider call, the refund record, the payment's status and the return
 * receipt. The item must already be claimed (its refundedCents set), so a
 * concurrent second refund can't happen; on failure the claim is undone and
 * the item stays refundable. */
async function refundClaimedItem(
  item: ClaimedItem,
  reason: 'print-failed' | 'staff',
  createdBy: string,
): Promise<{ order: typeof paymentOrders.$inferSelect | undefined; outcome: RefundOutcome }> {
  const [order] = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.id, item.paymentOrderId));
  const [refund] = await db
    .insert(paymentRefunds)
    .values({
      paymentOrderId: item.paymentOrderId,
      paymentItemId: item.id,
      amountCents: item.amountCents,
      reason,
      createdBy,
    })
    .returning({ id: paymentRefunds.id });

  let outcome: RefundOutcome;
  if (!order?.providerTransactionId) {
    outcome = { state: 'failed', reason: 'no-transaction-id' };
  } else {
    try {
      outcome = await refundProviderFor(order.provider).refund({
        transactionId: order.providerTransactionId,
        amountCents: item.amountCents,
        reference: refund.id,
      });
    } catch (error) {
      outcome = {
        state: 'failed',
        reason: error instanceof Error ? error.message : 'refund-request-failed',
      };
    }
  }

  const now = new Date();
  await db
    .update(paymentRefunds)
    .set(
      outcome.state === 'succeeded'
        ? { status: 'succeeded', providerRefundId: outcome.refundId, completedAt: now }
        : { status: 'failed', failureReason: outcome.reason, completedAt: now },
    )
    .where(eq(paymentRefunds.id, refund.id));

  if (outcome.state === 'succeeded') {
    // Everything the customer bought is refunded — the minimum-charge top-up
    // goes back too, nobody pays it for nothing.
    if (item.description !== MINIMUM_CHARGE_DESCRIPTION) {
      await refundOrphanedTopUp(item.paymentOrderId, reason, createdBy);
    }
    const items = await db
      .select({ amountCents: paymentItems.amountCents, refundedCents: paymentItems.refundedCents })
      .from(paymentItems)
      .where(eq(paymentItems.paymentOrderId, item.paymentOrderId));
    const fullyRefunded = items.every((line) => line.refundedCents >= line.amountCents);
    await db
      .update(paymentOrders)
      .set({ status: fullyRefunded ? 'refunded' : 'partially-refunded', updatedAt: now })
      .where(eq(paymentOrders.id, item.paymentOrderId));
    await withdrawRefundedOrder(item);
    try {
      await createReturnReceipt(refund.id);
    } catch (err) {
      console.error('[paymentStore] Return receipt could not be created:', refund.id, err);
    }
  } else {
    await db.update(paymentItems).set({ refundedCents: 0 }).where(eq(paymentItems.id, item.id));
  }
  return { order, outcome };
}

async function refundOrphanedTopUp(
  paymentOrderId: string,
  reason: 'print-failed' | 'staff',
  createdBy: string,
): Promise<void> {
  const lines = await db
    .select({
      cartItemId: paymentItems.cartItemId,
      amountCents: paymentItems.amountCents,
      refundedCents: paymentItems.refundedCents,
    })
    .from(paymentItems)
    .where(eq(paymentItems.paymentOrderId, paymentOrderId));
  const bought = lines.filter((line) => line.cartItemId !== MINIMUM_CHARGE_ITEM_ID);
  if (!bought.every((line) => line.refundedCents >= line.amountCents)) return;
  const [topUp] = await db
    .update(paymentItems)
    .set({ refundedCents: sql`${paymentItems.amountCents}` })
    .where(
      and(
        eq(paymentItems.paymentOrderId, paymentOrderId),
        eq(paymentItems.cartItemId, MINIMUM_CHARGE_ITEM_ID),
        eq(paymentItems.refundedCents, 0),
      ),
    )
    .returning(CLAIMED_ITEM_COLUMNS);
  if (topUp) await refundClaimedItem(topUp, reason, createdBy);
}

/** Refund on print failure (docs/payments-business-requirements.md, "When
 * printing fails"): returns the money for exactly the item whose print task
 * failed — automatically, at once — and alerts staff on Telegram either
 * way. Called from updatePrintTaskStatus; a task with no payment item (a
 * portal order paid in advance) is left alone — that order stays "paid,
 * awaiting print" in My orders. Safe to call twice: the item is claimed
 * for refunding first. */
export async function refundFailedPrintTask(
  printTaskId: string,
  errorReason: string | null,
): Promise<void> {
  const [item] = await db
    .update(paymentItems)
    .set({ refundedCents: sql`${paymentItems.amountCents}` })
    .where(and(eq(paymentItems.printTaskId, printTaskId), eq(paymentItems.refundedCents, 0)))
    .returning(CLAIMED_ITEM_COLUMNS);
  if (!item) return;
  const { order, outcome } = await refundClaimedItem(item, 'print-failed', 'system');

  const where = order?.standId ? `stand ${order.standId}` : 'a kiosk stand';
  const what = `"${item.description}" failed to print on ${where} (${errorReason ?? 'unknown reason'})`;
  const context = { paymentOrderId: item.paymentOrderId, paymentItemId: item.id, printTaskId };
  void reportIncident(
    outcome.state === 'succeeded'
      ? {
          source: 'payment-terminal',
          code: 'payment.refunded-after-print-failure',
          severity: 'critical',
          message: `${what}. ${formatCents(item.amountCents)} was refunded to the customer's card automatically.`,
          context,
          correlationId: item.id,
        }
      : {
          source: 'payment-terminal',
          code: 'payment.refund-failed',
          severity: 'emergency',
          message: `${what}. The automatic refund of ${formatCents(item.amountCents)} FAILED (${outcome.reason}) — refund the customer by hand.`,
          context,
          correlationId: item.id,
        },
  );
}

export interface StaffRefundResult {
  paymentItemId: string;
  amountCents: number;
  status: 'succeeded' | 'failed' | 'not-refundable';
  reason?: string;
}

/** A refund made by staff from the admin panel (docs/payments-business-requirements.md,
 * "Staff and admin panel") — the chosen items of one payment, each refunded
 * in full, through the same path as the automatic one. Items already
 * refunded (or of another payment) come back as 'not-refundable'. */
export async function refundItemsByStaff(
  paymentOrderId: string,
  itemIds: string[],
  staffId: string,
): Promise<StaffRefundResult[]> {
  const results: StaffRefundResult[] = [];
  for (const itemId of itemIds) {
    const [item] = await db
      .update(paymentItems)
      .set({ refundedCents: sql`${paymentItems.amountCents}` })
      .where(
        and(
          eq(paymentItems.id, itemId),
          eq(paymentItems.paymentOrderId, paymentOrderId),
          eq(paymentItems.refundedCents, 0),
          inArray(
            paymentItems.paymentOrderId,
            db
              .select({ id: paymentOrders.id })
              .from(paymentOrders)
              .where(inArray(paymentOrders.status, ['paid', 'partially-refunded'])),
          ),
        ),
      )
      .returning(CLAIMED_ITEM_COLUMNS);
    if (!item) {
      results.push({ paymentItemId: itemId, amountCents: 0, status: 'not-refundable' });
      continue;
    }
    const { outcome } = await refundClaimedItem(item, 'staff', staffId);
    results.push(
      outcome.state === 'succeeded'
        ? { paymentItemId: itemId, amountCents: item.amountCents, status: 'succeeded' }
        : {
            paymentItemId: itemId,
            amountCents: item.amountCents,
            status: 'failed',
            reason: outcome.reason,
          },
    );
  }
  return results;
}

export interface PrintTaskRefund {
  status: 'pending' | 'succeeded' | 'failed';
  amountCents: number;
}

/** The latest refund of the payment item a print task prints — shown on
 * the stand's Print Status. Null when the task isn't a paid item's. When
 * the refund also returned the minimum-charge top-up (nothing left bought),
 * the top-up is counted with the item refunded last, so the stand tells the
 * customer the whole amount that came back. */
export async function getRefundForPrintTask(printTaskId: string): Promise<PrintTaskRefund | null> {
  const [row] = await db
    .select({
      id: paymentRefunds.id,
      status: paymentRefunds.status,
      amountCents: paymentRefunds.amountCents,
      paymentOrderId: paymentRefunds.paymentOrderId,
    })
    .from(paymentRefunds)
    .innerJoin(paymentItems, eq(paymentItems.id, paymentRefunds.paymentItemId))
    .where(eq(paymentItems.printTaskId, printTaskId))
    .orderBy(desc(paymentRefunds.createdAt))
    .limit(1);
  if (!row) return null;
  let amountCents = row.amountCents;
  if (row.status === 'succeeded') {
    const refunds = await db
      .select({
        id: paymentRefunds.id,
        amountCents: paymentRefunds.amountCents,
        cartItemId: paymentItems.cartItemId,
      })
      .from(paymentRefunds)
      .innerJoin(paymentItems, eq(paymentItems.id, paymentRefunds.paymentItemId))
      .where(
        and(
          eq(paymentRefunds.paymentOrderId, row.paymentOrderId),
          eq(paymentRefunds.status, 'succeeded'),
        ),
      )
      .orderBy(desc(paymentRefunds.createdAt));
    const topUp = refunds.find((refund) => refund.cartItemId === MINIMUM_CHARGE_ITEM_ID);
    const lastItemRefund = refunds.find((refund) => refund.cartItemId !== MINIMUM_CHARGE_ITEM_ID);
    if (topUp && lastItemRefund?.id === row.id) amountCents += topUp.amountCents;
  }
  return { status: row.status as PrintTaskRefund['status'], amountCents };
}
