import { and, eq, gte } from 'drizzle-orm';
import { db } from './db/client.js';
import { accounts, paymentOrders, shopOrders } from './db/schema.js';
import { CHECKOUT_TIMEOUT_SECONDS, getOnlineCheckout } from './onlineCheckout.js';
import {
  fulfilCheckout,
  priceCheckout,
  type CheckoutParams,
  type CheckoutResult,
  type PricedCheckout,
} from './shopOrderStore.js';

// Online payments for the portal and the shop (docs/payments-technical-requirements.md,
// "Online checkout (portal)"; business rules in docs/payments-business-requirements.md,
// "Portal: online payments"). A checkout is priced on the server, stored as
// an 'awaiting-payment' payment order with what it buys, and the customer
// is sent to the payment page. Only the provider's own answer — asked when
// the customer comes back, by the background sweep, or on Viva's webhook —
// moves it to 'paid' and fulfils it: the print orders become "paid, awaiting
// print" and the shop order is created. eKasa doesn't apply to online
// payments (an open question for the Financial Administration, see the
// business requirements).

/** Where the customer lands after the payment page. */
export type CheckoutReturnTo = 'portal' | 'shop';

interface StoredCheckout {
  priced: PricedCheckout;
  returnTo: CheckoutReturnTo;
}

export interface OnlineCheckoutView {
  id: string;
  status: string;
  amountCents: number;
  returnTo: CheckoutReturnTo;
  /** Set once paid — the orders the payment produced. */
  result: CheckoutResult | null;
}

function describe(priced: PricedCheckout): string {
  const parts = [];
  if (priced.printOrderIds.length > 0) parts.push('Tlač dokumentov / Document printing');
  if (priced.shopItems.length > 0)
    parts.push(priced.shopItems.map((i) => i.productName).join(', '));
  return parts.join(' + ').slice(0, 2048);
}

/** Prices the checkout and opens the provider's payment order. Returns the
 * page to send the customer to; `checkoutUrl` is null when there's nothing
 * to pay and the checkout was fulfilled at once. */
export async function startOnlineCheckout(
  params: CheckoutParams,
  options: { requireVerifiedEmail: boolean; returnTo: CheckoutReturnTo },
): Promise<{ paymentId: string; checkoutUrl: string | null }> {
  const priced = await priceCheckout(params, options);
  const checkout = getOnlineCheckout();
  const payload: StoredCheckout = { priced, returnTo: options.returnTo };
  const [order] = await db
    .insert(paymentOrders)
    .values({
      accountId: params.accountId,
      channel: 'online-checkout',
      provider: checkout.provider,
      status: priced.totalCents === 0 ? 'paid' : 'awaiting-payment',
      amountCents: priced.totalCents,
      paidAt: priced.totalCents === 0 ? new Date() : null,
      checkoutPayload: JSON.stringify(payload),
      expiresAt: new Date(Date.now() + CHECKOUT_TIMEOUT_SECONDS * 1000),
    })
    .returning({ id: paymentOrders.id });
  if (priced.totalCents === 0) {
    await fulfilCheckout(order.id, priced);
    return { paymentId: order.id, checkoutUrl: null };
  }

  const [account] = await db
    .select({ email: accounts.email })
    .from(accounts)
    .where(eq(accounts.id, params.accountId));
  try {
    const { orderCode, checkoutUrl } = await checkout.createOrder({
      reference: order.id,
      amountCents: priced.totalCents,
      email: account?.email ?? null,
      description: describe(priced),
    });
    await db
      .update(paymentOrders)
      .set({ providerSessionId: orderCode, updatedAt: new Date() })
      .where(eq(paymentOrders.id, order.id));
    return { paymentId: order.id, checkoutUrl };
  } catch (err) {
    await db
      .update(paymentOrders)
      .set({
        status: 'failed',
        failureReason: err instanceof Error ? err.message : 'checkout-unavailable',
        updatedAt: new Date(),
      })
      .where(eq(paymentOrders.id, order.id));
    throw err;
  }
}

/** Asks the provider about an open payment and settles it. Fulfilment runs
 * once: only the call that moves the row out of 'awaiting-payment' does it. */
export async function confirmOnlineCheckout(paymentId: string): Promise<void> {
  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, paymentId));
  if (
    !order ||
    order.channel !== 'online-checkout' ||
    order.status !== 'awaiting-payment' ||
    !order.providerSessionId ||
    !order.checkoutPayload
  ) {
    return;
  }
  const state = await getOnlineCheckout().getState(order.providerSessionId);
  if (state.state === 'pending') return;
  const now = new Date();
  const [settled] = await db
    .update(paymentOrders)
    .set(
      state.state === 'paid'
        ? {
            status: 'paid',
            paidAt: now,
            providerTransactionId: state.transactionId,
            updatedAt: now,
          }
        : { status: state.state === 'expired' ? 'timed-out' : 'cancelled', updatedAt: now },
    )
    .where(and(eq(paymentOrders.id, paymentId), eq(paymentOrders.status, 'awaiting-payment')))
    .returning({ id: paymentOrders.id });
  if (settled && state.state === 'paid') {
    const { priced } = JSON.parse(order.checkoutPayload) as StoredCheckout;
    await fulfilCheckout(paymentId, priced);
  }
}

export async function findOnlinePaymentByOrderCode(orderCode: string): Promise<string | null> {
  const [order] = await db
    .select({ id: paymentOrders.id })
    .from(paymentOrders)
    .where(
      and(
        eq(paymentOrders.channel, 'online-checkout'),
        eq(paymentOrders.providerSessionId, orderCode),
      ),
    );
  return order?.id ?? null;
}

/** The payment as its own account sees it — confirmed with the provider
 * first if still open. Null for someone else's payment. */
export async function getOnlineCheckoutView(
  paymentId: string,
  accountId: string | null,
): Promise<OnlineCheckoutView | null> {
  await confirmOnlineCheckout(paymentId);
  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, paymentId));
  if (!order || order.channel !== 'online-checkout' || !order.checkoutPayload) return null;
  if (accountId !== null && order.accountId !== accountId) return null;
  const { priced, returnTo } = JSON.parse(order.checkoutPayload) as StoredCheckout;
  let result: CheckoutResult | null = null;
  if (order.status === 'paid') {
    const [shopOrder] = await db
      .select({ id: shopOrders.id })
      .from(shopOrders)
      .where(eq(shopOrders.paymentOrderId, order.id));
    result = {
      paymentOrderId: order.id,
      printOrderIds: priced.printOrderIds,
      shopOrderId: shopOrder?.id ?? null,
    };
  }
  return { id: order.id, status: order.status, amountCents: order.amountCents, returnTo, result };
}

/** Background check (server/index.ts) for payments whose customer never came
 * back to our page — keeps asking the provider until the order is settled
 * or well past its timeout. */
export async function sweepOnlineCheckouts(): Promise<void> {
  const open = await db
    .select({ id: paymentOrders.id, expiresAt: paymentOrders.expiresAt })
    .from(paymentOrders)
    .where(
      and(
        eq(paymentOrders.channel, 'online-checkout'),
        eq(paymentOrders.status, 'awaiting-payment'),
        gte(paymentOrders.createdAt, new Date(Date.now() - 24 * 3600_000)),
      ),
    );
  for (const order of open) {
    try {
      await confirmOnlineCheckout(order.id);
    } catch (err) {
      console.error('[onlineCheckout] confirm failed:', order.id, err);
    }
    // Still open an hour after it should have expired: the provider lost it.
    if (order.expiresAt && order.expiresAt.getTime() < Date.now() - 3600_000) {
      await db
        .update(paymentOrders)
        .set({ status: 'timed-out', updatedAt: new Date() })
        .where(and(eq(paymentOrders.id, order.id), eq(paymentOrders.status, 'awaiting-payment')));
    }
  }
}
