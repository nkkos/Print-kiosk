import { and, eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { paymentOrders, printOrders } from './db/schema.js';

// Real, DB-backed store for Personal Account's "My orders" — Print Orders
// created on the portal, tracked through the three-state lifecycle confirmed
// in docs/personal-account-requirements.md, "Order status lifecycle":
// 'created' (configured, not yet paid) -> 'paid' (awaiting fulfillment) ->
// 'issued' (its real print job succeeded at the kiosk — automatic, see
// markOrderIssued below, called from server/printTaskStore.ts).
//
// "Payment" here is still simulated — same convention as the kiosk's own
// already-mocked Payment Status, there's no real payment gateway anywhere in
// this project yet — but is now its own step (payOrder) instead of bundled
// into order creation, so 'created' is a real, reachable state rather than
// skipped straight to 'paid'.

const ORDER_ROW_COLUMNS = {
  id: printOrders.id,
  fileName: printOrders.fileName,
  accountFileId: printOrders.accountFileId,
  paperSize: printOrders.paperSize,
  sides: printOrders.sides,
  color: printOrders.color,
  orientation: printOrders.orientation,
  scale: printOrders.scale,
  pageRange: printOrders.pageRange,
  quantity: printOrders.quantity,
  unitPriceCents: printOrders.unitPriceCents,
  status: printOrders.status,
};

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
   * page, matching the kiosk's own PrintOrder.pageRange. */
  pageRange: string | null;
  quantity: number;
  unitPriceCents: number;
  /** 'created' | 'paid' | 'issued' — see "Order status lifecycle" above. */
  status: 'created' | 'paid' | 'issued';
}

export interface CreateOrderParams {
  accountId: string;
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

/** Configures a print order without paying for it yet — 'created' state. */
export async function createOrder(params: CreateOrderParams): Promise<AccountOrder> {
  const [printOrder] = await db
    .insert(printOrders)
    .values({
      accountId: params.accountId,
      accountFileId: params.accountFileId,
      fileName: params.fileName,
      paperSize: params.paperSize,
      sides: params.sides,
      color: params.color,
      orientation: params.orientation,
      scale: params.scale,
      pageRange: params.pageRange ?? null,
      quantity: params.quantity,
      unitPriceCents: params.unitPriceCents,
      status: 'created',
    })
    .returning(ORDER_ROW_COLUMNS);

  return printOrder as AccountOrder;
}

/** Pays a 'created' order — 'created' -> 'paid'. Ownership-checked
 * (accountId must match) and idempotency-guarded (no-ops, returns null, on
 * an order that isn't 'created' — e.g. a double-submit of "Pay now"). */
export async function payOrder(accountId: string, orderId: string): Promise<AccountOrder | null> {
  const [order] = await db
    .select({ unitPriceCents: printOrders.unitPriceCents, quantity: printOrders.quantity })
    .from(printOrders)
    .where(
      and(
        eq(printOrders.id, orderId),
        eq(printOrders.accountId, accountId),
        eq(printOrders.status, 'created'),
      ),
    );
  if (!order) return null;

  const [paymentOrder] = await db
    .insert(paymentOrders)
    .values({
      status: 'paid',
      amountCents: order.unitPriceCents * order.quantity,
      paidAt: new Date(),
    })
    .returning({ id: paymentOrders.id });

  const [updated] = await db
    .update(printOrders)
    .set({
      paymentOrderId: paymentOrder.id,
      status: 'paid',
      // Fully paid, always — no partial-payment concept exists here.
      paidQuantity: order.quantity,
    })
    .where(eq(printOrders.id, orderId))
    .returning(ORDER_ROW_COLUMNS);

  return updated as AccountOrder;
}

/** Marks a 'paid' order 'issued' — called once the printTasks row linked to
 * it (printTasks.printOrderId) reaches 'succeeded', real or simulated
 * (server/printTaskStore.ts). Not exposed via any route directly. */
export async function markOrderIssued(printOrderId: string): Promise<void> {
  await db
    .update(printOrders)
    .set({ status: 'issued' })
    .where(and(eq(printOrders.id, printOrderId), eq(printOrders.status, 'paid')));
}

/** Every order for the account, any status — the portal's full "My orders"
 * history (docs/personal-account-requirements.md, "Order status
 * lifecycle"). Kiosk-facing reads filter this down to 'paid' only
 * (server/routes.ts) — the kiosk's My orders stays scoped to "paid,
 * awaiting print", not the portal's full history. */
export async function listOrders(accountId: string): Promise<AccountOrder[]> {
  const rows = await db
    .select(ORDER_ROW_COLUMNS)
    .from(printOrders)
    .where(eq(printOrders.accountId, accountId))
    .orderBy(printOrders.createdAt);
  return rows as AccountOrder[];
}
