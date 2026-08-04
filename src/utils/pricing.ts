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
