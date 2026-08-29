import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db/client.js';
import {
  accounts,
  paymentOrders,
  printOrders,
  products,
  shopOrders,
  shopOrderItems,
} from './db/schema.js';

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

/** One payment for the whole cart (docs/shop-checkout-requirements.md, "Payment") —
 * splits into a printOrders update (self-service) and/or a new shopOrders +
 * shopOrderItems row (staff-fulfilled), never a single polymorphic order row. */
export async function checkout(params: CheckoutParams): Promise<CheckoutResult> {
  if (params.printOrderIds.length === 0 && params.shopItems.length === 0) {
    throw new EmptyCheckoutError('Cart is empty');
  }

  // The real enforcement point for the "Email verification gate"
  // (docs/shop-checkout-requirements.md) — the checkout screen's polling is a UX
  // nicety, this is what actually stops payment from an unverified account.
  const [account] = await db
    .select({ emailVerified: accounts.emailVerified })
    .from(accounts)
    .where(eq(accounts.id, params.accountId));
  if (!account?.emailVerified) {
    throw new EmailNotVerifiedError('Email must be verified before checkout can complete');
  }

  let printOrdersTotalCents = 0;
  const printOrderQuantities = new Map<string, number>();
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
    printOrdersTotalCents = rows.reduce((sum, row) => sum + row.unitPriceCents * row.quantity, 0);
    for (const row of rows) printOrderQuantities.set(row.id, row.quantity);
  }

  // Priced from the catalog at checkout time, never trusted from the client — unlike
  // the still-mocked kiosk Cart, this is a real payment.
  const shopItemRows: { productId: string; productName: string; unitPriceCents: number }[] = [];
  let shopItemsTotalCents = 0;
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
      shopItemsTotalCents += product.priceCents * item.quantity;
      shopItemRows.push({
        productId: product.id,
        productName: product.name,
        unitPriceCents: product.priceCents,
      });
    }
  }

  const [paymentOrder] = await db
    .insert(paymentOrders)
    .values({
      accountId: params.accountId,
      status: 'paid',
      amountCents: printOrdersTotalCents + shopItemsTotalCents,
      paidAt: new Date(),
    })
    .returning({ id: paymentOrders.id });

  if (params.printOrderIds.length > 0) {
    // paidQuantity mirrors each row's own quantity — no partial-payment concept here
    // either, same as server/accountOrderStore.ts's payOrder — set per row since it
    // varies per order, unlike paymentOrderId/status which are the same for all of them.
    for (const id of params.printOrderIds) {
      await db
        .update(printOrders)
        .set({
          paymentOrderId: paymentOrder.id,
          status: 'paid',
          paidQuantity: printOrderQuantities.get(id),
        })
        .where(
          and(
            eq(printOrders.id, id),
            eq(printOrders.accountId, params.accountId),
            eq(printOrders.status, 'created'),
          ),
        );
    }
  }

  let shopOrderId: string | null = null;
  if (params.shopItems.length > 0) {
    const [shopOrder] = await db
      .insert(shopOrders)
      .values({
        accountId: params.accountId,
        paymentOrderId: paymentOrder.id,
        status: 'paid',
      })
      .returning({ id: shopOrders.id });
    shopOrderId = shopOrder.id;

    await db.insert(shopOrderItems).values(
      params.shopItems.map((item, index) => ({
        shopOrderId: shopOrder.id,
        productId: shopItemRows[index].productId,
        productName: shopItemRows[index].productName,
        unitPriceCents: shopItemRows[index].unitPriceCents,
        quantity: item.quantity,
      })),
    );
  }

  return { paymentOrderId: paymentOrder.id, printOrderIds: params.printOrderIds, shopOrderId };
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
