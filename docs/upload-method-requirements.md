# Upload Method Selection Screen — Confirmed Requirements

Internal project document. Consolidates the requirements confirmed with the product owner during discovery for the second screen of the Print flow, opened when the user activates `service-print` on the Welcome Screen. This document defines requirements only — no visual design, spec, or wireframe exists yet.

Card titles and the instructional header text below are given in English, since the current milestone's interface language is English only (confirmed in `docs/welcome-screen-requirements.md`); they are direct translations of the Russian working titles agreed with the product owner during discovery, not new copy decisions.

## Purpose

Lets the user choose exactly one route for providing a document to print. This is a method-selection screen, not a multi-select form and not a form with a confirmation step — activating a method immediately proceeds.

## Screen purpose and entry state

- Always opens in the same neutral state; no method is ever preselected, regardless of how the user arrived (including account/session context).
- Displays an instructional header text: "Select how you'd like to upload your document for printing" (translation of the confirmed Russian text; exact final wording may still be adjusted during copywriting).
- Does not display any order/session information (e.g., session ID, which service was chosen).

## Confirmed upload methods

Six methods, all shown on this screen:

1. **QR code** — the user scans a QR code; a mobile upload portal opens on their phone.
2. **Email** — the kiosk assigns a unique, dynamically generated temporary email address for the session (not a fixed pool of mailboxes); see `docs/email-upload-requirements.md` for the confirmed mechanism and remaining open items.
3. **Telegram** — the user sends the document via a Telegram bot. Bot connection and file-receipt behavior are not yet defined.
4. **Personal account** — the user may keep prepared documents/folders in a personal account and manage their deletion. Authentication and storage rules are not yet defined.
5. **Web page** — the user accesses an internet page and obtains a document from it. URL entry, browsing restrictions, downloads, and security rules are not yet defined.
6. **USB drive** — must remain visible; the product owner currently considers it undesirable but has not rejected it. Hardware availability, file-system access, and security rules are not yet defined.

## Temporary display scope

While only QR, Email, and Personal account are being actively developed, the other three confirmed methods (Telegram, Web page, USB drive) are temporarily not rendered on this screen — this is a display-only decision, not a reversal of the six confirmed methods above. Their placeholder code (`handleMethodActivate`, the cards themselves) stays in the codebase behind a single flag (`SHOW_UNBUILT_METHODS` in `UploadMethodSelectionScreen.tsx`) so they can be brought back with a one-line change once work on them starts. While hidden, the grid naturally shows a single row of three cards instead of the eventual 3×2 layout.

## Method availability and status

- All six methods are `available` (visible and clickable) in this milestone — none are `coming-soon` or disabled at the screen level, since the method-specific screens will be built next.
- Reaching this screen implies the Print service's supporting infrastructure (printer, payment terminal, network) is already functional — this is gated entirely upstream, by `service-print`'s status on the Welcome Screen. This screen does not implement its own general availability check for the six methods.
- Reaching this screen also implies an active Kiosk Session already exists (created by `service-print`, per `docs/domain/kiosk-session.md`) — this screen does not create or check for a session itself.
- Internet gating is intentional and global, not screen-specific: if internet connectivity is unavailable, the Print service cannot be initiated from the Welcome Screen at all, because completing the Print flow always requires payment, and payment requires connectivity — there is no useful, complete Print flow without internet access. Consequently, this screen does not need to provide an offline exception for USB; USB remains one of the six selectable methods on the same footing as the other five whenever the Print flow itself is available, not a special "works without internet" fallback.
- Exception: once real hardware integration exists, USB may show a localized "method temporarily unavailable" message if activated while genuinely unavailable (see "Error and degraded states" below). For the current prototype milestone, USB behaves exactly like the other five methods — simply clickable, no real hardware check.
- No status badges (e.g., "Coming soon") are shown on any of the six cards.

## Method names and descriptions

- Confirmed card titles and supporting descriptions:

| Method | Title            | Supporting description |
| ------ | ---------------- | ---------------------- |
| 1      | QR code          | "Use your phone"       |
| 2      | Email            | "Send your file"       |
| 3      | Telegram         | "Use the bot"          |
| 4      | Personal account | "Your saved files"     |
| 5      | Web page         | "Open online"          |
| 6      | USB drive        | "Connect your drive"   |

- Every card shows both its title and supporting description. The title is the primary label; the description is secondary.
- No longer explanations are added on this screen — method-specific details (e.g., the temporary nature of the email address, saved files in the personal account) remain on each method's own next screen.
- Technical terms (QR, Telegram, browser, USB) are acceptable at this stage; final iconography is a future visual-design decision and may change based on user testing. No icons or additional copy beyond the confirmed title + description are introduced here.
- No method needs a special onboarding warning/hint for unfamiliar technology beyond its confirmed short description.
- Each card shows a marker (e.g., a star) if that method has been used at least once during the current Kiosk Session — so the user does not lose track of where they already uploaded something. The marker persists for the whole session and does not disappear once an order is printed. Exact visual treatment: To be defined.
  - **QR / Email (confirmed, revised):** counts as used as soon as files have arrived/been received this session — not only once something from them has reached Cart — so the user does not lose track of files still sitting unprocessed. Originally "added to Cart at least once"; revised after real QR testing surfaced the gap.
  - **Exception — Personal account:** unlike QR/Email, still requires having added something to Cart at least once (not merely being logged in — the account's existing files aren't "arrivals" the way uploads are) _and_ still being logged in. Logging out makes those files unreachable again, so the marker would be misleading if it stayed lit; it reappears on its own once logged back in (docs/personal-account-requirements.md, "Kiosk-side login").

## Interaction and navigation

- One tap on an available method immediately proceeds to the next step — no intermediate "selected" state and no confirmation step for any of the six methods.
- There is no Continue button (method-selection screen, not a multi-select form).
- Repeated rapid taps on a card must be ignored once activation/navigation has begun, to prevent duplicate navigation.
- No loading state is needed between activation and the next screen — the transition is expected to be effectively instantaneous.
- **Back**: a standalone action (not part of the persistent footer); expected to behave consistently across all future flow screens at the requirements level. Always returns directly to the Welcome Screen.
- **Home**: a second, distinct standalone action, also present on this screen (and expected on most later flow screens): jumps directly to the Welcome Screen. On this specific screen, Home and Back reach the same destination, but they are confirmed as separate actions, not one relabeled as the other, since later screens may have Back return somewhere other than Welcome while Home always returns to Welcome directly.
- No separate Reset action on this screen — Reset is introduced later, on screens with real in-progress work (e.g., an uploaded file).
- Nothing needs to be explicitly cleared on Back, since this screen holds no state of its own.
- **Open item for later, method-specific screens** (not part of this screen's own behavior): if the user has already uploaded a file on a method-specific screen and then presses Back, a warning must appear confirming that the uploaded file(s) will be discarded. This screen itself always opens in a neutral state when no file has been uploaded yet.

## Persistent footer and End Session

- The same footer controls as the Welcome Screen remain visible and interactive: Call Operator, Help, Tariffs, Account, Cart, Language — in the same left/right grouping and order.
- Opening any footer popup does not interrupt or reset the method-selection state of this screen.
- After using the Account, Cart, or Language popup, the user remains on this same screen.
- "Finish and clear data" (End Session) is also shown here, since a Kiosk Session already exists by the time this screen is reached — see `docs/domain/kiosk-session.md`.
- This screen's own requirements do not define footer behavior beyond the above — footer design/behavior itself is out of scope here.

## Personal account context

- The "Personal account" card looks and behaves identically regardless of login state: no visual change, no label change, and no display of the user's name/account state on this screen.
- Login, if required, happens on the next (personal-account-specific) screen — not gated on this screen.

## Error and degraded states

- General infrastructure gating (printer, payment terminal, network) happens entirely at the Welcome Screen level; this screen does not re-check or re-gate anything on entry.
- If connectivity is lost (internet, printer, or payment terminal) after the user has already entered the flow (on this or a later screen), a system popup appears, following the same confirmed pattern as the Welcome Screen's hardware-unavailable `Notification`: closable, dismissing it does not restore availability, and Call Operator/Help/Login remain accessible throughout.
- USB unavailability (once real hardware checking exists) is a localized, per-card message ("method temporarily unavailable") shown only when the user activates that specific card — it does not affect the other five methods and does not block entry to this screen. For the current prototype milestone, USB has no real hardware check and behaves like the other five methods.

## Idle/session behavior

- The confirmed in-flow inactivity rule applies unchanged: a 1-minute warning appears after 5 minutes of inactivity, followed by a session reset.
- Nothing on this screen would be lost by a reset, since it holds no state.
- A session reset — from this screen or any other screen in the flow — returns the kiosk not merely to the Welcome Screen's neutral state, but all the way to its idle (low-power/screen-off) state, consistent with the session being fully abandoned.
- Any active login session is cleared as part of this same reset.

## Accessibility and physical interaction

- All six method cards must fit on the screen without scrolling.
- The screen must work equally with touch, mouse, and keyboard, per the same confirmed requirement as the Welcome Screen.
- Each card requires a visible text label in addition to any future icon — no icon-only cards, consistent with the Welcome Screen's service cards.
- No USB physical-location hint is needed on this screen; it may belong to the USB-specific screen later.

## Scope boundaries

Explicitly out of scope for this screen's requirements — these belong to later, method-specific screens: QR generation, the mobile upload portal, temporary mailbox allocation/polling/cleanup, Telegram bot integration, personal-account authentication and file storage, web browser implementation, USB file access, file validation, document preview, upload progress or received-file status, print settings, and payment.

This screen does not contain any document preview, upload-progress indicator, or received-file status — it only selects a method.

## Open items for future screens

Tracked here for later work, not part of this screen's own specification:

- The discard-warning confirmation when returning via Back from a method-specific screen after a file has already been uploaded.
- The real hardware-availability check for USB (and its resulting "method temporarily unavailable" message) — deferred until hardware integration exists.
- Exact copy for the system "connection lost" popup — behavior pattern confirmed (reuses `Notification`), wording not yet drafted.
