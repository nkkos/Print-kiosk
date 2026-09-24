import { and, desc, eq, gte, isNull, lt } from 'drizzle-orm';
import { db } from './db/client.js';
import { companies, companyInvoiceItems, companyInvoices, printOrders } from './db/schema.js';
import { issueInvoice as issueViaAdapter } from './invoiceAdapter.js';
import type { Company } from './companyStore.js';

// Aggregates a company's paid, company-billed printOrders rows
// (printOrders.companyId, set by server/accountOrderStore.ts's
// payOrderForCompany) into a reviewable draft, then — only once staff
// explicitly confirm — issues it through server/invoiceAdapter.ts. Two
// separate steps on purpose (docs, "B2B company-billing portal" plan): a
// real invoice sent to a real company is hard to unsend, so nothing here
// calls the adapter without an explicit staff action in between.

export interface CompanyInvoice {
  id: string;
  companyId: string;
  periodStart: Date;
  periodEnd: Date;
  vatRatePercent: number;
  totalNetCents: number;
  totalVatCents: number;
  totalCents: number;
  status: 'draft' | 'issued' | 'paid' | 'failed';
  externalProvider: string | null;
  externalInvoiceId: string | null;
  pdfUrl: string | null;
  issuedAt: Date | null;
  createdAt: Date;
}

const INVOICE_COLUMNS = {
  id: companyInvoices.id,
  companyId: companyInvoices.companyId,
  periodStart: companyInvoices.periodStart,
  periodEnd: companyInvoices.periodEnd,
  vatRatePercent: companyInvoices.vatRatePercent,
  totalNetCents: companyInvoices.totalNetCents,
  totalVatCents: companyInvoices.totalVatCents,
  totalCents: companyInvoices.totalCents,
  status: companyInvoices.status,
  externalProvider: companyInvoices.externalProvider,
  externalInvoiceId: companyInvoices.externalInvoiceId,
  pdfUrl: companyInvoices.pdfUrl,
  issuedAt: companyInvoices.issuedAt,
  createdAt: companyInvoices.createdAt,
};

/** Rounds a line's VAT the same way everywhere (nearest cent) — computed
 * per line, not once on the invoice total, since a real invoice must show
 * VAT broken down per line item (server/db/schema.ts's own comment on
 * companyInvoiceItems.vatAmountCents). */
function vatAmountCents(netCents: number, vatRatePercent: number): number {
  return Math.round((netCents * vatRatePercent) / 100);
}

/** Snapshots every company-billed printOrders row in [periodStart, periodEnd)
 * into a new 'draft' invoice — billed at each order's own configured NET
 * price (the same client-trusted unitPriceCents every other order already
 * uses, server/accountOrderStore.ts), NOT recomputed from the company's
 * negotiated per-page rate: printOrders has no reliable page-count field to
 * apply a per-page rate against (pageRange is a free-form "2-5" string, not
 * a count). companies.pricePerPageBwCents/pricePerPageColorCents are
 * recorded for reference/manual reconciliation until real per-page tracking
 * exists — deliberately not silently applied here, which would look precise
 * while being wrong. The company's `vatRatePercent` IS applied here, though
 * — VAT law, not a pricing guess — and snapshotted onto the invoice so a
 * later rate change never rewrites history.
 *
 * An order already captured by an earlier invoice (draft or issued — the
 * left join below matches either) is excluded even if it falls inside this
 * new period, so regenerating a draft for an overlapping range — or simply
 * running "generate" twice — can never bill the same job to a company
 * twice. The flip side: once an order lands in a draft, it stays claimed by
 * that draft (nothing was sent yet, but re-generating won't pull it into a
 * second one either) — a mistaken or too-narrow draft under-bills rather
 * than double-bills, which is the safe direction to fail in, but it does
 * mean a stale draft needs issuing (or manually cleaning up in the
 * database) before those orders can appear on a different invoice. There's
 * no "discard this draft" admin action yet — a reasonable follow-up once
 * this comes up in practice, not built speculatively now. */
export async function createDraftInvoice(
  companyId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<CompanyInvoice> {
  const [company] = await db
    .select({ vatRatePercent: companies.vatRatePercent })
    .from(companies)
    .where(eq(companies.id, companyId));
  const vatRatePercent = company?.vatRatePercent ?? 20;

  const orders = await db
    .select({
      id: printOrders.id,
      fileName: printOrders.fileName,
      color: printOrders.color,
      quantity: printOrders.quantity,
      unitPriceCents: printOrders.unitPriceCents,
    })
    .from(printOrders)
    .leftJoin(companyInvoiceItems, eq(companyInvoiceItems.printOrderId, printOrders.id))
    .where(
      and(
        eq(printOrders.companyId, companyId),
        gte(printOrders.createdAt, periodStart),
        lt(printOrders.createdAt, periodEnd),
        isNull(companyInvoiceItems.printOrderId),
      ),
    );

  const items = orders.map((order) => {
    const lineTotalCents = order.unitPriceCents * order.quantity;
    return {
      printOrderId: order.id,
      description: `${order.fileName} · ${order.color === 'bw' ? 'B&W' : 'Color'}`,
      quantity: order.quantity,
      unitPriceCents: order.unitPriceCents,
      lineTotalCents,
      vatAmountCents: vatAmountCents(lineTotalCents, vatRatePercent),
    };
  });

  const totalNetCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const totalVatCents = items.reduce((sum, item) => sum + item.vatAmountCents, 0);

  const [invoice] = await db
    .insert(companyInvoices)
    .values({
      companyId,
      periodStart,
      periodEnd,
      vatRatePercent,
      totalNetCents,
      totalVatCents,
      totalCents: totalNetCents + totalVatCents,
      status: 'draft',
    })
    .returning(INVOICE_COLUMNS);

  if (items.length > 0) {
    await db
      .insert(companyInvoiceItems)
      .values(items.map((item) => ({ ...item, companyInvoiceId: invoice.id })));
  }

  return invoice as CompanyInvoice;
}

/** Sends a 'draft' invoice through server/invoiceAdapter.ts and records the
 * result — a no-op (returns null) on anything but a 'draft' invoice, same
 * idempotency-guard shape as server/accountOrderStore.ts's payOrder. */
export async function issueInvoice(invoiceId: string): Promise<CompanyInvoice | null> {
  const [invoice] = await db
    .select(INVOICE_COLUMNS)
    .from(companyInvoices)
    .where(and(eq(companyInvoices.id, invoiceId), eq(companyInvoices.status, 'draft')));
  if (!invoice) return null;

  const [company] = await db.select().from(companies).where(eq(companies.id, invoice.companyId));
  const items = await db
    .select({
      description: companyInvoiceItems.description,
      quantity: companyInvoiceItems.quantity,
      unitPriceCents: companyInvoiceItems.unitPriceCents,
      lineTotalCents: companyInvoiceItems.lineTotalCents,
      vatAmountCents: companyInvoiceItems.vatAmountCents,
    })
    .from(companyInvoiceItems)
    .where(eq(companyInvoiceItems.companyInvoiceId, invoiceId));

  const result = await issueViaAdapter({
    company: company as Company,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    vatRatePercent: invoice.vatRatePercent,
    lineItems: items,
  });

  const [updated] = await db
    .update(companyInvoices)
    .set({
      status: 'issued',
      externalProvider: result.provider,
      externalInvoiceId: result.externalInvoiceId,
      pdfUrl: result.pdfUrl,
      issuedAt: new Date(),
    })
    .where(eq(companyInvoices.id, invoiceId))
    .returning(INVOICE_COLUMNS);

  return updated as CompanyInvoice;
}

export async function listInvoicesForCompany(companyId: string): Promise<CompanyInvoice[]> {
  const rows = await db
    .select(INVOICE_COLUMNS)
    .from(companyInvoices)
    .where(eq(companyInvoices.companyId, companyId))
    .orderBy(desc(companyInvoices.createdAt));
  return rows as CompanyInvoice[];
}
