# UI Component Library

## 1. Purpose and scope

This document defines the reusable UI building blocks shared across every screen of the kiosk application. It exists so that each screen is assembled from a small, consistent set of components instead of one-off markup, keeping the application visually and behaviorally coherent as more screens are added.

It applies to all screens of the kiosk application, not only the Welcome Screen. Screen specifications (e.g., `docs/screens/welcome-screen-spec.md`) describe how a specific screen is composed — which components appear, in what arrangement, and with what content. This document instead describes the reusable UI building blocks themselves — their purpose, behavior, states, and composition rules — independent of any single screen.

This document defines behavior and composition, not final branding or implementation code. No colors, font families, icon library, or exact measurements are chosen here; where the global Design System (`docs/design/design-system.md`) already defines a token category, this document references it rather than inventing new values.

The component library is intentionally small during the current seven-day prototype milestone. Components are only added here when they are already required by the confirmed Welcome Screen, or clearly reusable foundations for the confirmed printing flow. Anything else is deferred rather than built speculatively.

---

## 2. Component design principles

Every component in this library must follow these global rules:

- **Touch-first interaction** — the primary input method is a touchscreen; every component must work correctly on first tap.
- **Mouse compatibility** — every component must also be fully operable with a mouse, per the confirmed accessibility requirement.
- **Large interaction targets** — interactive elements are sized for confident touch input, consistent with the confirmed large-touch-target requirement.
- **Clear visual hierarchy** — a component's importance must be legible at a glance, reusing the Primary/Secondary/Tertiary hierarchy defined in the Design System.
- **High contrast** — components must support the confirmed high-contrast, highly-readable requirement, independent of the final color palette.
- **Simple and predictable behavior** — a component behaves the same way everywhere it is used; no screen-specific hidden behavior.
- **Consistent states** — components use the shared state vocabulary defined in Section 4, rather than inventing screen-specific states.
- **Minimal cognitive load** — components communicate their purpose without requiring the user to learn or remember anything, consistent with the confirmed non-technical target audience.
- **No essential interaction depends only on hover** — hover has no reliable equivalent on a touchscreen, so no component may require a hover-only interaction to be usable.
- **Immediate visible feedback after interaction** — every tap, click, or keyboard activation produces an immediate, visible response.
- **Reuse before creating a new component** — an existing component (or an existing variant of it) is used whenever it fits, before a new component is proposed.
- **Composition over narrow specialization** — new needs are met by composing existing primitives/composites rather than creating many narrowly specialized one-off variants.

No exact colors, fonts, or measurements are introduced here beyond what the Design System already defines.

---

## 3. Naming and classification

Components are classified into three levels:

### Primitives

Small foundational controls that do not contain application-specific business logic.

Examples: Button, IconButton, StatusBadge. (`TextButton`, sometimes listed as a separate primitive elsewhere, is treated in this library as a content configuration of `Button` — see Section 6 — rather than a separate component, per the reuse-before-creating principle. `Divider` is listed as an example primitive class but is not yet confirmed as needed by any current document — see Section 21.)

### Composite components

Reusable combinations of primitives with a defined UI purpose.

Examples: ServiceCard, Modal, Notification, PersistentActionBar.

### Screen-specific compositions

Arrangements such as the Welcome Screen's header region or a future service-selection layout are screen compositions — specific arrangements of components defined in a screen specification — not necessarily reusable global components in their own right. Not every visible block on a screen becomes a component in this library; a block only qualifies once it is reused, or clearly will be reused, across more than one screen.

### Naming rules

- Use clear, semantic English names.
- Name components by their purpose, not by their position or appearance (e.g., not `BlueButton`, `LeftPanel`, or `WelcomeButton`).
- Component names use PascalCase (e.g., `ServiceCard`).
- Variants and states use lowercase semantic names (e.g., `primary`, `disabled`, `coming-soon`).

---

## 4. Standard component states

| State      | When used                                                                    | Remains interactive?                                                                                   | Required feedback                                                        | Scope                                                                                                          |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `default`  | The component's normal, resting condition.                                   | Yes                                                                                                    | None beyond normal appearance.                                           | All interactive components.                                                                                    |
| `pressed`  | While the user is actively touching/clicking the component.                  | Yes                                                                                                    | Immediate visible change, satisfying the "immediate feedback" principle. | All interactive components.                                                                                    |
| `focused`  | The component has keyboard or mouse focus.                                   | Yes                                                                                                    | A clearly visible focus indicator, for keyboard and mouse accessibility. | All interactive components.                                                                                    |
| `disabled` | The represented function is not currently available (e.g., Scan/Copy today). | No                                                                                                     | Must look visually unavailable; must not respond to interaction.         | Any component with an interactive variant.                                                                     |
| `loading`  | An action has been triggered and its result is pending.                      | Depends on the component; repeated submissions must be prevented where re-triggering would be harmful. | A visible loading indication.                                            | Only components where an asynchronous action is confirmed to exist (not yet applicable to the Welcome Screen). |
| `selected` | The component represents a choice that is currently chosen.                  | Yes                                                                                                    | A clearly visible selected appearance.                                   | Only components used for selection (e.g., future `OptionCard`, `RadioGroup`).                                  |
| `error`    | The component's content or input is currently invalid.                       | Yes                                                                                                    | A visible error indication and, where applicable, an error message.      | Only components that accept input or report status (e.g., future `TextField`, `Notification`).                 |
| `success`  | The component's content or action completed successfully.                    | Yes                                                                                                    | A visible success indication.                                            | Only components that report status (e.g., `Notification`).                                                     |

Clarifications:

- Hover is never required to use a component, because the primary device is a touchscreen.
- Focus must remain visible for both keyboard and mouse use.
- Disabled controls must look unavailable and must not respond to any interaction.
- The `loading` state must prevent repeated submissions where re-submission would be harmful (exact scenarios are not yet confirmed for this milestone).
- Not every component must implement every state — a component only implements the states that are meaningful for it.

No colors or animations are defined for any state here.

---

## 5. Component specification format

Every component in Sections 6–20 is described using the following template:

### Component name

**Category:** Primitive / Composite

**Purpose:**
What problem the component solves.

**Use when:**
Appropriate usage.

**Do not use when:**
Situations where another component or pattern is more appropriate.

**Structure:**
Its internal content and possible elements.

**Variants:**
Only justified reusable variants.

**States:**
Applicable interaction and status states, from Section 4.

**Behavior:**
What happens when the user interacts with it.

**Content rules:**
Rules for labels, text length, icons, and supporting text.

**Touch and accessibility:**
Touch-target, keyboard, mouse, focus, and readability considerations.

**Design token dependencies:**
Referenced token categories from the Design System, without inventing new values.

**Used on:**
Confirmed screens or flows where this component is already needed.

**Open decisions:**
"To be defined" for unresolved questions.

---

## 6. Button family

A single reusable `Button` component is defined, rather than separate unrelated button components for each purpose.

### Button

**Category:** Primitive

**Purpose:** A single interactive control for triggering an action, covering every button-like need in the application through variants and content configuration instead of separate components.

**Use when:** The user needs to trigger an action directly (navigate, submit, confirm, cancel, etc.).

**Do not use when:** The action is a compact, persistent, largely icon-driven control better served by `IconButton` (Section 7), or the interactive surface is a whole selectable card better served by `ServiceCard`/`OptionCard`.

**Structure:** An optional leading icon, a text label, an optional trailing icon.

**Variants:**

- `primary` — the single strongest action on a screen or modal (e.g., a future "Continue" action later in the printing flow; not the Welcome Screen's service entries, which are `ServiceCard` instances).
- `secondary` — an alternative action presented alongside a primary action.
- `tertiary` — a visually quieter, supportive action.
- `danger` — reserved only for destructive or irreversible actions; never used simply to attract attention. Whether the future "Reset" action (Section 18) uses this variant is not assumed automatically — its final visual treatment is To be defined.

**States:** `default`, `pressed`, `focused`, `disabled`, `loading` (only where an asynchronous action is confirmed to exist).

**Behavior:** Triggers its associated action immediately on activation (tap, click, or keyboard activation) and gives immediate visible feedback. Only one `primary` button should normally dominate a given screen or modal; `secondary`/`tertiary` buttons support it without competing for attention.

**Content rules:** Labels must describe the action clearly (e.g., "Print", not a vague label like "OK" when a more specific label is available). A button must not rely on icon meaning alone if the action may be unfamiliar to a non-technical user.

**Touch and accessibility:** Meets the confirmed large-touch-target requirement; fully operable by mouse and keyboard; visible focus state required.

**Design token dependencies:** `button-primary`, `button-secondary`, `button-tertiary`, `button-disabled`, `font-button`, `radius-medium`, `space-s`/`space-m` (internal padding/icon spacing).

**Used on:** Not the Welcome Screen's service entries (`service-print`/`service-scan`/`service-copy`), which are `ServiceCard` instances (Section 8), not `Button` instances. `Button` is used for primary/secondary/tertiary actions inside `Modal` content (Section 12) and `Notification` actions (Section 13), and — as content configurations rather than new components — the future Back/Continue/Reset/Cancel actions (Section 18).

**Open decisions:** Exact sizing and colors per variant — To be defined.

No button colors or exact sizes are defined here.

---

## 7. IconButton

**Category:** Primitive

**Purpose:** A compact, persistent action control for the recurring footer actions: language, help, tariffs, account, cart, call operator.

**Use when:** The action is a small, frequently-present control that does not need to dominate the screen (footer/header actions).

**Do not use when:** The action is the primary task of the screen — use `Button` (`primary`/`secondary`) instead.

**Structure:** An icon, with an optional adjacent text label.

**Variants:** Icon-only (only when the icon's meaning is already universally understood, e.g., a plain back arrow); icon-with-label (used whenever meaning is not universally obvious). Which presentation applies to each of the footer controls (language, help, tariffs, account, cart, call operator) follows the approved wireframe and the future visual specification — not fixed by this document. When a control's meaning would not be clear to a non-technical user, a visible label should be preferred.

**States:** `default`, `pressed`, `focused`, `disabled`, `selected` (e.g., to indicate an active language or a logged-in account, exact visual treatment To be defined).

**Behavior:** Opens its associated pop-up/overlay (language, help, tariffs, account, cart) or triggers its associated action (call operator launches an external application, per the confirmed requirement).

**Content rules:** Labels are short and unambiguous. A tooltip may be shown for mouse users, but a tooltip must never be required to understand the control's purpose — the visible label/icon must already be sufficient.

**Touch and accessibility:** Meets the confirmed large-touch-target requirement even though the visual footprint is compact; accessible name must be present even when no visible label is shown; visible focus state required.

**Design token dependencies:** `button-tertiary` (as the underlying hierarchy tier), `icon-size-s`/`icon-size-m`, `font-caption` or `font-button` for the label, `space-xs` (icon-to-label gap).

**Used on:** Welcome Screen footer (`language-switch`, `btn-help`, `btn-tariffs`, `btn-account`, `btn-cart`, `btn-call-operator`).

**Open decisions:** The exact list of icons that may omit a text label — To be defined. No specific icons or icon library are selected here.

---

## 8. ServiceCard

**Category:** Composite

**Purpose:** Represents one of the kiosk's primary functions as a large, touch-friendly, self-contained choice.

**Use when:** Presenting one of the kiosk's core functions as a selectable entry point (currently Print, Scan, Copy).

**Do not use when:** The choice is a smaller, in-flow option rather than one of the kiosk's core functions — use `OptionCard` (Section 17) instead.

**Structure:** A service icon placeholder, a service name, optional short supporting text, an optional status label (e.g., "Coming soon"), and an interactive surface covering the whole card.

**Variants/states:**

- `available` — the service can be started. Confirmed identifier: `service-print`.
- `coming-soon` — the service is visible but not yet implemented; does not navigate anywhere when tapped. Confirmed identifiers: `service-scan`, `service-copy`.
- `unavailable` — the service is implemented but temporarily cannot be used (e.g., because required hardware is unavailable); distinct from `coming-soon`, since the two communicate different reasons and must not look identical. Confirmed use: `service-print` switches from `available` to `unavailable` while required printing hardware is unavailable (see Notification, Section 13); `service-scan`/`service-copy` remain `coming-soon` in that state, since they are unaffected by printing hardware.
- `selected` — only if a future screen requires the user to see which service was chosen; not required by the current confirmed Welcome Screen.

**Behavior:** Tapping an `available` card navigates to the next confirmed stage (`service-print` → Service selection). Tapping a `coming-soon` or `unavailable` card does not navigate.

**Content rules:** Service name is short (a single word/short phrase, e.g., "Print"). Supporting text, if used, is brief. The status label ("Coming soon") must be legible without relying on color alone.

**Touch and accessibility:** The whole card is the touch target, meeting the confirmed large-touch-target requirement; focus state required for keyboard/mouse use.

**Design token dependencies:** `elevation-raised`, `radius-large`, `font-h3` (service name), `font-caption` (status label/supporting text), `space-m` (internal spacing), `space-m`/`space-l` (spacing between cards).

**Used on:** Welcome Screen — `service-print` (available), `service-scan` (coming-soon), `service-copy` (coming-soon). All three render at equal size, per the approved wireframe (Concept A); `service-print` receives no larger or stronger visual treatment than the other two.

**Open decisions:** Exact icon per service (no icon library chosen); exact supporting text, if any — To be defined.

No service descriptions or visual styling beyond the above are invented here.

---

## 9. PersistentActionBar

**Category:** Composite

**Purpose:** A reusable container for the persistent secondary controls that must remain accessible on every screen.

**Use when:** Any screen needs to expose the shared, always-available actions: language switch, help, tariffs, account, cart, call operator.

**Do not use when:** An action is specific to a single screen's task rather than a persistent, cross-screen action.

**Structure:** Two groups of `IconButton` instances, per the approved Welcome Screen wireframe (Concept A, as refined): a left group (Call Operator, Help, Tariffs — reference/support actions) and a right group (Login, Language — user-specific actions). This left/right grouping is the arrangement approved for the Welcome Screen; it is not asserted here as an unconditional layout rule for every future screen, though the action set and ordering should remain consistent across screens unless a later approved screen specification states otherwise.

**Variants:** None beyond the fixed left/right grouping described above; a component-level variant is not introduced for different orderings, since ordering must stay consistent across screens per Section 13 of the Design System.

**States:** Each contained `IconButton` carries its own state (Section 4). The bar itself does not have a separate state, except for the "reduced accessibility" case below.

**Behavior:** Always rendered; its actions open their respective overlay (language, help, tariffs, account, cart) or trigger the external operator call. In the confirmed hardware-unavailable state, Call Operator, Help, and Account remain accessible (per the confirmed Welcome Screen requirements); whether the remaining controls (Tariffs, Cart, Language) also stay accessible in that state is not explicitly confirmed — To be defined.

**Content rules:** Ordering is fixed (Call Operator, Help, Tariffs — then Account, Cart, Language) and must not be reordered per screen.

**Touch and accessibility:** Each contained control meets the large-touch-target requirement individually; the bar as a whole must remain reachable and legible at all times.

**Design token dependencies:** `space-l` (bar height/outer spacing), `space-s`/`space-m` (spacing between and within groups).

**Used on:** Welcome Screen footer.

**Open decisions:** Whether the bar remains interactive while a modal/overlay is open is not confirmed — To be defined. This document does not assume that the logo (`BrandMark`) belongs inside `PersistentActionBar`; the approved wireframe places it in the header, not the footer, so it is defined as a separate component (Section 10). `PromoAction` (Section 11) no longer occupies any layout slot — it is a session-start popup, not a header or footer element.

---

## 10. BrandMark

**Category:** Primitive

**Purpose:** A placeholder for the kiosk's brand/logo, reserved in the header per the approved wireframe.

**Use when:** Any screen's header needs to display the brand identity.

**Do not use when:** A different, screen-specific graphic is needed — `BrandMark` represents only the single, consistent brand identity confirmed to be the same across all kiosks.

**Structure:** A single static image/icon slot.

**Variants:** None. Branding is confirmed to be identical across all kiosks, so no per-kiosk variant is defined.

**States:** `default` only. No interactive states are defined, since no click/navigation behavior is confirmed.

**Behavior:** Displays the brand asset. No navigation behavior unless confirmed later.

**Content rules:** No assumption is made about logo proportions or file format; the component must accommodate a placeholder today and the final brand asset later without structural change.

**Touch and accessibility:** Not an interactive control by default; if a future confirmed requirement adds click behavior, it must then meet the standard touch-target and focus requirements.

**Design token dependencies:** `space-xs`/`space-s` (position within the safe area), `radius-small` (if a bounding shape is needed).

**Used on:** Welcome Screen header (top-left corner).

**Open decisions:** Whether the logo is ever interactive — To be defined. The logo's final visual design is out of scope for this document.

---

## 11. PromoAction

**Category:** Composite

**Purpose:** Surfaces a promotion to the user, if one is currently active, at the start of a Kiosk Session. **Revised:** this is no longer a persistent header slot — it does not occupy layout space at all. If a promotion is active, it is presented as a popup at session start (see `docs/domain/kiosk-session.md`); if no promotion is active, nothing is shown and no space is reserved for it anywhere in the layout.

**Use when:** A promotion is currently configured/active, at the moment a Kiosk Session begins.

**Do not use when:** No promotion is active — nothing is rendered, and no layout space is reserved for it (unlike the component's original design, which reserved a persistent header slot).

**Structure:** A popup/overlay presenting the promotional content, built on the same overlay pattern as `Modal`, rather than a persistent header icon.

**Variants:** None beyond active/hidden, since promotional content itself is not yet confirmed.

**States:** `default`, `pressed`, `focused` — only meaningful while shown; no state exists when inactive (it simply does not render).

**Behavior:** When a promotion is active, the popup appears at the start of the session (the exact triggering moment relative to Trigger A/Trigger B — see `docs/domain/kiosk-session.md` — is To be defined); its action and destination are supplied entirely by the active promotion's configuration/content. This component defines no built-in destination.

**Content rules:** No promotional content, icon, or copy is invented here.

**Touch and accessibility:** When shown, meets the same large-touch-target and focus requirements as other popups (`Modal`).

**Design token dependencies:** `elevation-modal`, `radius-large`, `space-l` (consistent with other popups, not with header icon sizing).

**Used on:** Not used on the Welcome Screen header layout (no longer applicable — see "Revised" above). Anticipated as a session-start popup once a promotion exists; not part of the current milestone.

**Open decisions:** Everything about actual promotional content and its destination, and the exact trigger timing relative to session start — To be defined; not part of the current milestone.

---

## 12. Modal

**Category:** Composite

**Purpose:** A reusable overlay container for tasks that interrupt the current screen without replacing it — used for language selection, help, tariffs, and login.

**Use when:** The user needs to complete a short, self-contained task (view info, make a selection, log in) without leaving the current screen.

**Do not use when:** The content is a brief system message rather than a task — use `Notification` (Section 13) instead; or when the interruption should occupy the entire screen rather than overlay it (no such full-screen case is confirmed yet).

**Structure:** A backdrop/overlay, a modal container, an optional title, a content area (built on `Panel`, Section 15), an optional close action, and optional primary/secondary actions (using `Button`).

**Variants:** None beyond content — the same shell serves language, help, tariffs, and login, since their behavior does not materially differ; separate modal components are not created per content type.

**States:** `default` (open), plus `loading`/`error` inside the content area where the contained task requires it (e.g., a future login submission).

**Behavior:** Displayed above the current screen; the underlying screen's state is preserved beneath it, per the confirmed requirement that pop-ups render on top of the Welcome Screen rather than replacing it. Focus moves inside the modal when it opens. Long content scrolls within the content area rather than resizing the modal indefinitely.

**Content rules:** Titles are short and describe the modal's purpose (e.g., "Help", "Tariffs").

**Touch and accessibility:** Focus is trapped inside the modal while open; keyboard and mouse dismissal (e.g., a close button, or the Escape key) must be available; accidental interaction with the background screen must be prevented while the modal is open.

**Design token dependencies:** `elevation-modal`, `radius-large`, `space-l`/`space-xl` (internal and outer spacing).

**Used on:** Welcome Screen (language selection, help, tariffs, login). For the current milestone, all four open a simple temporary panel built on this shell: a confirmed title (e.g., "Language", "Help", "Tariffs", "Login") plus clearly marked placeholder content, and no unconfirmed business logic (no authentication mechanism, tariff values, language list, or help content beyond explicit placeholders).

**Open decisions:** Whether clicking the backdrop closes the modal — To be defined (already flagged as unresolved in the Welcome Screen specification). Behavior when a second overlay would be triggered while one is already open — To be defined.

---

## 13. Notification

**Category:** Composite

**Purpose:** Communicates system information or service status to the user, distinct from a task the user must complete.

**Use when:** The system needs to inform the user of a state (e.g., a required service is unavailable) rather than ask them to complete a task.

**Do not use when:** The content represents a user-initiated task — use `Modal` instead.

**Structure:** A title, a message, an optional action (using `Button`), and a close button/icon.

**Variants:** `informational`, `warning`, `error`, `success`. The confirmed hardware-unavailable case on the Welcome Screen is classified as `error`, since it blocks the primary function rather than merely warning about a lesser issue.

**States:** `default`; persistent vs. temporary behavior depends on severity (see Behavior).

**Behavior:** Presented as a popup. The confirmed hardware-unavailable case (`notification-service-unavailable`) includes a close button/icon and can be dismissed by the user, but dismissing it only hides the notification — it does not restore service availability; `service-print` remains `unavailable` until the underlying hardware condition changes. This is a popup `Notification`, not a blocking `Modal`: the `PersistentActionBar` (Call Operator, Help, Login) remains accessible and interactive throughout, per the confirmed requirement. Less severe notifications may be temporary, but exact auto-dismiss timing is not confirmed — To be defined.

**Content rules:** Titles state the situation plainly (e.g., "Service unavailable"); messages stay concise; readability must not depend on color alone.

**Touch and accessibility:** Meets the same readability and contrast requirements as the rest of the interface; the close control and any action meet the large-touch-target requirement.

**Design token dependencies:** `elevation-modal`, `radius-large`, `font-h2`/`font-body`, `space-l`.

**Used on:** Welcome Screen (`notification-service-unavailable`, confirmed use case — drives `service-print` to `unavailable`).

**Open decisions:** `informational`/`warning`/`success` variants are defined for completeness but have no confirmed use case yet. Exact visual styling of the popup remains governed by the Design System (To be defined there).

---

## 14. StatusBadge

**Category:** Primitive

**Purpose:** A compact, non-interactive label communicating status, without performing any action itself.

**Use when:** A component needs to communicate a status alongside its main content (e.g., "Coming soon" on a `ServiceCard`).

**Do not use when:** The element itself is meant to be interactive — status is descriptive only.

**Structure:** A short text label.

**Variants:** `Coming soon` (confirmed current use, on Scan/Copy). `Unavailable`, `Ready`, `Processing`, `Error` are anticipated for later, confirmed stages of the printing flow (e.g., job/printing status, error handling) but are not tied to a specific screen yet.

**States:** `default` only; it is not interactive, so Section 4's interaction states do not apply. It may visually reflect the `error`/`success` status concepts from Section 4 without being an interactive component itself.

**Behavior:** Purely presentational; performs no action when tapped or clicked.

**Content rules:** Labels are short; meaning must remain understandable without relying on color alone.

**Touch and accessibility:** Not a touch target; must remain legible at the confirmed high-contrast/readability standard.

**Design token dependencies:** `font-caption`, `radius-small`.

**Used on:** Welcome Screen (`ServiceCard` "Coming soon" label for Scan/Copy).

**Open decisions:** The full future set of status values is not fixed at this stage; only "Coming soon" is confirmed today.

---

## 15. Card and Panel

Both concepts are kept, but narrowly scoped to avoid a generic container that adds no value beyond layout markup.

### Panel

**Category:** Primitive

**Purpose:** A structural container for larger content areas that need consistent elevation, radius, and spacing — used as the shared foundation inside `Modal`'s content area and `Notification`'s body.

**Use when:** A composite component needs a generic content region (see `Modal`, `Notification`).

**Do not use when:** The content is one of the kiosk's core functions — use `ServiceCard` instead.

**Structure:** A single container region with configurable content.

**Variants:** None beyond the elevation levels already defined in the Design System (`elevation-raised`, `elevation-modal`), selected by the composite that uses it.

**States:** `default` only, at the panel level; contained content carries its own state.

**Behavior:** Purely structural; does not add interaction of its own.

**Content rules:** None beyond what the containing composite defines.

**Touch and accessibility:** Inherits from its contained content; introduces no separate requirement.

**Design token dependencies:** `elevation-raised`/`elevation-modal`, `radius-medium`/`radius-large`, `space-m`/`space-l` (internal padding).

**Used on:** Internally, inside `Modal` and `Notification` (Welcome Screen). `Panel` is kept as an internal implementation structure for these two composites and is not defined as its own public component until an independent reuse beyond `Modal`/`Notification` is confirmed, in line with avoiding speculative abstraction.

**Open decisions:** None beyond the general visual-treatment items in Section 23.

### Card (generic)

**Category:** Primitive

**Purpose:** A lightweight, generic grouping surface for content that does not fit `ServiceCard`, `Modal`, or `Notification`.

**Use when:** A future confirmed need requires a plain grouped surface (e.g., a summary/receipt display) that is not one of the kiosk's core functions.

**Do not use when:** The content represents one of the kiosk's core functions — use `ServiceCard` instead.

**Open decisions:** No confirmed use case exists yet in this milestone; not required for the Welcome Screen.

---

## 16. TextField

**Category:** Primitive

**Purpose:** A reusable text-entry control for confirmed or clearly foreseeable future flows, such as login or entering an upload-related identifier.

**Use when:** The user must type a short piece of information (e.g., a future login field).

**Do not use when:** The choice is from a small, fixed set of options — use a selection control instead (Section 17).

**Structure:** A label, the current value, a placeholder (supporting guidance only, never a replacement for the label), optional helper text, a validation message, and an optional clear action.

**Variants:** None beyond states below; a single-line text field covers the currently foreseeable needs.

**States:** `default`, `focused`, `disabled`, `read-only`, `error` (with a validation message).

**Behavior:** Accepts typed input; shows a validation message when the `error` state applies.

**Content rules:** Labels are always present and descriptive; placeholders never substitute for a label.

**Touch and accessibility:** Large enough touch target to focus reliably; must support both the on-screen keyboard and a physical keyboard, consistent with the confirmed mouse/keyboard accessibility requirement. Exact on-screen keyboard behavior — To be defined.

**Design token dependencies:** `radius-medium`, `font-body`, `font-caption` (helper/validation text), `space-s` (internal padding).

**Used on:** Not required for the current Welcome Screen implementation; anticipated for a future login form and/or upload-identifier entry.

**Open decisions:** Concrete fields and validation rules depend on how personal accounts are authenticated, which is an open product question (`docs/product-overview.md`) — To be defined.

---

## 17. Selection controls

Only the selection controls clearly justified by the confirmed application flow are defined.

- **`OptionCard`** — a large, touch-friendly choice card, structurally similar to `ServiceCard` but used for in-flow choices rather than the kiosk's core functions (e.g., choosing an upload method among the six confirmed options: QR code, temporary email, Telegram bot, personal account, web upload, USB drive). Preferred selection pattern for this touchscreen kiosk whenever the option set is small enough to show as cards, since it avoids requiring precise, small-target interaction.
- **`Select`** — a compact list control, used only when a genuinely long option list makes a full grid of cards impractical. No confirmed scenario currently requires this; exact use — To be defined.
- **`Checkbox`** — for an independent binary choice. No confirmed scenario currently requires this.
- **`RadioGroup`** — for one choice among a small, visible set, when a compact list is more appropriate than large cards. No confirmed scenario currently requires this.

For a touchscreen kiosk used by non-technical users, `OptionCard` is the preferred default whenever the option count allows it; `Select`, `Checkbox`, and `RadioGroup` are kept in the classification for completeness but are not built now, since no confirmed screen currently requires them.

**Open decisions:** Exact print-settings options (which would determine whether `Checkbox`/`RadioGroup`/`Select` become justified) are not yet confirmed.

---

## 18. Navigation controls

Back, Continue, Reset, and Cancel are treated as uses of the shared `Button` component (Section 6) rather than separate visual components, since no additional behavior currently justifies a wrapper.

| Action   | Semantic purpose                                                                                     | Placement consistency                                                                                                                                                               | Notes                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Back     | Return to the previous stage of the flow.                                                            | Consistent position across in-flow screens — exact position To be defined.                                                                                                          | Non-destructive.                                                                                                 |
| Continue | Proceed to the next stage of the flow.                                                               | Uses the `primary` `Button` variant.                                                                                                                                                | Non-destructive.                                                                                                 |
| Reset    | Discard progress and return to the Welcome Screen.                                                   | Destructive in behavior (it can discard meaningful progress); its final visual hierarchy/variant — `danger` or otherwise — is not assigned automatically and remains To be defined. | Requires a confirmation step when meaningful progress would be lost — exact confirmation UI To be defined.       |
| Cancel   | Abandon the current task (e.g., close a modal) without necessarily discarding overall flow progress. | Uses the `secondary`/`tertiary` `Button` variant.                                                                                                                                   | Distinct from Reset: Cancel exits a smaller, local task; Reset discards the user's broader progress in the flow. |

Disabled/loading behavior for these actions follows the standard `Button` states (Section 4/6).

**Used on:** Not required for the Welcome Screen itself (it is the flow's entry point); required soon, once later screens in the confirmed printing flow are implemented.

---

## 19. Loading and progress components

Only the minimum reusable components required for the confirmed printing flow are defined.

### LoadingIndicator

**Category:** Primitive

**Purpose:** Communicates that an action's result is pending, without implying a measurable completion percentage (indeterminate loading).

**Use when:** Waiting for a result whose duration is not predictable (e.g., a step within Job queue / printing status).

**Do not use when:** A measurable completion percentage is confirmed to be available — use `ProgressIndicator` instead.

**States:** `default` (active) only.

**Design token dependencies:** `motion-duration-fast` (if animated), `elevation-base`.

**Used on:** Anticipated for the confirmed "Job queue / printing status" stage; not required for the Welcome Screen.

**Open decisions:** Exact visual treatment — To be defined.

### ProgressIndicator

**Category:** Primitive

**Purpose:** Communicates measurable progress toward completion.

**Open decisions:** Whether any confirmed stage exposes a measurable percentage (as opposed to indeterminate waiting) is not yet confirmed — To be defined. Not required for this milestone.

### StepIndicator

**Category:** Composite

**Open decisions:** No product document currently confirms or strongly requires a visible multi-step progress UI for the printing flow. This component is not defined in detail and is not planned for the current milestone; it should only be introduced later if such a requirement is explicitly confirmed. No step count or stage names are invented here.

---

## 20. Empty, error and unavailable states

These are handled as reusable content patterns built from existing components, rather than as one-off components.

Standard content structure for any such state:

- A clear status title.
- A concise explanation.
- The next available action, if any.
- Operator/help access, where relevant (reusing the `PersistentActionBar` controls already present).

A state is:

- **Embedded in a component** when it applies to a single element (e.g., a `ServiceCard` in its `unavailable` variant).
- **Displayed as a `Notification`** when it is a system-level message that doesn't block the whole screen (e.g., the confirmed hardware-unavailable case).
- **Displayed in a `Modal`** when it requires the user to make a decision to proceed.
- **Shown as a full-screen blocking state** only if a future confirmed requirement calls for it; no such case is confirmed today.

---

## 21. Component inventory

| Component                                        | Category       | Current milestone status                                             | First confirmed use                                                                                                                         | Required now?          |
| ------------------------------------------------ | -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Button                                           | Primitive      | Required for Welcome Screen implementation                           | Welcome Screen (close/action buttons inside `Modal` temporary panels and `Notification`) — not the service entries, which use `ServiceCard` | Yes                    |
| IconButton                                       | Primitive      | Required for Welcome Screen implementation                           | Welcome Screen footer                                                                                                                       | Yes                    |
| StatusBadge                                      | Primitive      | Required for Welcome Screen implementation                           | Welcome Screen (`ServiceCard` "Coming soon")                                                                                                | Yes                    |
| Divider                                          | Primitive      | Optional/future                                                      | No confirmed use yet                                                                                                                        | No                     |
| ServiceCard                                      | Composite      | Required for Welcome Screen implementation                           | Welcome Screen (`service-print`, `service-scan`, `service-copy`) — the only component representing the three Welcome Screen services        | Yes                    |
| Modal                                            | Composite      | Required for Welcome Screen implementation (shell only)              | Welcome Screen (language, help, tariffs, login)                                                                                             | Yes                    |
| Notification                                     | Composite      | Required for Welcome Screen implementation                           | Welcome Screen (hardware-unavailable notice)                                                                                                | Yes                    |
| PersistentActionBar                              | Composite      | Required for Welcome Screen implementation                           | Welcome Screen footer                                                                                                                       | Yes                    |
| BrandMark                                        | Primitive      | Required for Welcome Screen implementation                           | Welcome Screen header (logo)                                                                                                                | Yes                    |
| PromoAction                                      | Composite      | Not required for Welcome Screen implementation (no active promotion) | Session-start popup, only if a promotion is active — not a layout slot                                                                      | No                     |
| Panel                                            | Primitive      | Required soon, as an internal dependency of Modal/Notification       | Welcome Screen (internal to Modal/Notification)                                                                                             | Yes (internal)         |
| TextField                                        | Primitive      | Required soon for the confirmed Print flow                           | Future login / upload-identifier entry                                                                                                      | Not for Welcome Screen |
| OptionCard                                       | Composite      | Required soon for the confirmed Print flow                           | Future upload method selection                                                                                                              | Not for Welcome Screen |
| Navigation controls (Back/Continue/Reset/Cancel) | Uses of Button | Required soon for the confirmed Print flow                           | Future in-flow screens                                                                                                                      | Not for Welcome Screen |
| LoadingIndicator                                 | Primitive      | Required soon for the confirmed Print flow                           | Future Job queue / printing status stage                                                                                                    | Not for Welcome Screen |
| Select                                           | Primitive      | Optional/future                                                      | Not confirmed                                                                                                                               | No                     |
| Checkbox                                         | Primitive      | Optional/future                                                      | Not confirmed                                                                                                                               | No                     |
| RadioGroup                                       | Composite      | Optional/future                                                      | Not confirmed                                                                                                                               | No                     |
| Card (generic)                                   | Primitive      | Optional/future                                                      | Not confirmed                                                                                                                               | No                     |
| ProgressIndicator                                | Primitive      | Optional/future                                                      | Not confirmed                                                                                                                               | No                     |
| StepIndicator                                    | Composite      | Rejected as unnecessary abstraction (for now)                        | No confirmed requirement                                                                                                                    | No                     |

---

## 22. Initial implementation scope

The smallest component set needed to implement the approved Welcome Screen:

- `ServiceCard` (renders `service-print`, `service-scan`, `service-copy`; `Button` does not render any of these service entries)
- `Button` — needed for the close/action controls inside the temporary `Modal` panels (Section 8 of this document) and inside `Notification`, not for the service entries
- `IconButton`
- `PersistentActionBar`
- `BrandMark`
- `Modal` (shell, holding the temporary Language/Help/Tariffs/Login panels described under Section 12)
- `Notification` (popup presentation, including the hardware-unavailable case)
- `StatusBadge`

`Panel` is used internally by `Modal` and `Notification` but is not necessarily exposed as its own separately implemented component yet — it may start as internal structure within those two composites and only be extracted once a second, independent reuse is confirmed, consistent with avoiding speculative abstraction.

The following components should **not** be implemented yet, since the Welcome Screen does not require them and no other screen has a confirmed specification yet:

- `TextField`
- `OptionCard`
- `Select`, `Checkbox`, `RadioGroup`
- `Card` (generic)
- `LoadingIndicator`, `ProgressIndicator`, `StepIndicator`
- `Divider`
- `PromoAction` — no active promotion exists yet; it is now a session-start popup rather than a layout slot, so it does not need to be built until a real promotion is confirmed.
- Navigation controls (Back/Continue/Reset/Cancel) — these are `Button` usages that only become relevant once a screen after the Welcome Screen exists.

---

## 23. Open decisions

Component-level decisions still unresolved, several of which are already flagged as open in the source documents:

- Final visual treatment of every component (colors, exact dimensions, typography, icon set) — the Design System marks all of these "To be defined".
- Whether the backdrop of `Modal` is dismissible by tapping outside it — To be defined (Welcome Screen specification).
- The visual treatment of the logged-in account state on `IconButton`/login — To be defined (Welcome Screen specification).
- Whether `PersistentActionBar` remains fully interactive while a `Modal` is open — To be defined. (Resolved for the `Notification`/hardware-unavailable case: `PersistentActionBar` remains fully interactive there, since that case is a popup `Notification`, not a blocking `Modal`.)
- Whether `BrandMark` is ever interactive — To be defined.
- Whether `Panel` should be exposed as its own component now or remain internal until reused a second time — To be defined.

Broader, product-level open questions (document formats, file retention, account authentication method, network-loss behavior, refund/recovery steps, administrative interface scope) remain tracked in `docs/product-overview.md` and are not duplicated here, since they affect product behavior rather than component definitions directly.

# Global rules

- English is used throughout this document.
- No new business functionality is invented.
- Not every screen element becomes a separate component — only elements that are reused, or clearly will be reused, across screens.
- Variants and composition are preferred over duplication.
- Screen layout regions are not turned into components unless truly reusable (see Section 3, Screen-specific compositions).
- No final colors, font families, icons, or branding assets are defined.
- No backend or hardware logic is introduced into these presentational component definitions.
- Storybook and other dependencies are not mentioned or added.
- No implementation code is written here.
- "To be defined" is used for every unresolved decision.
- The scope is kept appropriate for a fast prototype, not an enterprise design system.
