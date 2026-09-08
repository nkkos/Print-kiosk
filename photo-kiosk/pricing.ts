// Placeholder default — real tariffication is a future discovery, same
// posture as src/utils/pricing.ts's own placeholder rate table. This
// pavilion prices in EUR (shop/formatPrice.ts's own convention).
export const DEFAULT_PRICE_CENTS = 500;

export function formatPrice(cents: number): string {
  return `${(cents / 100).toFixed(2)} €`;
}
