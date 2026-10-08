import { and, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';
import { db } from './db/client.js';
import { fiscalReceipts, paymentOrders, printOrders } from './db/schema.js';

// Personal data kept only as long as it's needed (docs/data-privacy-requirements.md,
// decided 2026-10-08): a customer's e-mail for the receipt is erased 30 days
// after the payment, and a done (printed or refunded) portal order's file
// name 30 days after the order was placed — what stays is the financial fact: amounts,
// print settings, dates. Payment lines never store file names at all
// (server/paymentStore.ts, server/onlineCheckoutStore.ts). Runs with the
// orphaned-file sweep (server/index.ts).

export const PERSONAL_DATA_RETENTION_DAYS = 30;
const ERASED_FILE_NAME = '—';

export async function erasePersonalDataPastRetention(): Promise<number> {
  const cutoff = new Date(Date.now() - PERSONAL_DATA_RETENTION_DAYS * 24 * 3600_000);
  const payments = await db
    .update(paymentOrders)
    .set({ receiptEmail: null })
    .where(
      and(
        isNotNull(paymentOrders.receiptEmail),
        lt(sql`coalesce(${paymentOrders.paidAt}, ${paymentOrders.createdAt})`, cutoff),
      ),
    )
    .returning({ id: paymentOrders.id });
  const receipts = await db
    .update(fiscalReceipts)
    .set({ email: null })
    .where(and(isNotNull(fiscalReceipts.email), lt(fiscalReceipts.createdAt, cutoff)))
    .returning({ id: fiscalReceipts.id });
  const orders = await db
    .update(printOrders)
    .set({ fileName: ERASED_FILE_NAME })
    .where(
      and(
        inArray(printOrders.status, ['issued', 'refunded']),
        ne(printOrders.fileName, ERASED_FILE_NAME),
        lt(printOrders.createdAt, cutoff),
      ),
    )
    .returning({ id: printOrders.id });
  return payments.length + receipts.length + orders.length;
}
