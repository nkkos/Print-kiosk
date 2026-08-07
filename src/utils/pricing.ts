import type { PrintOrder } from '../types/kiosk';

// Extracted once a second consumer (CartPanel and App.tsx's Payment Status
// split) needed the exact same calculation — per this project's rule of
// extracting shared logic only once it's genuinely shared, not speculatively
// (docs/implementation/project-architecture.md, Section 9).
//
// See docs/cart-requirements.md ("Pricing") and
// docs/personal-account-requirements.md ("Paid orders awaiting print"):
// ordinary items are unitPrice × quantity; items paid in advance only
// charge for copies beyond what was already paid (never negative).
export function computeItemPrice(item: PrintOrder): number {
  const unpaidQuantity = Math.max(0, item.quantity - (item.paidQuantity ?? 0));
  return item.unitPrice * unpaidQuantity;
}

// Placeholder test rates, $ per page — not real business values yet. Real
// tariffication is its own future discovery (docs/domain/kiosk-session.md,
// "Open items": "Future pricing logic beyond linear... not designed for
// now"); these just replace the old flat PLACEHOLDER_UNIT_PRICE with
// something that actually varies by paperSize/color/sides, to be swapped
// for confirmed rates later without touching any call site.
const RATE_PER_PAGE: Record<string, number> = {
  'A4-bw-single': 0.1,
  'A4-bw-double': 0.08,
  'A4-color-single': 0.3,
  'A4-color-double': 0.25,
  'A5-bw-single': 0.07,
  'A5-bw-double': 0.06,
  'A5-color-single': 0.2,
  'A5-color-double': 0.18,
};

// The per-copy price for a configured document — pageCount × the rate for
// this paperSize/color/sides combination. Stored as a PrintOrder's
// `unitPrice` at "Add to cart" time (src/features/print-order-configuration/PrintOrderConfigurationScreen.tsx),
// same slot PLACEHOLDER_UNIT_PRICE used to fill — computeItemPrice above is
// unchanged, it just multiplies whatever unitPrice it's given by quantity.
export function computeUnitPrice(
  pageCount: number,
  paperSize: PrintOrder['paperSize'],
  color: PrintOrder['color'],
  sides: PrintOrder['sides'],
): number {
  const rate = RATE_PER_PAGE[`${paperSize}-${color}-${sides}`] ?? 0;
  return pageCount * rate;
}
