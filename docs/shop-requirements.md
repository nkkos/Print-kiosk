# Online Shop — Business Requirements (Living Document)

Internal project document. This is a working, ever-growing list of everything a mature small e-commerce operation eventually needs — most of it modeled on what platforms like Shopify have already solved — with a priority against each item so we know what's actually in scope for the first real build versus deliberately deferred. Expect this list to keep growing as we think of more; that's expected, not a sign it was incomplete before.

**Priority key:**

- **MVP** — building this now, as part of the first real checkout/ordering flow.
- **Later** — real feature, deliberately deferred past the first launch.
- **Decision needed** — can't be prioritized yet because it depends on a business or legal call, not just development bandwidth.

## Context: what already exists to build on

Not starting from zero. The real backend (`server/db/schema.ts`) already has:

- **`accounts`** — real customer accounts (bcrypt passwords, email verification) — this is the single identity the shop must reuse, not a second login system.
- **`accountFiles` / `accountFolders`** — permanent, account-owned file storage (the portal's "My files").
- **`paymentOrders`** — a payment record (status, amount, timestamps).
- **`printOrders`** — one print job's configuration (paper size, sides, color, quantity, price), linkable to an `accountFile` and a `paymentOrder`, with a `created → paid → issued` status lifecycle.

**The gap for a real shop:** `paymentOrders` today is effectively 1:1 with a single `printOrders` row — it has no concept of a multi-item cart (a print job _and_ a souvenir mug in the same order). Turning this into a real shop means introducing a proper line-item model (one `paymentOrders` row → many order lines, of different product types) rather than bolting more special cases onto the existing 1:1 shape.

## Catalog & products

| Feature                                                               | Priority |
| --------------------------------------------------------------------- | -------- |
| Categories/collections                                                | MVP      |
| Product variants (size, material, color)                              | MVP      |
| Two product kinds: instant-fulfillment (print) vs. delayed (souvenir) | MVP      |
| File upload before purchase (print, personalized items)               | MVP      |
| Stock/inventory tracking for physical items                           | MVP      |
| Basic search + filters (category, price)                              | MVP      |
| Multiple product photos                                               | MVP      |
| "Coming soon" / out-of-stock states                                   | Later    |
| Limited editions / seasonal drops                                     | Later    |
| "You might also like" / "bought together" recommendations             | Later    |
| Reviews & ratings                                                     | Later    |
| Quick-view popup                                                      | Later    |
| Catalog SEO (structured data, canonical URLs)                         | Later    |

## Cart & checkout

| Feature                                                                        | Priority |
| ------------------------------------------------------------------------------ | -------- |
| Add/remove/change quantity                                                     | MVP      |
| Mixed cart (print job + physical souvenir together)                            | MVP      |
| One real payment provider, tokenized checkout                                  | MVP      |
| VAT calculation (Slovakia/EU)                                                  | MVP      |
| Order confirmation email                                                       | MVP      |
| Account required to purchase (no guest checkout) — **confirmed 2026-08-25**    | MVP      |
| Promo codes                                                                    | Later    |
| Volume discounts via account (ties to `docs/personal-account-requirements.md`) | Later    |
| Saved payment methods for repeat purchase                                      | Later    |
| Abandoned-cart tracking + reminder email                                       | Later    |

## Customer account

| Feature                                      | Priority |
| -------------------------------------------- | -------- |
| Order history (extends existing "My orders") | MVP      |
| Reorder in one click                         | Later    |
| Wishlist                                     | Later    |
| Loyalty / points program                     | Later    |
| Referral program                             | Later    |

## Fulfillment

| Feature                                                                                                                                                                               | Priority |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Status: preparing → ready for pickup, with notification                                                                                                                               | MVP      |
| Pickup from the locker (reuses existing pattern)                                                                                                                                      | MVP      |
| Partial readiness within one order (print ready now, souvenir later)                                                                                                                  | MVP      |
| Fulfillment method is a real field on the order (not hardcoded to pickup) — **confirmed 2026-08-25**: pickup-only for MVP, but the data model leaves room for a delivery option later | MVP      |
| Actual delivery/shipping implementation                                                                                                                                               | Later    |
| Returns / exchanges / cancellation                                                                                                                                                    | Later    |
| Partner-fulfilled item status tracking (external print shop)                                                                                                                          | Later    |

## Marketing

| Feature                                                                                 | Priority |
| --------------------------------------------------------------------------------------- | -------- |
| Welcome / re-engagement email sequences                                                 | Later    |
| Tourist discount coupons via the interactive screen (from the original equipment brief) | Later    |
| Retargeting pixels (Meta/Google)                                                        | Later    |
| Product feed (Google Shopping)                                                          | Later    |
| Local partner referral/affiliate program                                                | Later    |

## Analytics

| Feature                                    | Priority |
| ------------------------------------------ | -------- |
| Conversion funnel (view → cart → purchase) | Later    |
| Sales/LTV reporting                        | Later    |
| A/B testing infrastructure                 | Later    |

## Back office / admin

| Feature                                                                                                                                                           | Priority |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Simple product add/edit UI form — **confirmed 2026-08-25**: not just a script; likely lives in the existing staff `admin/` console alongside equipment monitoring | MVP      |
| Order management UI (status changes, manual cancel/refund)                                                                                                        | Later    |
| Inventory management UI                                                                                                                                           | Later    |
| Promo code management                                                                                                                                             | Later    |
| Financial export for accounting                                                                                                                                   | Later    |

## Legal / compliance

| Feature                                                                                                                         | Priority                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Terms of use, return policy (real legal text, not placeholder)                                                                  | MVP                                                                            |
| GDPR consent (cookies, marketing email)                                                                                         | MVP                                                                            |
| **eKasa** — Slovak electronic cash-register fiscalization, likely mandatory for retail sales including online-order-with-pickup | Decision needed — needs real research, not a generic e-commerce checklist item |
| Invoices for business customers                                                                                                 | Later                                                                          |

## Localization

| Feature                             | Priority        |
| ----------------------------------- | --------------- |
| Slovak + English content            | Decision needed |
| Euro pricing, local payment methods | MVP             |

## Open decisions (blocking priority calls above)

- **eKasa applicability** — needs actual research into Slovak retail fiscalization law, not assumed either way.
- **Payment provider** — which processor for Slovakia/EU (affects VAT handling, payout timing, and how "tokenized checkout" gets implemented).

**Resolved 2026-08-25:** account required to purchase (no guest checkout); pickup-only for MVP with the order model still carrying a real fulfillment-method field so delivery can be added later without a schema rework; a simple product add/edit form ships as part of MVP rather than a script-only workaround.

## Notes for implementation

This document will keep growing — new features surfaced mid-build get added here with a priority, not silently implemented or silently dropped, so the MVP boundary stays a visible, deliberate decision rather than scope creep either direction.
