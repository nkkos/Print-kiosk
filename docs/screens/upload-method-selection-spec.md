# Purpose

The Upload Method Selection Screen is the second screen of the confirmed Print flow. It opens when the user activates `service-print` on the Welcome Screen and lets the user choose exactly one of six confirmed methods for providing a document to print. It is a method-selection screen, not a multi-select form — activating a method immediately proceeds to that method's own next step, with no intermediate "selected" state and no confirmation step.

# Layout

Top to bottom, as confirmed:

- **Header area:** Reuses the Welcome Screen's header — `BrandMark` top-left, and "Finish and clear data" (End Session) top-right, shown since a Kiosk Session already exists by the time this screen is reached (see `docs/domain/kiosk-session.md`). **Revised:** the `PromoAction` slot previously reserved top-right no longer exists as a layout element — a promotion, if active, is presented as a popup at session start instead, not as a persistent header icon on this or any screen.
- **Instructional text:** A header/instructional line above the method cards: "Select how you'd like to upload your document for printing" (confirmed working copy; exact final wording may still be adjusted during copywriting).
- **Main content:** Six upload-method cards, all fitting on the screen without scrolling, rendered as instances of the reusable `OptionCard` component (UI Component Library, Section 17) — not `ServiceCard` (reserved for the kiosk's core services: Print, Scan, Copy) and not the generic `Button` component. All six render at equal size; none is visually dominant.
  - `upload-method-qr` — QR code
  - `upload-method-email` — Email
  - `upload-method-telegram` — Telegram
  - `upload-method-account` — Personal account
  - `upload-method-web` — Web page
  - `upload-method-usb` — USB drive

  Each card shows a marker (e.g., a star) if that method has been used at least once during the current Kiosk Session (see `docs/upload-method-requirements.md`). Exact visual treatment: To be defined.

- **Back and Home actions:** Two standalone actions, not part of the persistent footer — `navigation-back` and `navigation-home` (see Interactive elements). Exact visual placement: To be defined — the Requirements confirm only that they must behave consistently across future flow screens, not where they sit. On this screen both reach the same destination (Welcome Screen), but they are confirmed as distinct actions, not one relabeled as the other.
- **Footer (persistent across screens), split into two groups** — identical to the Welcome Screen:
  - Left group (reference/support actions): Call-operator button, Help button, Tariffs/pricing info button.
  - Right group (user-specific actions): Personal account button, Cart icon, Language switch control.

Safe margins: To be defined.

Spacing principles: To be defined.

Grid arrangement for the six cards (rows/columns): To be defined — the Requirements confirm only that all six must fit without scrolling, not a specific arrangement.

# Interactive elements

| Identifier                     | Purpose                                                                                                      | Default state                                     | Enabled/disabled                                                       | Action after click                                                                                                 | Future behavior                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upload-method-qr`             | `OptionCard` entry for the QR code upload method                                                             | Visible, `available`                              | Enabled                                                                | Proceeds to the QR code method's own next step                                                                     | None confirmed                                                                                                                                     |
| `upload-method-email`          | `OptionCard` entry for the Email upload method                                                               | Visible, `available`                              | Enabled                                                                | Proceeds to the Email method's own next step                                                                       | None confirmed                                                                                                                                     |
| `upload-method-telegram`       | `OptionCard` entry for the Telegram upload method                                                            | Visible, `available`                              | Enabled                                                                | Proceeds to the Telegram method's own next step                                                                    | None confirmed                                                                                                                                     |
| `upload-method-account`        | `OptionCard` entry for the Personal account upload method                                                    | Visible, `available`                              | Enabled                                                                | Proceeds to the Personal account method's own next step                                                            | None — identical regardless of login state (confirmed)                                                                                             |
| `upload-method-web`            | `OptionCard` entry for the Web page upload method                                                            | Visible, `available`                              | Enabled                                                                | Proceeds to the Web page method's own next step                                                                    | None confirmed                                                                                                                                     |
| `upload-method-usb`            | `OptionCard` entry for the USB drive upload method                                                           | Visible, `available`                              | Enabled                                                                | Proceeds to the USB drive method's own next step                                                                   | May become `unavailable` with a localized "temporarily unavailable" message once real hardware checking exists (see Screen states) — To be defined |
| `navigation-back`              | Returns to the Welcome Screen                                                                                | Visible                                           | Enabled                                                                | Navigates directly to the Welcome Screen                                                                           | None confirmed                                                                                                                                     |
| `navigation-home`              | Jumps directly to the Welcome Screen                                                                         | Visible                                           | Enabled                                                                | Navigates directly to the Welcome Screen (same destination as `navigation-back` on this screen)                    | None confirmed                                                                                                                                     |
| `language-switch`              | Lets the user change the interface language                                                                  | Shows the currently active language               | Enabled                                                                | Opens a temporary Language panel (Modal shell) as a pop-up/overlay on top of the current screen                    | Same as Welcome Screen (see `docs/screens/welcome-screen-spec.md`)                                                                                 |
| `btn-help`                     | Opens help information                                                                                       | Visible                                           | Enabled                                                                | Opens a temporary Help panel (Modal shell) as a pop-up/overlay on top of the current screen                        | None confirmed                                                                                                                                     |
| `btn-tariffs`                  | Shows pricing information                                                                                    | Visible                                           | Enabled                                                                | Opens a temporary Tariffs panel (Modal shell) as a pop-up/overlay on top of the current screen                     | None confirmed                                                                                                                                     |
| `btn-account`                  | Lets the user optionally log into, or view, a personal account                                               | Visible, reflects logged-out state by default     | Enabled                                                                | Opens a temporary Login/Account panel (Modal shell) as a pop-up/overlay on top of the current screen               | Same as Welcome Screen — To be defined                                                                                                             |
| `btn-cart`                     | Opens the session's Cart                                                                                     | Visible                                           | Enabled                                                                | Opens the Cart as a popup/overlay on top of the current screen (see `docs/domain/kiosk-session.md`)                | Same as Welcome Screen — To be defined                                                                                                             |
| `end-session`                  | "Finish and clear data" — ends the active Kiosk Session                                                      | Visible (a session already exists by this screen) | Enabled, except during a committed payment/print transaction           | Immediate end if the session is empty; otherwise shows a confirmation popup, then ends the session                 | None confirmed                                                                                                                                     |
| `btn-call-operator`            | Connects the user with a human operator                                                                      | Visible                                           | Enabled (remains enabled during the connectivity-lost state)           | Launches an external third-party application; the call itself happens outside the kiosk application                | None confirmed                                                                                                                                     |
| `notification-connection-lost` | Informs the user that connectivity (internet/printer/payment terminal) has been lost after entering the flow | Hidden by default                                 | Shown only if connectivity is lost after the user has entered the flow | Presented as a popup with a close button; the user can dismiss it, but dismissing it does not restore connectivity | None confirmed                                                                                                                                     |

# Screen states

- **Normal:** All six upload-method cards are visible and `available`; footer fully accessible; no notification shown.
- **Connectivity lost (mid-flow):** A `notification-connection-lost` popup is shown if internet, printer, or payment-terminal connectivity is lost after the user has already entered the flow. The popup includes a close button; dismissing it does not restore connectivity. `btn-call-operator`, `btn-help`, and `btn-account` remain accessible, and the persistent footer remains present throughout — modeled the same way as the Welcome Screen's hardware-unavailable state (a `Notification` popup, not a blocking `Modal`). General upstream infrastructure gating (printer/payment terminal/network at kiosk startup) is handled entirely by the Welcome Screen and does not recur as a state of this screen.
- **USB card degraded (future):** Once real hardware checking exists, `upload-method-usb` may independently show a "method temporarily unavailable" message when activated while genuinely unavailable. This is localized to that one card and does not affect the other five cards or the screen's `Normal` state. Not implemented for the current prototype milestone — exact presentation To be defined.
- **Personal account card:** `upload-method-account` has no distinct visual or textual state for logged-in vs. logged-out — it looks and behaves identically regardless of login state.
- **Inactivity warning:** After 5 minutes of inactivity on this screen, a 1-minute warning is shown (shared in-flow behavior, same rule as other flow screens). If inactivity continues, the session is abandoned, any active login is cleared, and the flow returns to the Welcome Screen's idle (low-power) state — not merely its neutral awake state.

# Navigation

- Welcome Screen → Upload Method Selection: via `service-print` (confirmed in `docs/screens/welcome-screen-spec.md`).
- `upload-method-qr` / `upload-method-email` / `upload-method-telegram` / `upload-method-account` / `upload-method-web` / `upload-method-usb` → proceeds to that method's own next screen/process. The internal behavior of each method-specific flow is out of scope for this document.
- `navigation-back` → returns directly to the Welcome Screen.
- `navigation-home` → returns directly to the Welcome Screen (same destination as `navigation-back` on this screen).
- `language-switch` → opens a temporary Language panel (Modal shell) as a pop-up/overlay; this screen remains underneath.
- `btn-help` → opens a temporary Help panel (Modal shell) as a pop-up/overlay; this screen remains underneath.
- `btn-tariffs` → opens a temporary Tariffs panel (Modal shell) as a pop-up/overlay; this screen remains underneath.
- `btn-account` → opens a temporary Login/Account panel (Modal shell) as a pop-up/overlay; this screen remains underneath.
- `btn-cart` → opens the Cart as a popup/overlay; this screen remains underneath.
- `btn-call-operator` → leaves the kiosk application to open an external third-party application.
- `end-session` → ends the active Kiosk Session (immediately if empty, otherwise after a confirmation popup) and returns to the Welcome Screen's idle state.
- Session reset (inactivity) → returns to the Welcome Screen's idle state, not merely its neutral awake state.

**Terminology note:** identifiers beginning with `navigation-` represent actions that move the user through the main screen flow. `navigation-back` returns to the preceding approved flow screen; `navigation-home` jumps directly to the Welcome Screen regardless of how many steps deep the user is (confirmed by `docs/domain/kiosk-session.md`). The identifier describes the action's role, not its visual implementation — either may be rendered using the shared `Button` component, `IconButton`, or another approved presentation later; the visual form is not determined by the identifier. Future main-flow navigation actions should follow the same convention where applicable (e.g., `navigation-continue`, `navigation-reset`). Persistent utility actions (`btn-help`, `btn-tariffs`, `btn-account`, `btn-cart`, `btn-call-operator`) and `end-session` are not main-flow navigation and are outside this convention — `end-session` in particular is a session-lifecycle action (see `docs/domain/kiosk-session.md`), not a navigation action.

# Accessibility

- High contrast and strong readability are required.
- Touch targets must be large.
- The interface must support mouse control in addition to touchscreen input.
- Screen-reader and voice support are not required.
- Operator communication (audio/video) is handled by an external third-party application, not by the kiosk application itself.
- All six method cards must fit on the screen without scrolling.
- Each card requires a visible text label (title) in addition to any future icon — no icon-only cards.

# Notes for implementation

- Same reference display target as the Welcome Screen (see `docs/screens/welcome-screen-spec.md`) — landscape, 14.5", 2880×1800, adjustable once real hardware is selected.
- Footer controls are persistent and identical to the Welcome Screen's, grouped left (`btn-call-operator`, `btn-help`, `btn-tariffs`) and right (`btn-account`, `btn-cart`, `language-switch`).
- `end-session` must also remain visible while any popup is open, per `docs/domain/kiosk-session.md` — popups must never cover the header, footer, or the working screen's background.
- See `docs/domain/kiosk-session.md` for the full definition of `end-session`'s behavior and the star-marker concept on the six method cards.
- The six upload-method cards are `OptionCard` instances (UI Component Library, Section 17) — not `ServiceCard` and not the generic `Button` component. Their identifiers are semantic (named after the method, not the presenting component).
- `upload-method-usb`'s real hardware-availability check and its "temporarily unavailable" message are deferred until hardware integration exists (see Requirements, "Open items for future screens").
- `notification-connection-lost`'s exact copy is not yet drafted (see Requirements, "Open items for future screens"); its behavior pattern reuses the Welcome Screen's `Notification` popup exactly.
- The discard-warning confirmation for returning via `navigation-back` from a later, method-specific screen after a file has already been uploaded belongs to those later screens, not to this specification.
- `btn-call-operator` only needs to trigger an external application; no in-app call UI or audio handling is required on this screen.
- Colors, typography, and exact spacing/margin/grid values are not yet defined and are out of scope for this document.

## Prototype modal content (first implementation slice)

Identical to the Welcome Screen — see `docs/screens/welcome-screen-spec.md`, "Prototype modal content (first implementation slice)": the Language, Help, Tariffs, and Login temporary panels are the same shared `Modal`-shell panels, not re-specified per screen.
