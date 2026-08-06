# Kiosk Session — Domain Model

Internal project document. Canonical definition of the Kiosk Session domain concept, confirmed with the product owner across a structured discovery process. This document defines the conceptual domain model — it is intentionally **not** a closed database schema. Attributes and relationships are expected to grow as later screens and flows are specified; nothing here should be read as an exhaustive, final field list.

A Kiosk Session represents one person's active use of the kiosk. It is distinct from: authentication credentials, personal-account data, the currently visible screen, a print order, a payment, a print job, and an external resource reservation. A session may be anonymous or associated with an authenticated personal account.

---

## Session-start triggers

A Kiosk Session starts on either of two triggers:

- **Trigger A — service selection.** The user activates a top-level service on the Welcome Screen (Print, Scan, or Copy). The session starts immediately before entering that service's flow — unless an authenticated session already exists, in which case it is reused, not duplicated. For the currently implemented Print path: `service-print` → create an anonymous Kiosk Session (if none exists) → open the Upload Method Selection Screen.
- **Trigger B — successful login.** Successful authentication from the Welcome Screen creates a Kiosk Session if none currently exists, and associates it with the authenticated account. The user remains on the Welcome Screen, which is now part of the active session. Opening the Login popup does **not** start a session — only successful authentication does. Choosing a service afterward reuses this same session; it never creates a second one.

Session creation is optimistic/instant on the client: activating `service-print` navigates to the Upload Method Selection Screen immediately, while the session-creation request completes in the background. If creation fails, the failure surfaces later, at the point the user attempts something that genuinely requires the session (e.g., selecting an upload method) — not as an immediate blocking step after the button press.

## Session scope and cardinality

- A single session may span **multiple top-level services** — e.g., a user can order a Scan and a Print within the same session and pay for both in one transaction.
- A session may accumulate **multiple orders** before paying, via its Cart (see "Related entities" below): the user can return and add further documents repeatedly before checking out — this is the Cart's purpose, and reduces payment-abandonment risk compared to paying per document.
- Orders in the same cart may come from **any upload method**, and from **different services**, in any combination.
- An authenticated user can return to the Welcome Screen and start another top-level service without ending the session.

## One active session per kiosk

Only one Kiosk Session may be active on a kiosk at a time. A new user must never inherit: login state, selected service, selected upload method, temporary files, email reservations, QR tokens, Telegram resources, downloaded files, previews, print settings, payment state, or any other session-owned temporary data from a previous session.

## Minimum session attributes

Canonical session-level attributes, kept deliberately minimal:

- `sessionId`
- `kioskId`
- `accountId` (nullable — set when login occurs, at any point during the session)
- `startedVia` (e.g., `service-print` / `service-scan` / `service-copy` / `login` — a historical fact about how the session began, for future logging/analysis)
- `startedAt`
- `lastActivityAt` (drives the inactivity timeout — see below)
- `status` (see "Lifecycle")

**Explicitly not session-level attributes**, and why:

- ~~`selectedService`~~ — a session can span multiple services at once, so "the selected service" is a property of an individual order (Print Order / Scan Order), not of the session as a whole.
- ~~`selectedUploadMethod`~~ — the same reasoning: different orders in one session can come from different upload methods.
- ~~`currentScreen`~~ — this is UI-layer navigation state, not part of the session's canonical domain data.
- Whether the session "owns resources" and its cleanup status are **not** stored session fields either — see "Lifecycle" below.

## Lifecycle

Confirmed statuses: `active` → `ending` → `ended` (or `cleanup-failed`).

- **`active`** — normal use.
- **`ending`** — end has been triggered (manually or by timeout); cleanup is in progress.
- **`ended`** — cleanup completed successfully. Carries an `endedReason` attribute (`manual` or `timeout`) rather than a separate lifecycle state — this keeps the state list small while still letting logs distinguish how a session ended.
- **`cleanup-failed`** — cleanup did not complete successfully; the operator is alerted (see "Privacy guarantee").

No separate `starting` state exists, since session creation is instant/optimistic (see "Session-start triggers"). No separate `expired` state exists; a timeout-ended session is simply `ended` with `endedReason: timeout`.

**Resource presence is a derived property, not a stored field.** Whether a session "has resources" (reserved mailbox, cart items, etc.) is determined by checking whether any resource record (order, reservation, etc.) currently references the session's ID — it is never stored redundantly on the session itself, avoiding a state that could drift out of sync with reality.

## Back, Cancel, and End Session are three distinct concepts

- **Back** — navigates to the preceding approved screen. Does not end the session. Preserves session-owned data unless a specific screen rule requires confirmation or cleanup.
- **A narrower "Cancel" action** exists on specific screens for specific in-progress work — e.g., **Cancel Payment** on the Payment Status screen cancels only the current payment attempt: the Print/Scan Orders that were part of it revert to `awaiting payment` and return to the cart, and the Payment Order itself is marked `cancelled by client`. This is **not** the same action as ending the whole session.
- On the Payment Status screen specifically, `navigation-back` and `navigation-home` both remain visible, but activating either triggers the **same confirmation popup** as the explicit Cancel Payment action ("Are you sure you want to cancel this order?") — three different-looking triggers unify into one confirmed action.
- **End Session** ("Finish and clear data") abandons the entire current kiosk use: it initiates cleanup of session-owned temporary data and resources, logs out an authenticated user, prevents the next user from accessing the previous user's information, and returns the kiosk to its waiting/idle state.

On screens with no meaningful "back" destination:

- **Print Status** has no Back action (or it is disabled) — this screen is fully system-controlled; the persistent footer (operator/help/tariffs/language/account) remains accessible regardless.
- **Finalising session**'s Back action leads to the Welcome Screen — the same destination as Home — in case the user wants to print something else.

## Manual End Session ("Finish and clear data")

- **Label:** "Finish and clear data" — one universal label, used identically regardless of session state (anonymous/authenticated, empty/non-empty). No copy variation by state.
- **Visibility:** available on every screen belonging to an active Kiosk Session — including the Welcome Screen whenever a session is active (logged in, or anonymous-but-active after a Back navigation), Upload Method Selection, all method-specific upload screens, file/print configuration, preview, payment, and printing/status screens (subject to the restriction below). Not shown on the Welcome Screen when no session is active.
- **Popups never hide it.** A popup (Cart, Help, Login, etc.) must not cover the header, footer, or even the background of the working screen — it must be visually unambiguous that it is a popup on top of the current screen. The footer, including End Session, therefore remains visible and usable while any popup is open.
- **Blocked during a committed transaction.** End Session is unavailable from the moment payment begins until either the order has been delivered to the client, or a failure has been registered and manually resolved to a final status by an operator. Interrupting a real financial transaction mid-flight is not permitted.
- **Confirmation rule:** a genuinely empty session (nothing would be lost) ends immediately with no dialog. Any non-empty session (an unconfirmed resource like a reservation, or unpaid cart items) shows the **same generic confirmation dialog** every time — the message does not enumerate what specifically will be discarded. Declining the confirmation leaves the session completely unaffected.
- **User-visible sequence:** on confirmation, an "ending session" indicator screen is shown while cleanup runs; only after cleanup completes does the kiosk transition to its initial idle state, from which a new session can begin. If another user touches the kiosk while this is still in progress, they see the same "ending" screen — the process is expected to be short.

## Automatic timeout

- The confirmed in-flow rule: after a period of inactivity, show a 1-minute warning; if inactivity continues, end the session automatically, using the same cleanup contract as manual ending.
- This same rule applies uniformly to **every** screen, including the Welcome Screen when it has an active session — there is no separate, screen-specific inactivity rule. (Note: a screen's own display power-saving/dimming behavior is a separate, unrelated concern from session-inactivity timeout — the two were previously conflated in earlier drafts and should be kept distinct when the Welcome Screen documentation is revised.)
- **What counts as "activity":** inactivity means no activity from _either_ the user _or_ the system. Direct user input (touch/mouse/keyboard) counts, but so does the system actively doing something on the session's behalf — processing a large file, printing, waiting on a backend job, or an external event arriving (e.g., a new email landing in the session's mailbox). As long as either side is doing something, the timer does not fire.
- **Operator calls** pause the inactivity timer for their duration and resume it once the call ends. The exact mechanism for detecting when a call starts/ends is not yet decided — it depends on whether operator communication ends up being an external application or an internal messenger. Flagged as an open item.

## File scanning status

- Every file received for printing — regardless of upload method (Email, QR, Personal account, etc.) — passes through the same antivirus-scanning step before it can be used, confirming and generalizing the antivirus-scanning mention under "Login relationship" below to all methods, not only Personal account.
- While a file is scanning, it is visible in whatever received-files list its upload method shows (e.g., Email's attachment list, QR's file list), but is not yet selectable — it becomes selectable once scanning completes.
- **Implemented for QR** (the only method with a real backend so far — see `docs/qr-upload-requirements.md`) via a real local ClamAV (`clamd`), not a timer — confirming the "fast in practice" expectation this section always assumed. Email's scanning remains a mock timer, since Email has no real backend yet.
- **Confirmed: behavior when a file actually fails the scan (threat detected).** The file is deleted from disk immediately (not deferred to session end) — consistent with this document's "delete the file content, retain the metadata/fact" cleanup principle (see "Resource ownership and cleanup contract" below), just applied right away since there's no reason to keep a flagged file around any longer than necessary. Its record stays in the received-files list with a `'rejected'` status, shown to the user as a clearly blocked, non-selectable entry — not silently removed, so the user isn't left wondering whether their upload got stuck.
- **Dev-only fail-open; production fails closed (both implemented, gated on `NODE_ENV`):** if the scan engine itself is unreachable (e.g. a developer forgot to start `clamd`), behavior now depends on environment (`server/uploadStore.ts`'s `scanFile()`). In dev (`NODE_ENV` unset), the failure is logged server-side and the file is let through as `'ready'` — a deliberate convenience so a developer without `clamd` running isn't blocked from testing every other upload path. With `NODE_ENV=production` (see `README.md`, "Deploying to Railway"), the file is instead deleted immediately, same as a confirmed-infected file, but recorded with a distinct `'scan-unavailable'` status rather than `'rejected'` — this is "couldn't verify," not "confirmed a threat," so the kiosk shows a different message ("Removed — virus scan unavailable. Please try again later.") rather than implying a detected virus.

## File format and size limits

- **Confirmed, shared across every upload method** (QR, Email, and any future method) — one common rule, not a per-method decision, kept simple to support and explain to users.
- **Accepted formats:** PDF, DOC, DOCX, JPG/JPEG, PNG, HEIC. Deliberately not narrowed to just PDF at this stage even though every accepted format is later converted to PDF before preview (see `docs/email-upload-requirements.md`, "Automatic format conversion") — extending the list later is a one-line change, so there is no real cost to starting broad, and users should be able to bring what they actually have (phone photos, office documents) from day one. HEIC is included specifically because it's the default photo format on iPhone, and QR upload is phone-centric.
- **Max file size:** 20 MB per file.
- **Where the rejection is shown, per method:** QR (the one method with a real backend as of this revision — see `docs/qr-upload-requirements.md`) rejects and shows the error directly on the phone's own upload page, since the kiosk controls that page and the user is still right there to pick a different file. Email can only react after a message arrives (there's no way to intercept a generic email client's own UI) — same "popup error" pattern already described in `docs/email-upload-requirements.md`, "Automatic format conversion" — but this is not yet implemented, since the Email flow itself has no real backend yet.
- Distinct from the antivirus-scanning step above: this is a format/size allowlist check at the moment a file is received, not a security scan — a file can pass this check and still fail scanning, or vice versa is not possible (format is checked first, before a file is even accepted for scanning).

## Login relationship

- A user can log out of their account **without** ending the kiosk session: this is a separate, narrower action from End Session. The session's `accountId` is reset (the session becomes anonymous again), while a log entry records the fact and moment of the logout, for future analysis.
- Files selected for printing from a personal account are **copied into temporary session storage and antivirus-scanned**, exactly like files from any other upload method — this keeps a single, unified ingestion pipeline regardless of source, guarantees a stable snapshot for the print job, and re-checks files against current threats regardless of how long they've sat in the account.
- Ending a session removes only these temporary copies — original files in the user's personal account are never touched.
- Authentication is expected to be kept transparently alive (e.g., via silent token refresh) for as long as the Kiosk Session itself is active; this should not force any visible logout on its own. Only if the underlying refresh mechanism itself fails (account deactivated, credentials changed elsewhere, etc.) does a genuine "stale login" edge case arise — this rare case is deferred, not designed for now.

## Resource ownership and cleanup contract

A session can exist before it owns any resources (e.g., an authenticated user on the Welcome Screen, or an anonymous user who just reached Upload Method Selection). Session existence must never be inferred only from whether files exist.

**Deleted on session end** (the underlying content, not merely deactivated):

- Temporary files (uploaded originals and generated PDF conversions).
- Generated previews.
- Temporary print-setting content (as data, distinct from the historical fact that an order existed — see below).
- QR and Telegram tokens (invalidated).
- The session's email address reservation is not "released" in the pool sense — there is no fixed pool (see `docs/email-upload-requirements.md`). Mail arriving at a session's address **after** the session has ended is simply ignored by the system.

**Retained** (as a log/audit record, without the underlying file content):

- Financial/payment records (amount, timestamp, status).
- The fact that a print/scan order existed (what, when, via which method) — needed for audit and for the future session-logging/failure-analysis work the product owner intends to build.
- Session lifecycle events (created, ended, cleanup-failed).

**Guiding principle: delete the file content; retain the metadata/fact of the transaction.**

**Timing:** deletion is immediate and synchronous — it completes before the kiosk transitions from the "ending session" indicator to the idle state, not deferred to run in the background afterward.

## Privacy guarantee

The real privacy guarantee is **not** the timing of physical deletion — it is that the interface only ever displays data scoped to the _current_ session's ID. Even in a `cleanup-failed` case, the next user is not shown any warning: they are already logged out and have no way to reach a previous session's data through the kiosk's own interface, since a client has no direct filesystem access and every screen queries "data for session X," never "whatever is on disk." A cleanup failure results in an internal operator alert, not a user-facing message.

## Failure and recovery

- **Safe default, no special "smart recovery" logic:** on a frontend crash, app restart, or kiosk reboot, the system does not attempt to specially reconstruct the exact prior screen state. Instead, the existing inactivity-timeout mechanism already produces the correct behavior on its own: if the interruption was brief (shorter than the warning threshold), the backend session was never told to end and is still legitimately active — reconnecting to it is simply a continuation, not a special "restore" feature. If the interruption was long, the timeout has already correctly ended and cleaned up the session by the time the kiosk comes back, so there is nothing to recover.
- To make the brief-interruption case work, **`sessionId` is persisted locally** (not held only in transient in-memory state), so it survives a short crash/restart. **The Cart is persisted alongside it** — losing an in-progress order to an accidental reload/crash is real lost work, worth avoiding even though nothing else about "smart recovery" changes: `screen` itself is still not restored, so a reload always lands back on the Welcome Screen, just with the session and cart intact rather than empty.
- Network loss or backend outage mid-session (outside the payment/print critical window) reuses the already-confirmed `Notification` popup pattern ("connection lost" — closable, does not restore connectivity itself, footer/operator-call remain accessible) consistently across every screen.
- **What connection loss actually blocks:** only the payment and print commit actions themselves (they genuinely require the payment terminal/printer). Browsing, configuring, and adding/editing/removing Cart items all keep working normally, since connectivity may return quickly and there's no reason to stop the user from getting files ready in the meantime.
- **Persistence of the "lost" state:** dismissing the notification popup only hides it — the underlying blocked state continues, and the popup reappears every 30 seconds as a reminder for as long as the condition persists. In this prototype, restoring connectivity is a manual action (no real network/hardware monitoring exists yet); a real implementation would flip this automatically once the underlying check succeeds again.
- "Stale login" (the refresh mechanism itself failing) is deferred as a rare edge case, not designed for now.

## Related entities (introduced here, not fully specified)

The confirmed process references the following entities. This document does not define their full field lists or lifecycle states — only enough to establish how they relate to the Kiosk Session. Each deserves its own future domain/requirements treatment.

- **Cart** — session-scoped; displays only orders currently in an "awaiting payment" state; presented as a popup/overlay rather than a full-screen navigation, so the user can keep adding documents without losing their place. Each item can be individually selected (checked) for the current payment, have its quantity adjusted, or be removed entirely — see `docs/cart-requirements.md` for the full field-level behavior.
- **Print Order** — created when the user confirms print settings for a file; kept separate from Scan Order because execution differs (a Print Order leads to a Print Task sent to a physical printer). Carries a `quantity` (number of copies of the configured document) that linearly multiplies price — see `docs/cart-requirements.md`.
- **Scan Order** — created _after_ scanning happens (the reverse order compared to Print); leads to a Scan Task, which delivers a digital file to the user rather than producing a physical printout.
- **Payment Order** — created from a user-selected subset of cart items; tracks its own status (e.g., ready for payment, paid, cancelled by client) independent of the individual orders it covers.
- **Print Task / Scan Task** — the execution unit that actually drives the physical printer or the digital-delivery step, respectively. Basic Print Task submission and status tracking is implemented for real (`server/printerAdapter.ts`, `printTasks` table) — job submission itself is real, but a plain OS print API gives no reliable in-progress signal (jam, out of paper/ink), so those outcomes are still driven manually via "Simulate ..." actions on Print Status, same underlying record either way. Deliberately independent of the still-mocked Cart/Print Order/Payment pipeline.

## Open items

- Exact mechanism for detecting the start/end of an operator call (external application vs. internal messenger) — affects how the inactivity timer pauses/resumes around it.
- The "stale login" edge case (refresh mechanism itself failing mid-session).
- The exact trigger condition for the "used this session" marker on Upload Method Selection cards is confirmed for now (persists for the whole session, does not disappear after printing) but is intentionally designed to be easy to swap for a "still has unprocessed items" rule later, based on observed user behavior.
- Full field-level definitions for Scan Order, Payment Order, Print Task, and Scan Task (Cart and Print Order are now covered by `docs/cart-requirements.md`).
- Checking real resource availability (paper/ink remaining) before sending a Print Task to the physical printer — deferred until a real hardware agent exists; most printers don't expose reliable per-sheet/per-page remaining counts, so the feasibility of this check at all is unconfirmed, not just its implementation.
- Future pricing logic beyond linear (price × quantity) — e.g. volume discounts, promo codes, promotions — not designed for now. Full mechanics deferred to a future dedicated tariffication discovery, but early directional decisions already confirmed, to seed that discovery rather than being lost:
  - Promotions, promo codes, and volume discounts are all expected to be able to stack, though promotions/promo codes individually may carry their own restrictions (exact rules not yet designed).
  - Calculation order when they do stack: promotion applied to the base price first, then promo code applied to that result.
  - Promotions and promo codes may be local to a specific kiosk/terminal, not necessarily global across every kiosk.
  - An already-paid order is never recalculated retroactively if a promotion changes after payment. Any additional quantity added on top of a paid order (see `docs/personal-account-requirements.md`, "Paid orders awaiting print") is priced fresh from the current base tariff (and whatever promotions/codes currently apply to it) — the original paid portion and the new portion are priced independently, not reconciled against each other.
