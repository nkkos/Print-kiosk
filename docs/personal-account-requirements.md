# Personal Account — Confirmed Requirements

Internal project document. Consolidates the requirements confirmed with the product owner for the Personal account upload method (`upload-method-account` on the Upload Method Selection Screen). This document defines requirements only — no visual design, specification, or wireframe exists yet for the kiosk-side screens this flow touches.

## Two separate surfaces

Personal Account spans two genuinely different applications, sharing the same backend account/data:

- **The web portal** — a separate product, accessed from the user's own device (phone, computer) via a normal browser, outside the kiosk application. Lets the user manage their account in full: browse/organize files (including creating and managing folders), view order history, invoices, promo codes, account information, and payment methods. **This portal is out of scope for the kiosk codebase** — it is a distinct application against the same backend.
- **The kiosk's Personal Account screen** — a deliberately reduced view, part of this codebase, with two sections (revised from an earlier "My files only" decision, once it became clear paid-awaiting-print orders need somewhere to live):
  - **My files** — file selection for the purpose of picking something to print. See "File browsing on the kiosk" and "Batch configure" below.
  - **My orders** — reduced to only orders in a "paid, awaiting print" status (see "Paid orders awaiting print" below); not the portal's full order history.
  - Invoices, promo codes, account information, and payment methods are **not** shown on the kiosk at all — those remain portal-only.

## Kiosk-side login (`btn-account`)

**Implemented, real backend:** `LoginPanel` authenticates against `POST /api/accounts/register`/`login` (`server/routes.ts`, `server/accountStore.ts`), a real `accounts` table (`server/db/schema.ts`) with bcrypt-hashed passwords — no more hardcoded mock credential. **My files and My orders below are still mocked** — there's no real "save a file to my account" or "pay in advance" flow yet (that needs the web portal, out of scope here, plus real payments); only the login mechanism itself is real so far.

- **Baseline: username/password**, entered via the kiosk's on-screen keyboard (a physical keyboard is also expected to be installed at the kiosk). This must exist regardless of any other login method, since it's the only method that works for a first-time user with no prior session on any device.
- **QR quick-login** is a confirmed-worthwhile addition on top of the baseline, reusing the same mechanism as QR file upload (`docs/qr-upload-requirements.md`): the kiosk shows a QR code encoding a login token; the user's phone (already holding an authenticated session with the web portal) confirms the login; the kiosk detects the confirmation via the same polling pattern used for QR uploads. This only skips password entry for a user whose phone already has a persisted portal session — a user logging in from their phone for the first time is still redirected to a normal login form there, just off the shared kiosk keyboard rather than on it.
- Successful login is a Kiosk Session concern like any other login (see `docs/domain/kiosk-session.md`, "Login relationship") — it creates a session if none exists yet, or associates the current session with the account.
- **`btn-account` (footer) navigates directly to the Personal Account screen once logged in** — same destination as the Personal account card on Upload Method Selection, rather than showing a "logged in as..." confirmation. While logged out, it opens the login form; on success, it navigates there too. The footer also shows the same star marker used for a non-empty Cart whenever the session is logged in.
- **Logging out** is available from the Personal Account screen (a "Log out" action alongside My files/My orders). It clears the account from the Kiosk Session only — the session itself and its Cart are untouched (a logout is not an End Session) — and returns to Upload Method Selection.

## File browsing on the kiosk

- Files may be organized into folders by the user, but **folder creation/management happens only on the web portal**. The kiosk's Personal Account screen is read-only with respect to organization — the user can navigate an existing folder structure (or a flat root, if they never created folders) to find and select a file, but cannot create, rename, move, or delete folders from the kiosk. Standard drill-down navigation (open a folder to see its contents, a way back up) — no requirement to keep it especially compact, kiosk screen space is sufficient.
- Selecting a single file from My files proceeds to Print Order Configuration exactly like a file from any other upload method (Email, QR) — same downstream flow, no special case there.

## Batch configure

Confirmed for My files (and retrofitted into Email and QR, since the same need applies there): configuring files for printing one at a time is unnecessary friction when several files need the same treatment or the user just wants to get through a batch quickly.

- **My files:** each file has a checkbox (multi-select), plus an action to configure printing for the checked files.
- **Email / QR:** no checkboxes — a single "Configure printing for all files" action, covering every currently-selectable (fully scanned) file from that source at once. (Email: every ready attachment across every received email, not just one opened email's attachments.)
- **Sequential processing, once started:** Print Order Configuration opens for the first file in the batch. Adding it to Cart does **not** return to the source screen or open the Cart popup — it immediately opens Print Order Configuration for the next file in the batch. Only once every file in the batch has been added does the flow return to the source screen with the Cart popup open (the same end state as the existing single-file flow).
- This coexists with the existing one-file-at-a-time flow — batch configure is an additional action, not a replacement.

## Paid orders awaiting print

A confirmed scenario distinct from every other upload method: the user configured and paid for printing in advance via the web portal, and visits the kiosk only to have it printed.

- **Detection and prompt:** the moment the user logs into their account on the kiosk (from any screen — this is not specific to the Personal Account screen), the system checks for orders in a "paid, awaiting print" status. If any exist, a popup is shown informing the user, with two actions: close the popup, or go to the Personal Account screen (specifically its **My orders** section, not My files).
- **Adding a paid order to Cart:** from My orders, the user adds a paid-awaiting-print order to the Cart the same way as any other file — it appears as a normal Cart item. The Cart popup opens immediately afterward (same "see what was just added" behavior as every other add-to-cart path), even though — unlike Email/QR/My files — this action doesn't otherwise navigate away from the Personal Account screen.
- **Confirmed: a paid order can only be added to Cart once.** Once added, it disappears from My orders (it reappears there if that Cart item is later removed) — otherwise the same paid order could be added repeatedly, each copy pricing at $0. Extra copies beyond what was paid for are obtained the ordinary way: raising `quantity` on that one Cart item, which correctly falls back to `unitPrice` per `computeItemPrice` below.
- **Field-level model (confirmed):** a Print Order carries an optional `paidQuantity` — present only on orders paid in advance via the portal, absent on every other order. The Cart price for an item is `unitPrice × max(0, quantity - paidQuantity)` (`paidQuantity` treated as 0 when absent) — this is $0 when quantity is unchanged from what was paid, and only the un-paid delta when quantity is raised on-site. The already-paid portion is never recalculated or reconciled against current pricing (e.g. if a promotion changes after payment) — the paid and new portions are priced independently, matching `docs/domain/kiosk-session.md`, Open items.
- **Payment Status with a mixed Cart selection (confirmed):** when "Proceed to payment" is pressed on a checked selection that includes both $0 and priced items, only the priced items require an actual payment step — but the $0 items are still shown in the Payment Status summary for clarity (so the user sees the full batch that's about to print, not just what they're paying for). If every checked item is $0, Payment Status and payment verification are skipped entirely. Either way, once payment succeeds (or there was nothing to pay), the **entire** checked selection — priced and free items together — proceeds to Print Status as one batch, since they print together.
- **Mixing sources freely:** a single Cart may contain both paid-awaiting-print orders and newly configured files from any upload method (e.g., the user uploads new documents via QR, then also visits Personal Account to add a pre-paid order) — there is no exclusivity between these paths.

## Scope boundaries

Out of scope for this document: the web portal itself (a separate application), the full pricing/discount engine (promo codes, promotions, volume discounts — see `docs/domain/kiosk-session.md`, Open items, for early directional decisions only), corporate/B2B account features (shared team accounts, invoicing terms — explicitly deferred, not part of this method's current scope), and the six-method selection screen itself (see `docs/upload-method-requirements.md`).

## Open items

- The full pricing/discount engine (promo codes, promotions, volume discounts, their stacking/interaction rules) — see `docs/domain/kiosk-session.md`, Open items, for the directional decisions already confirmed, pending a full dedicated discovery.
- Exact QR quick-login token/security scheme (mirrors the open items already tracked for QR upload in `docs/qr-upload-requirements.md`).
- Corporate/B2B account features (shared team queues, delegation, invoicing) — discussed as a possible future direction, not scoped or confirmed.
- Exact My orders list presentation (what's shown per order beyond enough to identify and select it) — not yet specified; deferred to the screen specification.
