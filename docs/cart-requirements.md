# Cart — Requirements

Internal project document. Confirmed with the product owner. Complements `docs/domain/kiosk-session.md` ("Related entities: Cart, Print Order"), which establishes Cart's session scope and popup presentation — this document defines the field-level behavior of Cart items themselves.

All project artifacts are written in English.

## Scope

Covers Cart's item-level behavior: quantity, per-item selection for payment, and removal. Applies to Print Order today (the only implemented order type); the same shape is expected to extend to Scan Order and Copy once those services are built, since quantity ("how many copies/executions of this configured service") is a general concept, not Print-specific.

## Quantity

- Every Cart item (Print Order) carries a `quantity`: the number of copies of the configured document to produce. For a Print Order, this is copies of the already-configured document (whatever pages/settings the user chose) — not a page count.
- **Set in two places, same underlying value:**
  - Initially on the Print Order Configuration screen, before "Add to cart".
  - Adjustable again afterward, directly in the Cart popup — editing it there changes the same Print Order, it does not create a new one.
- **Control:** a stepper (+/− buttons). Minimum is **1** — decrementing at 1 does nothing; removing an item entirely is a separate, explicit action (see "Removal").
- **No upper limit** on quantity is enforced.
- Checking real resource availability (paper/ink) before allowing a large quantity is explicitly **not** done — flagged as an open item in `docs/domain/kiosk-session.md` (requires a real hardware agent, and even then most printers don't expose reliable remaining-stock counts).

## Pricing

- Each line's price is `unitPrice × quantity` — linear, recalculated whenever quantity changes.
- This is the confirmed behavior for now. Other pricing models (e.g., volume discounts) are a future possibility, not designed or scoped here — flagged as an open item in `docs/domain/kiosk-session.md`.
- **Exception — orders paid in advance:** a Print Order sourced from Personal Account's "My orders" (docs/personal-account-requirements.md, "Paid orders awaiting print") may carry a `paidQuantity`. When present, the line's price is `unitPrice × max(0, quantity - paidQuantity)` instead — $0 if quantity is unchanged from what was already paid, or just the un-paid delta if raised on-site. Every other Cart item (no `paidQuantity`) uses the plain formula above.

## Selection for payment

- Each Cart item has a checkbox: "include this item in the payment I'm about to make."
- **Default: all items checked** every time the Cart popup is opened.
- The user may uncheck items they don't want to pay for/execute right now. Unchecked items are **not removed** — they remain in the Cart, available to select next time.
- "Proceed to payment" acts only on the currently checked items: it is these items — and only these — that become the Payment Order (`docs/domain/kiosk-session.md`, "Payment Order — created from a user-selected subset of cart items"). Unchecked items stay behind in the Cart, untouched.
- The Cart's displayed total reflects only the checked items' sum, since that is the amount that will actually be charged if the user proceeds now.
- Selection state is not persisted on the Print Order itself — it is a transient choice for the current Cart visit, which is why it always defaults back to "all checked" the next time the popup opens.

## Removal

- Each Cart item has a remove control (an "×").
- Removal is **immediate** — no confirmation dialog. This is a low-stakes action (removing an item you added yourself, before any payment), unlike End Session, which is why it doesn't need End Session's confirmation treatment.
- Removal deletes the Print Order from the Cart/session entirely; it does not revert to some other state.

## Not covered here

- Scan Order / Copy Order shape (not yet built).
- Payment Order's own fields and lifecycle beyond what `docs/domain/kiosk-session.md` already states.
- Any UI for editing the underlying print settings (paper size/sides/color) from within the Cart — that remains exclusive to Print Order Configuration.
