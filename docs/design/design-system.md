# Kiosk Application — Global Design System

Internal project document. Defines the reusable visual language for the entire kiosk application — not only the Welcome Screen. Every future screen must be implementable using this system. Based on `docs/product-overview.md`, `docs/welcome-screen-requirements.md`, `docs/screens/welcome-screen-spec.md`, and the selected Welcome Screen wireframe (Concept A).

**Visual values filled in (2026-08-13):** color palette, typeface, exact spacing/radius/elevation/motion values, and button-state colors are now real, implemented values (`src/styles/tokens.css`), not placeholders — done to make the prototype demo-ready. Still genuinely undecided and marked "To be defined" below: the icon library, the safe-area/grid-margin exact value, non-uniform-hardware breakpoints, overlay dismiss behavior, and final brand assets (logo/product name — `BrandMark` still renders placeholder text on purpose, see its own TODO comment).

---

# 1. Design philosophy

The interface must be:

- **Minimalist** — only essential elements appear on any screen; no decorative clutter.
- **Premium** — restraint and consistency communicate quality; minimalism should read as intentional, not empty.
- **Modern** — current, uncluttered interface conventions; no dated visual patterns.
- **Highly readable** — the kiosk is deployed in a public space with artificial lighting; every screen must remain legible at a glance, and readability takes priority over decoration.
- **Optimized for touch interaction** — every interactive element is sized and spaced for confident, accurate touch input, while remaining fully usable with a mouse.
- **Usable by non-technical users** — no jargon, no hidden gestures, no hidden menus; every action is self-explanatory.
- **Consistent across all screens** — every screen reuses the same structural regions, spacing scale, button hierarchy, and interaction patterns defined in this document, so the application feels like a single coherent product.

---

# 2. Layout system

- **Layout philosophy:** every screen is composed of the same three structural regions — header, main content, footer — first established for the Welcome Screen and reused across the application.
- **Safe area:** an outer margin around the entire screen that no content may cross. Exact value: To be defined; expressed using the spacing scale (Section 4) rather than a fixed pixel value.
- **Content area:** the space inside the safe area available to the header, main content, and footer.
- **Header area:** a fixed-height region at the top of the screen, reserved for branding (logo) and, where applicable, a promo slot. Present on every screen unless a screen explicitly requires a different treatment (e.g., a possible future full-screen state) — which screens, if any, deviate is To be defined.
- **Footer area:** a fixed-height, persistent region at the bottom of the screen, split into two groups — reference/support actions (left) and user-specific actions (right) — as established for the Welcome Screen, reused identically on every screen.
- **Spacing system:** all internal spacing must use the spacing scale (Section 4) rather than arbitrary values.
- **Alignment rules:** content aligns to the content area's edges. Footer groups align to their respective side (left group left-aligned, right group right-aligned). Primary main-content elements are horizontally centered within the content area unless a screen's specification states otherwise.

---

# 3. Grid

- **Columns:** a 12-column grid within the content area. Twelve columns provide enough flexibility to lay out both wide multi-item screens (e.g., three service cards side by side) and narrower single-column screens (e.g., a form) without redefining the grid per screen.
- **Margins:** the grid's outer margins equal the safe area (Section 2), expressed via the spacing scale.
- **Gutters:** space between columns uses the spacing scale (recommended: M — see Section 4), keeping column spacing consistent with other component spacing.
- **Responsive behavior:** the application currently targets a single reference kiosk display (landscape, confirmed at 2880×1800) as stated in the Welcome Screen Requirements. The grid is defined in relative units so the same column/margin/gutter structure scales proportionally if the target resolution changes later. Additional breakpoints for meaningfully different kiosk hardware: To be defined, only if/when non-uniform kiosk hardware is confirmed.

---

# 4. Spacing scale

All spacing is expressed as a multiple of a single base unit, `space-unit`. Value: `8px` — kept as a single variable specifically so the entire scale can still resize proportionally later if real hardware/resolution ends up needing a different density, without redefining every spacing token individually.

| Level | Intended usage                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| XS    | Tightest spacing, for closely related elements (e.g., an icon and its adjacent label).                                                |
| S     | Spacing within a single component (e.g., internal button padding, spacing between items inside one footer group).                     |
| M     | Spacing between distinct but related components in the same section (e.g., between the three service cards, or between grid columns). |
| L     | Spacing between major layout regions (e.g., header to main content, main content to footer).                                          |
| XL    | Outermost spacing (e.g., safe-area margins, or spacing between an overlay's content and the screen edge).                             |

---

# 5. Border radius

| Level  | Intended usage                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------- |
| Small  | Compact controls, icons, small indicators.                                                         |
| Medium | Standard interactive elements — buttons, inputs, cards.                                            |
| Large  | Large containers and overlays — modal dialogs, notification panels, main function-selection cards. |

Exact values (`src/styles/tokens.css`): Small 6px, Medium 12px, Large 24px — more rounded than a typical 4/8/16 scale, a deliberate part of reading as "modern" per Section 1.

---

# 6. Elevation

| Level  | Intended usage                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base   | The default screen background. Content sitting directly on Base has no shadow/lift.                                                                                                                                 |
| Raised | Components the user directly interacts with in the main flow (e.g., the service cards on the Welcome Screen). Visually lifted slightly above Base to invite touch.                                                  |
| Modal  | Pop-ups and overlays (language, help, tariffs, login, service-unavailable notification). Renders above every other layer, consistent with the confirmed behavior that overlays render on top of the current screen. |

Exact values (`src/styles/tokens.css`): Base has no shadow. Raised is a soft two-layer shadow tinted toward ink rather than pure black (`0 1px 2px rgb(16 24 23 / 6%), 0 4px 14px rgb(16 24 23 / 6%)`). Modal is stronger (`0 12px 32px rgb(16 24 23 / 18%), 0 4px 10px rgb(16 24 23 / 10%)`), since it has no dimming layer behind it (Section 11) and needs to read as floating on shadow alone.

---

# 7. Typography

**Typeface: Manrope** (variable font, self-hosted via `@fontsource-variable/manrope` — no CDN dependency, so the kiosk never depends on external network access just to render its own text). One family carries the whole scale through weight/size rather than pairing a second face — the interface is mostly short labels and headings, not long-form reading, so a single well-chosen family keeps it simpler and more consistent (Section 1). The following styles describe usage and their real values (`src/styles/tokens.css`):

| Style   | Intended usage                                                                                                                                              | Value (weight/size/line-height) |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Display | Rare, large-scale emphasis (e.g., a full-screen state message). Used minimally, for exceptional situations only.                                            | 800 / 3rem / 1.1                |
| H1      | Primary screen title/heading — one per screen, establishes what the screen is for.                                                                          | 700 / 2rem / 1.2                |
| H2      | Section headings within a screen (e.g., a heading inside a popup/overlay).                                                                                  | 700 / 1.5rem / 1.3              |
| H3      | Sub-section headings, used sparingly for further grouping within a section.                                                                                 | 600 / 1.25rem / 1.35            |
| Body    | Default text style for standard readable content — labels, descriptions, help/tariffs content.                                                              | 500 / 1rem / 1.5                |
| Caption | Small supporting text — e.g., a "coming soon" status label, helper text beneath a control.                                                                  | 500 / 0.8125rem / 1.4           |
| Button  | Text style used specifically inside interactive controls, kept visually distinct from Body so button labels stay consistent regardless of surrounding text. | 600 / 1rem / 1.2                |

---

# 8. Iconography

- **Icon philosophy:** icons support recognition and speed for non-technical users. Every icon should be paired with a text label unless its meaning is already universally understood (e.g., a plain back arrow). The exact list of label-exempt icons: To be defined.
- **Icon sizes:** defined relative to the spacing/typography scale (e.g., tied to S/M/L) rather than fixed pixel values, so icons scale consistently with the rest of the interface.
- **Icon placement:** icons align consistently with their accompanying label (e.g., leading the label, vertically centered against it). The exact alignment rule is finalized alongside each component's specification.
- **Icon consistency:** all icons across the application share a single visual language (stroke width, corner style, fill vs. outline) so the interface reads as one coherent product. The specific icon library/style: To be defined.

---

# 9. Buttons

This section distinguishes three separate things that describe a button: its **semantic variant**, its **component type**, and its **state**. They are independent of each other (e.g., a Primary button can be `disabled`; Danger is a variant, not a state).

## Semantic variants

| Variant   | Purpose                                                                                                                                                       | Hierarchy                                                                                       | Expected usage                                                                                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary   | The single most important action on a screen or modal (e.g., a future "Continue" action later in the printing flow).                                          | Highest visual prominence. At most one primary button per screen/section.                       | Drives the user's main task forward.                                                                                                                                                                                                                |
| Secondary | A relevant alternative action presented alongside a primary action (e.g., a "Cancel" action alongside a modal's primary action, or "Back" later in the flow). | Lower prominence than Primary; must not compete visually with it.                               | Offers an alternative path without distracting from the primary action.                                                                                                                                                                             |
| Tertiary  | Supportive, lower-frequency actions — typically the footer controls (help, tariffs, language, login, call operator).                                          | Lowest visual weight among interactive controls.                                                | Always easy to find and tap, but never in visual competition with Primary/Secondary actions.                                                                                                                                                        |
| Danger    | Reserved only for clearly destructive or irreversible actions.                                                                                                | Visually distinct enough to signal caution, without dominating the screen the way Primary does. | Must not be used merely to attract attention. Does not automatically apply to any confirmed action — for example, a future "Reset" action's visual variant remains To be defined; it is not assumed to be Danger just because Reset is destructive. |

## Component type

`IconButton` is a separate, compact component (not a Button variant) for persistent icon-driven actions, such as the language switch. It carries the same hierarchy tier as the action it represents (typically Tertiary), but is documented as its own component in the UI Component Library.

## States

Buttons of any semantic variant support the standard interaction states: default, pressed, focused, disabled, loading. `Disabled` is a state, not a semantic variant — an action that exists conceptually but is not currently available remains disabled within whichever variant it is (e.g., a disabled Primary button is still "Primary," now in the `disabled` state), rather than switching to a separate "Disabled" type. It must remain visible in the layout while being clearly non-interactive.

The Welcome Screen's three service entries (Print, Scan, Copy) are not examples of this Button hierarchy — they are `ServiceCard` instances (Section 10).

**Colors (`src/styles/tokens.css`):** defined for all four variants, but the shared `Button` component has no variant prop yet (no confirmed use case needs one), so only Secondary is actually wired up today — every Button renders with `button-secondary-*` (white surface, `color-border-strong` outline, ink text). Primary emphasis today instead comes from ServiceCard/OptionCard's own bolder (Raised, larger) styling, not from a filled Button. Primary/Tertiary/Danger tokens are defined and ready for whenever that differentiation is actually needed:

| Variant   | Background                                             | Text                      |
| --------- | ------------------------------------------------------ | ------------------------- |
| Primary   | `color-accent` (deep teal, `#0c6e68`)                  | `color-on-accent` (white) |
| Secondary | `color-surface` (white), `color-border-strong` outline | `color-ink`               |
| Tertiary  | none (text-only)                                       | `color-ink-soft`          |
| Danger    | `color-danger` (`#b3261e`)                             | white                     |
| Disabled  | `color-disabled-bg`                                    | `color-disabled-text`     |

---

# 10. Cards and panels

| Type                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Service card (`ServiceCard`) | A large, tappable container representing one of the kiosk's service entries — the canonical example is Print, Scan, and Copy on the Welcome Screen (`service-print`, `service-scan`, `service-copy`; see the UI Component Library). Uses Raised elevation. All three render at equal size, per the approved wireframe (Concept A): Print is `available`, Scan and Copy are `coming-soon`, and none receives a larger or stronger visual treatment than the others. |
| Info panel                   | A container presenting read-only information inside an overlay (e.g., help content, tariffs/pricing information).                                                                                                                                                                                                                                                                                                                                                  |
| Notification panel           | A container for system-level messages (e.g., the service-unavailable notice). Uses Modal elevation and is visually distinct from user-invoked overlays, so it reads as a system state rather than a user-initiated action.                                                                                                                                                                                                                                         |

Exact visual treatment (`src/styles/tokens.css`): `color-surface` (white) background, a 1px `color-border` outline, and Raised elevation for Service/Option cards. Notification panels additionally get a 4px accent-colored left border keyed to their variant (`color-warning` / `color-danger` / `color-success` / `color-ink-soft` for informational) — color is never the only cue, the title/message text always states the same thing.

---

# 11. Dialogs and overlays

- All pop-ups/overlays (language, help, tariffs, login) render above the current screen at Modal elevation. The screen underneath remains visible and preserved, consistent with the confirmed Welcome Screen behavior.
- System notifications (e.g., service-unavailable) are a distinct category from user-invoked overlays: they appear without user action and communicate a system state rather than presenting a task.
- Dismiss behavior (tap outside, an explicit close control, or automatic dismissal) for both categories: To be defined.
- Only one overlay is expected to be visible at a time. Behavior when a second overlay would be triggered while one is already open: To be defined.

---

# 12. Forms

No specific form has been designed yet (e.g., the exact fields of the login form are not yet specified). General principles:

- Input targets must be large enough for confident touch interaction, consistent with the confirmed large-touch-target requirement.
- The interface must remain fully usable via an external keyboard/mouse in addition to touch, consistent with the confirmed accessibility requirement.
- Validation feedback style and on-screen keyboard behavior: To be defined once a specific form (e.g., login) is specified.

---

# 13. Navigation

- Every screen shares the same persistent header and footer, established for the Welcome Screen and reused identically across the application.
- Pop-ups/overlays are not a navigation event — they render above the current screen, which remains active underneath.
- Screens within the main flow (post-Welcome) provide "Back" and "Reset" actions, as confirmed in the Welcome Screen Requirements.
- The user can always return to the Welcome Screen from any later stage of the flow.

---

# 14. Motion

Motion must be:

- **Fast** — transitions never make the user wait.
- **Subtle** — used to clarify a state change, not to draw attention to itself.
- **Never distracting** — no decorative or attention-seeking animation, consistent with the minimalist, premium philosophy in Section 1.

Values (`src/styles/tokens.css`): `120ms`, `cubic-bezier(0.4, 0, 0.2, 1)` — used for hover/press feedback (color, transform, shadow) and the Modal's fade/rise-in. Respects `prefers-reduced-motion` (Modal's entrance animation is disabled under it; nothing else animates beyond quick property transitions).

---

# 15. Accessibility

- High contrast and strong readability are required across the entire application, not only the Welcome Screen.
- All touch targets must be large, including icon buttons and footer controls.
- Every screen must be fully usable via mouse in addition to touchscreen input.
- Screen-reader and voice support are not required.
- Any feature requiring audio/video communication (e.g., the operator call) is delegated to an external application rather than implemented within the kiosk interface.

---

# 16. Design tokens

Token names and their intended meaning. Implementation values now exist for spacing/radius/elevation/typography/motion/button-color/color (`src/styles/tokens.css`, filled in 2026-08-13) — icon sizes, `button-icon`, and the grid tokens beyond column count are still genuinely undecided (no icon library chosen, no confirmed safe-area value), left "To be defined" below.

| Token                                                        | Intended meaning                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `space-unit`                                                 | Base spacing unit; all spacing tokens are multiples of it. Value: `8px`.                                                                                                                                                                                               |
| `space-xs`                                                   | Tightest spacing, for closely related elements.                                                                                                                                                                                                                        |
| `space-s`                                                    | Spacing within a single component.                                                                                                                                                                                                                                     |
| `space-m`                                                    | Spacing between related components in the same section.                                                                                                                                                                                                                |
| `space-l`                                                    | Spacing between major layout regions.                                                                                                                                                                                                                                  |
| `space-xl`                                                   | Outermost spacing (safe area, overlay margins).                                                                                                                                                                                                                        |
| `radius-small`                                               | Corner rounding for compact controls/icons.                                                                                                                                                                                                                            |
| `radius-medium`                                              | Corner rounding for standard controls (buttons, inputs, cards).                                                                                                                                                                                                        |
| `radius-large`                                               | Corner rounding for large containers/overlays.                                                                                                                                                                                                                         |
| `elevation-base`                                             | Default screen background layer.                                                                                                                                                                                                                                       |
| `elevation-raised`                                           | Layer for directly-interactive main-flow components.                                                                                                                                                                                                                   |
| `elevation-modal`                                            | Layer for pop-ups, overlays, and system notifications.                                                                                                                                                                                                                 |
| `font-display`                                               | Rare, large-scale emphasis text style.                                                                                                                                                                                                                                 |
| `font-h1`                                                    | Primary screen title style.                                                                                                                                                                                                                                            |
| `font-h2`                                                    | Section heading style.                                                                                                                                                                                                                                                 |
| `font-h3`                                                    | Sub-section heading style.                                                                                                                                                                                                                                             |
| `font-body`                                                  | Default readable text style.                                                                                                                                                                                                                                           |
| `font-caption`                                               | Small supporting text style.                                                                                                                                                                                                                                           |
| `font-button`                                                | Text style used inside interactive controls.                                                                                                                                                                                                                           |
| `button-primary`                                             | Highest-emphasis action button; at most one per screen.                                                                                                                                                                                                                |
| `button-secondary`                                           | Alternative action button alongside a primary action.                                                                                                                                                                                                                  |
| `button-tertiary`                                            | Supportive/footer action button.                                                                                                                                                                                                                                       |
| `button-disabled`                                            | Visible but non-interactive function button.                                                                                                                                                                                                                           |
| `button-icon`                                                | Compact icon-only control.                                                                                                                                                                                                                                             |
| `icon-size-s` / `icon-size-m` / `icon-size-l`                | Relative icon sizes tied to the spacing/typography scale.                                                                                                                                                                                                              |
| `grid-columns`                                               | Number of columns in the reusable layout grid. Value: 12 (confirmed in Section 3).                                                                                                                                                                                     |
| `grid-margin`                                                | Outer grid margin, equal to the safe area.                                                                                                                                                                                                                             |
| `grid-gutter`                                                | Space between grid columns.                                                                                                                                                                                                                                            |
| `motion-duration-fast`                                       | Duration used for interface transitions (fast, subtle). Value: `120ms`, `cubic-bezier(0.4, 0, 0.2, 1)`.                                                                                                                                                                |
| `color-background`                                           | Screen background. Value: `#f2f6f5` — a cool, teal-tinted off-white (not pure white; not the cream tone common to generic "premium" palettes) — see Section 1's "Highly readable" requirement.                                                                         |
| `color-surface`                                              | Raised cards, panels, popups. Value: `#ffffff`.                                                                                                                                                                                                                        |
| `color-surface-sunken`                                       | Recessed/disabled backgrounds. Value: `#e8eeec`.                                                                                                                                                                                                                       |
| `color-border` / `color-border-strong`                       | Neutral outlines. Values: `#d7e0de` / `#b7c4c1`.                                                                                                                                                                                                                       |
| `color-ink` / `color-ink-soft`                               | Primary / secondary text. Values: `#101817` / `#56635f` — near-black rather than pure black, with the same cool cast as the background/border tokens (a deliberately "chosen" neutral, not a generic grey).                                                            |
| `color-accent` / `color-accent-strong` / `color-accent-soft` | The one brand accent — deep teal, a deliberate reference to cyan (one of the four process-printing inks), not an arbitrary "safe" blue. Values: `#0c6e68` / `#094f4b` (hover/pressed) / `#dcefec` (subtle tint backgrounds).                                           |
| `color-danger` / `color-success` / `color-warning`           | Semantic colors, independent of the accent hue. Values: `#b3261e` / `#2e7d4f` / `#a6710a`.                                                                                                                                                                             |
| `color-disabled-bg` / `color-disabled-text`                  | Disabled-state colors. Values: `#e7ebea` / `#98a29f`. (Below the general body-text contrast minimum by design — WCAG exempts inactive UI components from the text-contrast requirement; the disabled _state_ itself, not color alone, communicates non-interactivity.) |
