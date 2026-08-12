import { eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { paymentOrders, printOrders } from './db/schema.js';

// Real, DB-backed store for Personal Account's "My orders" — paid-in-advance
// Print Orders created on the portal (docs/personal-account-requirements.md,
// "Paid orders awaiting print"). `printOrders`/`paymentOrders` were already
// provisioned for exactly this ("so a later real-payments phase doesn't need
// another migration") — nothing wrote to them until now.
//
// "Payment" here is simulated, same convention as the kiosk's own already-
// mocked Payment Status — there's no real payment gateway anywhere in this
// project yet, so a `paymentOrders` row is created already `'paid'` in one
// step rather than modeling a real ready-for-payment → paid transition.

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
}

export interface CreatePaidOrderParams {
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

export async function createPaidOrder(params: CreatePaidOrderParams): Promise<AccountOrder> {
  const [paymentOrder] = await db
    .insert(paymentOrders)
    .values({
      status: 'paid',
      amountCents: params.unitPriceCents * params.quantity,
      paidAt: new Date(),
    })
    .returning({ id: paymentOrders.id });

  const [printOrder] = await db
    .insert(printOrders)
    .values({
      accountId: params.accountId,
      paymentOrderId: paymentOrder.id,
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
      // Fully paid, always — no partial-payment concept exists here.
      paidQuantity: params.quantity,
    })
    .returning({
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
    });

  return printOrder as AccountOrder;
}

export async function listPaidOrders(accountId: string): Promise<AccountOrder[]> {
  const rows = await db
    .select({
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
    })
    .from(printOrders)
    .where(eq(printOrders.accountId, accountId))
    .orderBy(printOrders.createdAt);
  return rows as AccountOrder[];
}
