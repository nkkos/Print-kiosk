import type { PrintOrder } from '../types/kiosk';
import { sheetSidesFor, type PagesPerSheet } from './nUpLayout';
import { unitPriceCentsFor } from './tariff';

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

// The per-copy price for a configured document, in euros for display —
// rates live in src/utils/tariff.ts (cents), shared with the server. With several pages per
// sheet the customer pays per printed side at the ordinary rate (confirmed
// 2026-09-25), so 2 pages per sheet costs half. Stored as a PrintOrder's
// `unitPrice` at "Add to cart" time (src/features/print-order-configuration/PrintOrderConfigurationScreen.tsx),
// same slot PLACEHOLDER_UNIT_PRICE used to fill — computeItemPrice above is
// unchanged, it just multiplies whatever unitPrice it's given by quantity.
export function computeUnitPrice(
  pageCount: number,
  paperSize: PrintOrder['paperSize'],
  color: PrintOrder['color'],
  sides: PrintOrder['sides'],
  pagesPerSheet: PagesPerSheet = 1,
): number {
  const cents = unitPriceCentsFor(sheetSidesFor(pageCount, pagesPerSheet), paperSize, color, sides);
  return (cents ?? 0) / 100;
}
