# Purpose

The Welcome Screen is the entry point of the kiosk application. It is the idle/attract state of the kiosk and lets an unattended, non-technical user start one of the kiosk's functions (currently only Print is implemented) or access secondary actions (language, help, tariffs, login, operator call) before selecting a function.

# Layout

Top to bottom / corner structure, as confirmed:

- **Header area:**
  - Logo icon, placed at the very extreme top-left corner of the screen.
  - "Finish and clear data" (End Session), placed in the top-right corner of the screen. Shown only while a Kiosk Session is active (see `docs/domain/kiosk-session.md`); not shown otherwise. **Revised:** the promo icon slot previously reserved in this corner has been removed — a promotion, if active, is now presented as a popup at the start of a Kiosk Session instead, and no longer occupies any layout space here.
- **Main content (center of screen):**
  - Three primary service cards, rendered as instances of the reusable `ServiceCard` component (see the UI Component Library), not the generic `Button` component: Print (`service-print`), Scan (`service-scan`), Copy (`service-copy`). All three render at equal size — `service-print` receives no larger or stronger visual treatment than `service-scan`/`service-copy`, consistent with the approved wireframe (Concept A).
- **Footer (persistent across screens), split into two groups:**
  - Left group (reference/support actions): Call-operator button, Help button, Tariffs/pricing info button.
  - Right group (user-specific actions): Personal account button, Cart icon, Language switch control.

Safe margins: To be defined.

Spacing principles: To be defined.

# Interactive elements

| Identifier                         | Purpose                                                                                      | Default state                                                 | Enabled/disabled                                                 | Action after click                                                                                                                           | Future behavior                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `logo-icon`                        | Brand identity placeholder                                                                   | Static icon, no visual design confirmed yet                   | Not interactive (no click behavior confirmed)                    | None confirmed — To be defined                                                                                                               | Visual design/branding to be defined later                                                |
| `end-session`                      | "Finish and clear data" — ends the active Kiosk Session (see `docs/domain/kiosk-session.md`) | Hidden when no session is active; visible when one is active  | Enabled, except during a committed payment/print transaction     | Immediate end if the session is empty; otherwise shows a confirmation popup, then ends the session                                           | None confirmed                                                                            |
| `service-print`                    | `ServiceCard` entry for the Print service                                                    | Visible, `available`                                          | Enabled                                                          | Creates a Kiosk Session if none exists (see `docs/domain/kiosk-session.md`), then navigates to the Upload Method Selection Screen            | Becomes `unavailable` while required printing hardware is unavailable (see Screen states) |
| `service-scan`                     | `ServiceCard` entry for the Scan service                                                     | Visible, marked "coming soon"                                 | Disabled                                                         | None (disabled)                                                                                                                              | Will be enabled once scanning is implemented                                              |
| `service-copy`                     | `ServiceCard` entry for the Copy service                                                     | Visible, marked "coming soon"                                 | Disabled                                                         | None (disabled)                                                                                                                              | Will be enabled once copying is implemented                                               |
| `language-switch`                  | Lets the user change the interface language                                                  | Shows the currently active language (auto-selected per kiosk) | Enabled                                                          | Opens a temporary Language panel (Modal shell) as a pop-up/overlay on top of the current screen                                              | Additional languages (Slovak, German, Russian, Ukrainian) to be added later               |
| `btn-help`                         | Opens help information                                                                       | Visible                                                       | Enabled                                                          | Opens a temporary Help panel (Modal shell) as a pop-up/overlay on top of the current screen                                                  | None confirmed                                                                            |
| `btn-tariffs`                      | Shows pricing information                                                                    | Visible                                                       | Enabled                                                          | Opens a temporary Tariffs panel (Modal shell) as a pop-up/overlay on top of the current screen                                               | None confirmed                                                                            |
| `btn-account`                      | Lets the user optionally log into, or view, a personal account                               | Visible, reflects logged-out state by default                 | Enabled                                                          | Opens a temporary Login/Account panel (Modal shell) as a pop-up/overlay on top of the current screen                                         | Visual change when logged in is not confirmed — To be defined                             |
| `btn-cart`                         | Opens the session's Cart                                                                     | Visible                                                       | Enabled                                                          | Opens the Cart as a popup/overlay on top of the current screen (see `docs/domain/kiosk-session.md`)                                          | Badge/count indicator when non-empty — To be defined                                      |
| `btn-call-operator`                | Connects the user with a human operator                                                      | Visible                                                       | Enabled (remains enabled even in the hardware-unavailable state) | Launches an external third-party application; the call itself happens outside the kiosk application                                          | None confirmed                                                                            |
| `notification-service-unavailable` | Informs the user that a required printing hardware service is unavailable                    | Hidden by default                                             | Shown only when required hardware is unavailable at startup      | Presented as a popup notification with a close button/icon; the user can dismiss it, but dismissing it does not restore service availability | None confirmed                                                                            |

# Screen states

- **Normal:** `service-print` is `available`; `service-scan` and `service-copy` are visible as `coming-soon`; footer fully accessible; no notification shown.
- **Hardware unavailable:** A `notification-service-unavailable` popup is shown, informing the user that a required printing hardware service is unavailable. The popup includes a close button/icon; the user can dismiss it, but dismissing it does not restore service availability. `service-print` becomes `unavailable` while the required printing hardware is unavailable; `service-scan` and `service-copy` remain `coming-soon`, unaffected by this state. `btn-call-operator`, `btn-help`, and `btn-account` remain accessible, and the `PersistentActionBar` remains present throughout. This state is modeled using the `Notification` component in a popup presentation, not a blocking `Modal` — the `PersistentActionBar` is never disabled by it.
- **Logged in:** A Kiosk Session is active, associated with an account via `btn-account` (see `docs/domain/kiosk-session.md`, Trigger B). `end-session` is shown. Exact visual change to `btn-account` when logged in is not confirmed — To be defined.
- **Logged out, no session:** Default state. All functions remain usable anonymously. `end-session` is hidden.
- **Anonymous session active:** A Kiosk Session exists (created via `service-print`, Trigger A) but no account is associated, and the user has returned to this screen (e.g., via Back from Upload Method Selection) without ending it. `end-session` is shown, identical in behavior to the logged-in case.
- **Idle (display power-saving):** Entered after a period with no input and no active Kiosk Session. The screen enters a low-power state (no backlight). Unrelated to session state.
- **Waking from idle:** Triggered by touch input, mouse movement, or a keyboard press. The screen returns to its normal visual state.

# Navigation

- `service-print` (`available`) → creates a Kiosk Session if none exists, then navigates to the Upload Method Selection Screen.
- `service-scan` / `service-copy` (`coming-soon`) → no navigation.
- `language-switch` → opens a temporary Language panel (Modal shell) as a pop-up/overlay; the Welcome Screen remains underneath.
- `btn-help` → opens a temporary Help panel (Modal shell) as a pop-up/overlay; the Welcome Screen remains underneath.
- `btn-tariffs` → opens a temporary Tariffs panel (Modal shell) as a pop-up/overlay; the Welcome Screen remains underneath.
- `btn-account` → opens a temporary Login/Account panel (Modal shell) as a pop-up/overlay; the Welcome Screen remains underneath. Successful login creates a Kiosk Session if none exists yet, or associates it with the account if one is already active (see `docs/domain/kiosk-session.md`).
- `btn-cart` → opens the Cart as a popup/overlay; the Welcome Screen remains underneath.
- `btn-call-operator` → leaves the kiosk application to open an external third-party application.
- `end-session` → ends the active Kiosk Session (immediately if empty, otherwise after a confirmation popup) and returns to this screen's idle state.
- From later stages in the flow, the user can return to the Welcome Screen (confirmed "Back"/"Reset" actions on subsequent screens).
- Idle → waking from idle is a state change on the Welcome Screen itself, not a navigation to a different screen.

# Accessibility

- High contrast and strong readability are required.
- Touch targets must be large.
- The interface must support mouse control in addition to touchscreen input.
- Screen-reader and voice support are not required.
- Operator communication (audio/video) is handled by an external third-party application, not by the kiosk application itself.

# Notes for implementation

- The reference display target is landscape, 14.5", 2880×1800, but the implementation must allow this size/resolution to be changed later when real hardware is selected.
- Footer controls are persistent and must remain present regardless of which pop-up/overlay (if any) is currently open. They are grouped left (`btn-call-operator`, `btn-help`, `btn-tariffs` — reference/support actions) and right (`btn-account`, `btn-cart`, `language-switch` — user-specific actions).
- `end-session` (header, top-right) must also remain visible while any popup is open — popups must never cover the header or footer, or even the working screen's background; it must be visually unambiguous that it is a popup on top of the current screen (see `docs/domain/kiosk-session.md`).
- Pop-up/overlay elements (language, help, tariffs, login, cart) render on top of the Welcome Screen rather than replacing it; the Welcome Screen state must be preserved underneath.
- `service-scan` and `service-copy` must remain present in the layout (disabled) rather than omitted, since they are confirmed future functions.
- `service-print`, `service-scan`, and `service-copy` are `ServiceCard` instances (see the UI Component Library) — they are not instances of the generic `Button` component, and their identifiers are semantic (named after the service, not the presenting component).
- `btn-call-operator` only needs to trigger an external application; no in-app call UI or audio handling is required on this screen.
- Colors, typography, and exact spacing/margin values are not yet defined and are out of scope for this document.
- See `docs/domain/kiosk-session.md` for the full definition of session start/end, `end-session`'s behavior, and the inactivity rule referenced in Screen states.

## Prototype modal content (first implementation slice)

For the current milestone, the four Welcome Screen overlays share the same shallow implementation, using the `Modal` shell:

- Language, Help, Tariffs, and Login each open a simple temporary panel built on the shared `Modal` shell.
- Each temporary panel has a confirmed title (e.g., "Language", "Help", "Tariffs", "Login") and clearly marked placeholder content.
- Each temporary panel is closable.
- No unconfirmed business logic is introduced: no authentication mechanism, no tariff values, no language list, and no help content are implemented beyond explicitly marked placeholders.
- The Cart (`btn-cart`) is a separate popup, not one of these four temporary panels — its content is session-scoped order data (see `docs/domain/kiosk-session.md`), not static placeholder text. For the current milestone, with no upload flow implemented yet, it shows an empty state.
