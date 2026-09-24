import type { Company } from './companyStore.js';

// The one seam to a real invoicing provider (SuperFaktúra or similar,
// decision deferred — docs, "B2B company-billing portal" plan) — everything
// else in the backend (server/companyInvoiceStore.ts) only ever calls
// issueInvoice() below, never a provider's own API shape directly. Same
// "one file owns the real integration, the rest stays ignorant of it"
// pattern as server/printerAdapter.ts, built the same way before a real
// printer existed. This matters specifically because Slovakia's mandatory
// e-invoicing (IS EFA/Peppol, structured EN16931 XML) lands 2027-01-01 —
// swapping in a real, compliant provider later should mean replacing this
// one file, not re-touching every call site that generates an invoice.

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  /** NET (before VAT) — same convention as companies.pricePerPageBwCents. */
  unitPriceCents: number;
  lineTotalCents: number;
  vatAmountCents: number;
}

export interface IssueInvoiceParams {
  company: Company;
  periodStart: Date;
  periodEnd: Date;
  /** Snapshotted on the invoice at draft-generation time — server/companyInvoiceStore.ts's
   * createDraftInvoice, not read live from `company.vatRatePercent` here. */
  vatRatePercent: number;
  lineItems: InvoiceLineItem[];
}

export interface IssueInvoiceResult {
  provider: string;
  externalInvoiceId: string;
  pdfUrl: string | null;
}

/** Stub implementation — no real provider is wired up yet. Fabricates an id
 * instead of calling out anywhere, so the rest of the billing flow (draft ->
 * review -> issue in the admin panel) can be built and tested end-to-end
 * before a provider is chosen. Never silently "succeeds" in a way that
 * looks real: the fabricated id is prefixed so it's obviously not a real
 * invoice number in the admin UI. */
export async function issueInvoice(params: IssueInvoiceParams): Promise<IssueInvoiceResult> {
  const netCents = params.lineItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const vatCents = params.lineItems.reduce((sum, item) => sum + item.vatAmountCents, 0);
  console.log(
    `[invoiceAdapter] STUB: would issue an invoice to ${params.company.name} (IČO ${params.company.ico}) ` +
      `for ${params.lineItems.length} line item(s) — net ${netCents}c + VAT ${vatCents}c ` +
      `(${params.vatRatePercent}%) = ${netCents + vatCents}c — no real provider configured.`,
  );
  return {
    provider: 'stub',
    externalInvoiceId: `stub-${Date.now()}`,
    pdfUrl: null,
  };
}
