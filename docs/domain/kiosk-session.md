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
- To make the brief-interruption case work, **`sessionId` is persisted locally** (not held only in transient in-memory state), so it survives a short crash/restart.
- Network loss or backend outage mid-session (outside the payment/print critical window) reuses the already-confirmed `Notification` popup pattern ("connection lost" — closable, does not restore connectivity itself, footer/operator-call remain accessible) consistently across every screen.
- "Stale login" (the refresh mechanism itself failing) is deferred as a rare edge case, not designed for now.

## Related entities (introduced here, not fully specified)

The confirmed process references the following entities. This document does not define their full field lists or lifecycle states — only enough to establish how they relate to the Kiosk Session. Each deserves its own future domain/requirements treatment.

- **Cart** — session-scoped; displays only orders currently in an "awaiting payment" state; presented as a popup/overlay rather than a full-screen navigation, so the user can keep adding documents without losing their place.
- **Print Order** — created when the user confirms print settings for a file; kept separate from Scan Order because execution differs (a Print Order leads to a Print Task sent to a physical printer).
- **Scan Order** — created _after_ scanning happens (the reverse order compared to Print); leads to a Scan Task, which delivers a digital file to the user rather than producing a physical printout.
- **Payment Order** — created from a user-selected subset of cart items; tracks its own status (e.g., ready for payment, paid, cancelled by client) independent of the individual orders it covers.
- **Print Task / Scan Task** — the execution unit that actually drives the physical printer or the digital-delivery step, respectively.

## Open items

- Exact mechanism for detecting the start/end of an operator call (external application vs. internal messenger) — affects how the inactivity timer pauses/resumes around it.
- The "stale login" edge case (refresh mechanism itself failing mid-session).
- The exact trigger condition for the "used this session" marker on Upload Method Selection cards is confirmed for now (persists for the whole session, does not disappear after printing) but is intentionally designed to be easy to swap for a "still has unprocessed items" rule later, based on observed user behavior.
- Full field-level definitions for Cart, Print Order, Scan Order, Payment Order, Print Task, and Scan Task.
