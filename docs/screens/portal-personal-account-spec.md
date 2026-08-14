# Portal Personal Account — Redesign Spec (Start / My files / My orders)

Internal project document. Confirms the visual redesign of three portal pages
(`portal/`) around a shared sidebar shell, based on wireframes supplied by the
product owner (2026-08-12) and the clarifying decisions recorded below. Scope
is exactly these three screens — Start, My files, My orders — plus enough of
the shared shell (header, sidebar) to host them consistently. See
`docs/personal-account-requirements.md` for the underlying account/file/order
requirements this redesign presents, including the confirmed three-state
order lifecycle ("Order status lifecycle") this document's My orders screen
relies on. This document is layout/UI, but does require the backend changes
called out under "New backend rules" and "My orders" below.

## Relationship to the current implementation

`portal/account.html` and `portal/files.html` (real, working today — see
`docs/personal-account-requirements.md`) implement all the functionality this
spec's three screens need. This is a **visual restyle + navigation
regrouping**, not a rebuild:

- Start = new — no equivalent page exists today.
- My files = `portal/files.html`'s file/folder list and "Configure & pay"
  panel, restyled into the new shell.
- My orders = new page, but the underlying data (`GET`-equivalent of
  `listPaidOrders`, already used by the kiosk) already exists.
- Account information = `portal/account.html`'s change-password/delete-account,
  moved into the new shell as a fourth, immediately-functional sidebar
  destination (confirmed below) — outside the three screens named in the
  original request, but cheap to include since nothing new needs building.
- `register.html`, `verify-email.html`, `forgot-password.html`,
  `reset-password.html` are **not** part of this shell — they're one-off
  flows reached via emailed links or before a session exists, not ongoing
  navigation destinations. They stay as-is.

## Shared shell

### Layout

- **Header**, full width, top of page:
  - Left: `Welcome, {email}!` — the account's email (no separate display
    name exists in the data model), not a placeholder "username" as in the
    wireframe.
  - Right: `EXIT` button.
- **Sidebar**, left column, persistent under the header: six stacked nav
  items — My files, My orders, Invoices, My promo codes, Account
  information, Payment methods (order and grouping as wireframed; no
  section dividers confirmed).
- **Content area**, right of the sidebar: renders whichever screen is
  active. No page reload between sidebar destinations (single page,
  swapped content) — see "Notes for implementation."

### Interactive elements (shared shell)

| Identifier                   | Purpose                 | Default state              | Enabled/disabled                                                                          | Action after click                                                                                                                 |
| ---------------------------- | ----------------------- | -------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `portal-exit`                | Ends the portal session | Visible whenever logged in | Enabled                                                                                   | Logs out (clears the in-memory session token) and returns to the login form — **assumption, not from a wireframe; flag if wrong.** |
| `portal-nav-files`           | My files                | Visible                    | Enabled                                                                                   | Shows My files in the content area                                                                                                 |
| `portal-nav-orders`          | My orders               | Visible                    | Enabled                                                                                   | Shows My orders in the content area                                                                                                |
| `portal-nav-invoices`        | Invoices                | Visible                    | **Disabled ("coming soon")** — confirmed, out of scope this pass                          | None                                                                                                                               |
| `portal-nav-promo-codes`     | My promo codes          | Visible                    | **Disabled ("coming soon")**                                                              | None                                                                                                                               |
| `portal-nav-account-info`    | Account information     | Visible                    | **Enabled** — confirmed, absorbs `account.html`'s existing change-password/delete-account | Shows Account information (existing functionality, restyled) in the content area                                                   |
| `portal-nav-payment-methods` | Payment methods         | Visible                    | **Disabled ("coming soon")**                                                              | None                                                                                                                               |

Disabled sidebar items render present-but-inert (same convention as the
kiosk's `coming-soon` `ServiceCard` state) rather than being omitted — this
was an explicit choice (see the discovery decision log below), so the user
can see the account's eventual full scope even before it's built.

## Start screen

### Layout

- Header + sidebar (shared shell, above).
- Content area: a single content/promo block, full width and height of the
  content area.

### Content/promo block — open item

The wireframe labels this only "Content/promo block," with no specified
content. **No content is confirmed for it.** Recommendation: ship it as an
empty/placeholder panel for the current milestone — mirrors how the kiosk's
own promo slot was left unconfirmed and eventually removed rather than
guessed at (`docs/screens/welcome-screen-wireframes.md`, "Kiosk Session
update"). Do not invent promotional copy, upsell content, or an activity
feed here without a separate confirmation.

### Navigation

- Reached immediately after login (replaces today's behavior of no
  post-login landing page beyond `account.html` itself).
- Every sidebar item navigates away from Start to its own content area view
  (Start itself is not one of the six sidebar items — it's the default
  landing state, reached again only via a fresh login).

## My files

### Layout

- Header + sidebar (shared shell).
- Content area:
  - A one-line rule/limits notice (format, retention, storage quota — see
    "New backend rules" below for why the exact wording isn't final).
  - `ADD FILES` / `ADD FOLDER` actions.
  - The file list. **Folders are kept** (confirmed — see decision log): the
    wireframe's flat list reflects a folder-less example, not a decision to
    drop folder support. Existing drill-down (open a folder, a way back to
    root) carries over unchanged from `portal/files.html`.
  - Per-file "Configure & pay" — the settings fields themselves are
    unchanged from today's real implementation (paperSize/sides/color/
    orientation/scale/page-range, real preview with thumbnail +
    click-to-enlarge). **The action itself now splits in two**, to make
    "created, awaiting payment" (see "Order status lifecycle" below)
    actually reachable: a "Save" action creates the order unpaid, and "Pay
    now (simulated)" pays it — available immediately after Save (so
    clicking both back-to-back reproduces today's single-step UX exactly),
    or later from My orders on the same now-pending order. **This split is
    a design call made in this document, not a wireframed or explicitly
    confirmed decision — flag if a different flow is wanted** (e.g. a
    single button that always pays immediately, with no unpaid state ever
    reachable from My files itself).

### New backend rules (values not final)

The wireframe's limits notice — _"Allowed formats are pdf and jpg. Files are
kept for 30 days. Maximum storage size 100 MB"_ — represents **three real,
confirmed-as-needed rules that don't exist today**, not wireframe filler:

1. **Narrower format restriction** than QR/Email uploads currently share
   (`server/fileValidation.ts`'s `ACCEPTED_EXTENSIONS`) — Personal Account
   files need their own, narrower accepted-format list.
2. **Retention/TTL** — `server/accountFileStore.ts`'s files are currently
   permanent by design (explicitly kept out of the session-scoped TTL sweep
   so a user's saved files are never silently deleted). A 30-day-style
   retention rule would need its own sweep, separate from
   `sessionLifecycle.ts`'s existing one, plus a decision on user-facing
   warning before deletion.
3. **Per-account storage quota** — nothing enforces a total-size cap across
   an account's files today (only a per-file size cap exists,
   `MAX_FILE_SIZE_BYTES`).

**The specific numbers (pdf+jpg, 30 days, 100 MB) are test values, not
final** — confirmed they'll change often, so all three must be backend
config (env vars), not hardcoded, so a value change never needs a code
change/deploy. Exact env var names and current defaults are an
implementation-time decision, not specified further here. Tracked in
`docs/personal-account-requirements.md`, Open items.

### Navigation

- `ADD FILES` → uploads into the currently-open folder (or root).
- `ADD FOLDER` → creates a folder inside the currently-open folder (or at
  root) — mirrors `portal/files.html`'s existing behavior.
- Opening a folder row drills in; a back action returns to its parent.
- "Configure & pay" on a file → expands the existing settings panel
  in-place (unchanged from today).

## My orders

**No wireframe was supplied for this screen** — designed here to match the
shared shell, using the real three-state order lifecycle confirmed in
`docs/personal-account-requirements.md`, "Order status lifecycle."

### Layout

- Header + sidebar (shared shell).
- Content area: a list of the account's orders, one row per order — file
  name, enough of the configured settings to identify it (mirror the
  kiosk's own `orderDescription` treatment, `src/i18n/en.ts`'s
  `personalAccount.orderDescription`, for consistency rather than
  inventing a second presentation), and its status badge:
  - **Created, awaiting payment** — a "Pay now" action (the same simulated
    payment as today's single-step create-and-pay, now its own step).
  - **Paid, awaiting fulfillment** — read-only here; this is the state the
    kiosk's own My orders lets the user add to Cart and actually print.
  - **Issued** — read-only, historical.
- Empty state: a short message when there are no orders at all (mirrors the
  kiosk's `noOrdersAwaitingPrint`).

### Navigation

- "Pay now" on a **created** order → simulated payment, transitions it to
  **paid** in place (no navigation away).
- **Paid** and **issued** rows have no portal-side action — paid orders are
  acted on at the kiosk (add to Cart, print); issued orders are historical.
  If a further action is wanted here later (cancel, request refund,
  reorder), that's unconfirmed and out of scope for this pass.

## Account information (bonus fourth screen)

Not one of the three originally requested, included because it's nearly
free: `portal/account.html`'s existing change-password and delete-account
forms, moved into the shared shell's content area under the
`portal-nav-account-info` destination. No functional change from what's
already built and working.

## Decision log (this discovery pass, 2026-08-12)

Resolved via product-owner clarification against the supplied wireframes:

- File format/retention/quota notice on My files: **real rules needed,
  values are test/draft and must be env-var config, not hardcoded** — see
  "New backend rules" above.
- Sidebar items outside this pass's three screens (Invoices, My promo
  codes, Payment methods): **shown disabled/"coming soon"**; Account
  information is the one exception, shown **enabled** since it's already
  built.
- Folders on My files: **kept** — the wireframe's flat list was an example,
  not a decision to drop folder support.
- Order status: **all three states confirmed needed now** — created
  (awaiting payment), paid (awaiting fulfillment), issued. "Issued" is
  **automatic** on real print-task success, not a manual confirmation step
  — see `docs/personal-account-requirements.md`, "Order status lifecycle."

Assumptions made without an explicit product-owner answer (flag if wrong):

- `EXIT` logs out and returns to the login form.
- The Start screen's promo/content block ships empty for this pass (see
  "Content/promo block — open item" above).
- My orders' layout/fields (no wireframe was supplied for it).
- The "Configure & pay" → "Save" / "Pay now" split on My files (see that
  section above) — a specific design call to make the "created, awaiting
  payment" state reachable, not itself wireframed or confirmed.

## Accessibility

Unlike the kiosk (an unattended touchscreen terminal with its own, narrower
accessibility rules — `docs/screens/welcome-screen-spec.md`), the portal is
an ordinary web page on the user's own device. Standard web expectations
apply (keyboard navigation, sensible focus order, form labels) — none of
this is new or unconfirmed, it just hasn't been a focus of the current
plain/unstyled implementation. No portal-specific accessibility requirements
beyond that have been confirmed.

## Notes for implementation

- The shared shell (header + sidebar) is the natural point to introduce
  actual shared components for the portal, which has none today
  (`portal/portal.css` is deliberately plain, no component library) — two
  real consumers now exist (this shell is reused by 4 destinations), so
  extraction is warranted per this project's usual rule
  (`docs/implementation/project-architecture.md`, Section 9), not
  speculative.
- Single-page content swapping (no reload between sidebar destinations)
  is recommended for a coherent shell experience, but each of
  `files.html`/`account.html` etc. currently exist as separate static HTML
  entry points (`vite.config.ts`'s multi-page build). Reconciling these —
  one shell page with client-side view switching vs. keeping separate HTML
  entry points that each render the same shell — is an implementation
  decision, not specified further here.
- Colors, typography, and exact spacing are not confirmed (same caveat as
  every kiosk screen spec) — the wireframes are structural only.
- File format/retention/quota: implement as env-var config (see "New
  backend rules") — do not hardcode the wireframe's draft numbers.
- Order status lifecycle (`docs/personal-account-requirements.md`) needs,
  at minimum: a real `status` on `printOrders` (or equivalent derived from
  `paymentOrders`), splitting `POST /api/accounts/orders` into
  create/pay steps, and a new FK from `printTasks` back to the `printOrders`
  row it printed so a real or simulated print success can drive the
  paid → issued transition. This is a real schema/route change, not just
  new UI — size accordingly.
