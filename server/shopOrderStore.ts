import { and, eq, inArray } from 'drizzle-orm';
import { minimumChargeTopUp } from '../src/utils/tariff.js';
import { db } from './db/client.js';
import { accounts, printOrders, products, shopOrders, shopOrderItems } from './db/schema.js';

// Shop checkout (docs/shop-checkout-requirements.md) — splits one payment into up to
// two independent orders by fulfillment type: the existing printOrders row(s) for any
// self-service items (already sitting in 'created' state via server/accountOrderStore.ts's
// createOrder — configured before ever reaching the shop cart, same as the kiosk's own
// Print Order Configuration → Add to Cart pattern), plus one new shopOrders row covering
// every staff-fulfilled catalog item in this checkout. Either half can be absent (a
// cart of only print jobs never creates a shopOrders row, and vice versa).

export interface ShopCartItemInput {
  productId: string;
  quantity: number;
}

export interface CheckoutParams {
  accountId: string;
  /** ids of the account's own 'created' printOrders rows being paid in this checkout —
   * see server/accountOrderStore.ts's createOrder for how these get configured first. */
  printOrderIds: string[];
  /** staff-fulfilled catalog items, priced from the current products table, not the client. */
  shopItems: ShopCartItemInput[];
}

export interface CheckoutResult {
  paymentOrderId: string;
  printOrderIds: string[];
  shopOrderId: string | null;
}

export class EmptyCheckoutError extends Error {}
export class InvalidPrintOrderError extends Error {}
export class InvalidProductError extends Error {}
export class EmailNotVerifiedError extends Error {}

/** What one checkout buys, priced from the server's own records — the
 * print orders' stored prices and the current catalog, never the client.
 * Stored on the payment order until the payment is confirmed
 * (server/onlineCheckoutStore.ts). */
export interface PricedCheckout {
  accountId: string;
  printOrderIds: string[];
  printOrderQuantities: Record<string, number>;
  shopItems: { productId: string; productName: string; unitPriceCents: number; quantity: number }[];
  /** Added to reach Viva's minimum card payment (src/utils/tariff.ts). */
  minimumChargeCents: number;
  totalCents: number;
}

/** Validates and prices a checkout (docs/shop-checkout-requirements.md,
 * "Payment" — one payment for the whole cart). `requireVerifiedEmail` keeps
 * the shop's rule that an unverified account can't complete checkout. */
export async function priceCheckout(
  params: CheckoutParams,
  { requireVerifiedEmail }: { requireVerifiedEmail: boolean },
): Promise<PricedCheckout> {
  if (params.printOrderIds.length === 0 && params.shopItems.length === 0) {
    throw new EmptyCheckoutError('Cart is empty');
  }

  if (requireVerifiedEmail) {
    const [account] = await db
      .select({ emailVerified: accounts.emailVerified })
      .from(accounts)
      .where(eq(accounts.id, params.accountId));
    if (!account?.emailVerified) {
      throw new EmailNotVerifiedError('Email must be verified before checkout can complete');
    }
  }

  let totalCents = 0;
  const printOrderQuantities: Record<string, number> = {};
  if (params.printOrderIds.length > 0) {
    const rows = await db
      .select({
        id: printOrders.id,
        unitPriceCents: printOrders.unitPriceCents,
        quantity: printOrders.quantity,
      })
      .from(printOrders)
      .where(
        and(
          inArray(printOrders.id, params.printOrderIds),
          eq(printOrders.accountId, params.accountId),
          eq(printOrders.status, 'created'),
        ),
      );
    if (rows.length !== params.printOrderIds.length) {
      throw new InvalidPrintOrderError(
        'One or more print orders were not found, not owned by this account, or already paid',
      );
    }
    for (const row of rows) {
      totalCents += row.unitPriceCents * row.quantity;
      printOrderQuantities[row.id] = row.quantity;
    }
  }

  const shopItems: PricedCheckout['shopItems'] = [];
  if (params.shopItems.length > 0) {
    const productIds = params.shopItems.map((item) => item.productId);
    const catalogRows = await db
      .select({ id: products.id, name: products.name, priceCents: products.priceCents })
      .from(products)
      .where(and(inArray(products.id, productIds), eq(products.active, true)));
    const catalogById = new Map(catalogRows.map((row) => [row.id, row]));

    for (const item of params.shopItems) {
      const product = catalogById.get(item.productId);
      if (!product || item.quantity < 1) {
        throw new InvalidProductError(`Invalid or inactive product: ${item.productId}`);
      }
      totalCents += product.priceCents * item.quantity;
      shopItems.push({
        productId: product.id,
        productName: product.name,
        unitPriceCents: product.priceCents,
        quantity: item.quantity,
      });
    }
  }

  const minimumChargeCents = minimumChargeTopUp(totalCents);
  return {
    accountId: params.accountId,
    printOrderIds: params.printOrderIds,
    printOrderQuantities,
    shopItems,
    minimumChargeCents,
    totalCents: totalCents + minimumChargeCents,
  };
}

/** Carries out a paid checkout — splits it into the print orders now paid
 * (self-service) and one new shop order (staff-fulfilled). Called once the
 * payment is confirmed; a print order no longer 'created' (paid meanwhile
 * some other way) is left alone. */
export async function fulfilCheckout(
  paymentOrderId: string,
  priced: PricedCheckout,
): Promise<CheckoutResult> {
  for (const id of priced.printOrderIds) {
    await db
      .update(printOrders)
      .set({
        paymentOrderId,
        status: 'paid',
        paidQuantity: priced.printOrderQuantities[id],
      })
      .where(
        and(
          eq(printOrders.id, id),
          eq(printOrders.accountId, priced.accountId),
          eq(printOrders.status, 'created'),
        ),
      );
  }

  let shopOrderId: string | null = null;
  if (priced.shopItems.length > 0) {
    const [shopOrder] = await db
      .insert(shopOrders)
      .values({ accountId: priced.accountId, paymentOrderId, status: 'paid' })
      .returning({ id: shopOrders.id });
    shopOrderId = shopOrder.id;
    await db.insert(shopOrderItems).values(
      priced.shopItems.map((item) => ({
        shopOrderId: shopOrder.id,
        productId: item.productId,
        productName: item.productName,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
      })),
    );
  }

  return { paymentOrderId, printOrderIds: priced.printOrderIds, shopOrderId };
}

export interface ShopOrderItemView {
  productId: string | null;
  productName: string;
  unitPriceCents: number;
  quantity: number;
}

export interface ShopOrderView {
  id: string;
  fulfillmentMethod: string;
  status: string;
  createdAt: Date;
  items: ShopOrderItemView[];
}

/** Portal-facing "My orders" for the staff-fulfilled half (docs/shop-checkout-requirements.md's
 * "Order visibility after checkout" — never surfaced on the kiosk, portal-only). */
export async function listShopOrders(accountId: string): Promise<ShopOrderView[]> {
  const orders = await db
    .select({
      id: shopOrders.id,
      fulfillmentMethod: shopOrders.fulfillmentMethod,
      status: shopOrders.status,
      createdAt: shopOrders.createdAt,
    })
    .from(shopOrders)
    .where(eq(shopOrders.accountId, accountId))
    .orderBy(shopOrders.createdAt);
  if (orders.length === 0) return [];

  const items = await db
    .select({
      shopOrderId: shopOrderItems.shopOrderId,
      productId: shopOrderItems.productId,
      productName: shopOrderItems.productName,
      unitPriceCents: shopOrderItems.unitPriceCents,
      quantity: shopOrderItems.quantity,
    })
    .from(shopOrderItems)
    .where(
      inArray(
        shopOrderItems.shopOrderId,
        orders.map((order) => order.id),
      ),
    );

  const itemsByOrderId = new Map<string, ShopOrderItemView[]>();
  for (const item of items) {
    const list = itemsByOrderId.get(item.shopOrderId) ?? [];
    list.push({
      productId: item.productId,
      productName: item.productName,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
    });
    itemsByOrderId.set(item.shopOrderId, list);
  }

  return orders.map((order) => ({ ...order, items: itemsByOrderId.get(order.id) ?? [] }));
}
