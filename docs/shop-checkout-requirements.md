# Shop Checkout — Requirements

Internal project document. Confirmed with the product owner (2026-08-25). Complements `docs/shop-requirements.md` (feature list + priority) — this document defines the actual cart-to-confirmation process flow for the shop's MVP. Also relates to `docs/cart-requirements.md` (the kiosk's own Cart, a different cart from this one) and `docs/personal-account-requirements.md` ("Paid orders awaiting print," which this flow feeds into for the self-service order type).

All project artifacts are written in English.

## Two fundamentally different order types

Every purchasable item is one of:

- **Self-service** — the customer prints/produces it themselves at the kiosk (today: print jobs). Ready the moment it's paid.
- **Staff-fulfilled** — the pavilion (or a partner) produces it and hands it over (souvenirs, UV-printed items, external print-shop jobs). Takes real time to prepare.

**Confirmed: these are split into separate orders at checkout**, even when purchased together in one cart, so the self-service portion is immediately usable without waiting on the staff-fulfilled portion. One payment can cover multiple resulting orders — see "Order splitting" below.

## Cart

- Items are added to the cart **already fully configured** — for a print item, file upload, antivirus/format validation, and print settings (paper size, sides, color) all happen at upload/configuration time, before the item ever reaches the cart, mirroring the kiosk's own existing Print Order Configuration → Add to Cart pattern. The cart never holds an unconfigured placeholder.
- **Quantity** on a print cart item means copies of the same already-uploaded file — not a count of distinct files.
- A cart may freely mix self-service and staff-fulfilled items; the split into separate orders happens at payment time, not in the cart itself.

## Checkout screen

One screen, reached from the cart, combining:

- **Fulfillment method** — for MVP, self-pickup at the pavilion is the only option, shown as a fixed value (not an interactive selector yet). The underlying order data still carries a real fulfillment-method field so a delivery option can be added later without a schema change — see `docs/shop-requirements.md`'s "Fulfillment" table.
- **Payment method** — may offer more than one option (exact methods depend on the payment provider chosen — open item).
- **Account fields** — pre-filled and read-only-ish if already logged in; if not logged in, fields to create a new account (email + password) right here, without leaving to the portal's separate register page. **Account is required to purchase — no guest checkout** (confirmed in `docs/shop-requirements.md`).
- **Optional invoice fields** — a checkbox ("I need an invoice") reveals company name + tax ID fields, only for those who check it. These same fields are also editable later from the account's own settings (in the personal cabinet), for reuse on future orders — they're not checkout-only.

Clicking **"Next"** either goes straight to the payment redirect (already-verified account) or, for a newly created/unverified account, first shows the email-verification step below.

## Email verification gate (new/unverified accounts only)

**Confirmed as a deliberate experiment** — the product owner wants to observe its real effect on completion rate and may revise this later; do not treat it as a permanently settled decision the way the rest of this document is.

- After submitting the checkout form with a new account, the screen shows "check your email to continue" and **polls automatically** for verification — the same pattern already used for the kiosk's QR quick-login (`docs/personal-account-requirements.md`) — rather than requiring the customer to manually click a "continue" button after verifying.
- **Abandonment is allowed and expected**: the customer can simply leave without verifying or paying. Nothing forces completion. This is an ordinary abandoned cart, not a blocked/error state.
- Only once verification is detected does the flow proceed automatically to the payment redirect.
- Already-logged-in, already-verified customers skip this step entirely.

## Payment

- **One payment for the whole cart** — a single transaction/charge, regardless of how many resulting orders it produces. Chosen deliberately to avoid disrupting the customer's checkout UX with multiple separate charges.
- The customer is redirected to the actual payment step only after the account exists and (if newly created) its email is verified.

## Order splitting (backend, after successful payment)

- One successful payment produces one order per fulfillment type present in the cart (at most two today: one self-service order covering all self-service items, one staff-fulfilled order covering all staff-fulfilled items) — not one order per cart line.
- **The two resulting orders are independent records** — no "these came from one purchase" grouping is shown in the customer-facing order history. The payment record itself, however, can legitimately reference multiple orders (a real one-payment-to-many-orders relationship, extending today's effectively-1:1 `paymentOrders` → `printOrders` shape).

## Confirmation screen

- Shows **all** resulting orders from the purchase together, on one "thank you" screen — even though they're independent records afterward in order history.

## Order visibility after checkout

- **Self-service orders**: visible both in the personal cabinet (portal) and on the kiosk's own "My orders" (paid, awaiting print) — reuses the existing real pattern from `docs/personal-account-requirements.md` exactly as-is.
- **Staff-fulfilled orders**: visible **only** in the personal cabinet. The kiosk screen never shows these — its "My orders" is scoped to what the customer completes themselves at the kiosk.

## Open items

- Payment provider choice (Slovakia/EU) — affects exactly which payment methods appear at checkout and how the redirect/tokenized flow is implemented.
- Actual invoice generation/delivery for the optional business fields — collecting the fields is in scope for MVP; generating a real invoice document is not yet scoped (`docs/shop-requirements.md`, "Later").
- Whether the email-verification gate stays as designed, given it's an explicit experiment — revisit once there's real completion-rate data.
