// The price list in integer euro cents, VAT included — the one place both
// the stand's display (src/utils/pricing.ts) and the server's charge
// (server/paymentStore.ts) read rates from, so what the customer sees is
// exactly what the terminal asks for (docs/payments-technical-requirements.md,
// "Principles"). No imports on purpose: the server loads this file directly.
//
// Placeholder rates until the real price list is confirmed
// (docs/payments-business-requirements.md, "Prices").
export const RATE_PER_SIDE_CENTS: Record<string, number> = {
  'A4-bw-single': 10,
  'A4-bw-double': 8,
  'A4-color-single': 30,
  'A4-color-double': 25,
  'A5-bw-single': 7,
  'A5-bw-double': 6,
  'A5-color-single': 20,
  'A5-color-double': 18,
};

/** VAT rate applied to every print/copy line (the company is a VAT payer). */
export const PRINT_VAT_RATE_PERCENT = 23;

/** Per-copy price of a configured document: printed sheet sides × the rate
 * for its paperSize/color/sides. `null` for a combination with no rate. */
export function unitPriceCentsFor(
  sheetSides: number,
  paperSize: string,
  color: string,
  sides: string,
): number | null {
  const rate = RATE_PER_SIDE_CENTS[`${paperSize}-${color}-${sides}`];
  return rate === undefined ? null : sheetSides * rate;
}
