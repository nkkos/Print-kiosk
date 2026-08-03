# Welcome Screen — Low-Fidelity Wireframe Concepts

Internal project document. Explores low-fidelity layout options for the Welcome Screen's main content area, based only on requirements confirmed in `docs/welcome-screen-requirements.md` and `docs/screens/welcome-screen-spec.md`. No colors, typography, or branding decisions are made here. All three concepts originally shared the same header (logo + promo slot, top-left) and the same undivided persistent footer (language switch, help, tariffs, login, call operator); they differed only in how the three service cards (Print, Scan, Copy) are arranged in the main content area. **Concept A was selected and its header/footer arrangement was subsequently refined per feedback** — see the "Refinement per feedback" note under Concept A, and the later "Kiosk Session update" note reflecting the introduction of the Kiosk Session domain model (`docs/domain/kiosk-session.md`). Concepts B and C are shown in their original, unrefined form for comparison purposes.

---

## Concept A — Equal Trio (selected, refined per feedback)

### ASCII wireframe

```
+----------------------------------------------------------------------------+
| [LOGO]                                                    [Finish and     |
|                                                             clear data]    |
|                                                                            |
|      +----------------+   +----------------+   +----------------+         |
|      |                |   | - - - - - - -  |   | - - - - - - -  |         |
|      |     PRINT      |   |     SCAN       |   |     COPY       |         |
|      |                |   | (coming soon)  |   | (coming soon)  |         |
|      +----------------+   +----------------+   +----------------+         |
|                                                                            |
|                                                                            |
+----------------------------------------------------------------------------+
| [Call Operator] [Help] [Tariffs]           [Account] [Cart] [Language]     |
+----------------------------------------------------------------------------+
```

(`Finish and clear data` is shown only while a Kiosk Session is active — see the "Kiosk Session update" note below. When no session is active, the top-right corner is empty.)

### Layout rationale

- **Primary action position:** Print sits in the leftmost of three equally sized, equally spaced slots, matching natural left-to-right reading order, but without any size advantage over Scan or Copy.
- **Visual hierarchy:** Flat. All three functions read as siblings of equal importance, mirroring the product framing of "three key functions" of the kiosk.
- **Touchscreen convenience:** Three evenly sized, evenly spaced large targets are easy to scan and tap without requiring the user to judge relative importance first; consistent spacing reduces accidental taps on the wrong neighbor.
- **Possible drawbacks:** Because only Print is active today, equal visual weight may invite first-time users to tap Scan or Copy before noticing they are disabled. The layout gives no visual cue about which function is actually available right now.

### Component mapping

The three approved service boxes (`PRINT`, `SCAN`, `COPY`) map to instances of the reusable `ServiceCard` component defined in the UI Component Library: `service-print`, `service-scan`, and `service-copy`. This is a naming/component mapping only — no implementation detail beyond it is introduced here, and the approved layout above is unchanged.

### Refinement per feedback

- **Footer grouping:** The footer is split into two groups instead of one undifferentiated row. The left group (Call Operator, Help, Tariffs) contains reference/support actions that don't depend on who is using the kiosk. The right group (Login, Language) contains actions tied to the individual user's session/preferences. This grouping gives the footer a clearer mental model without adding, removing, or resizing any control.
- **Promo slot relocation:** The promo icon slot moves from beside the logo (top-left) to the top-right corner. The logo now occupies the top-left corner on its own. This avoids an empty-looking gap next to the logo when no promotion is active, and places the reserved slot in a distinct corner rather than crowding the brand mark.

### Kiosk Session update

Following the introduction of the Kiosk Session domain model (`docs/domain/kiosk-session.md`), two further changes supersede the refinement above:

- **The top-right corner is now "Finish and clear data" (End Session)**, not the promo slot. It is shown only while a Kiosk Session is active (logged in, or an anonymous session still active after returning via Back), and hidden otherwise.
- **The promo slot no longer occupies any layout space.** A promotion, if active, is presented as a popup at the start of a session instead of a persistent header icon — so the corner conflict between Promo and End Session is resolved by removing Promo from the layout entirely, not by relocating it further.
- **Footer right group updated:** Login is renamed/generalized to Account, and a Cart icon is added between Account and Language — right group is now Account, Cart, Language (previously Login, Language).

---

## Concept B — Primary Emphasis

### ASCII wireframe

```
+----------------------------------------------------------------------------+
| [LOGO] [promo]                                                             |
|                                                                            |
|                     +----------------------------------+                   |
|                     |                                  |                   |
|                     |              PRINT               |                   |
|                     |                                  |                   |
|                     +----------------------------------+                   |
|                                                                            |
|        +----------------+                   +----------------+             |
|        | - - - - - - -  |                   | - - - - - - -  |             |
|        |     SCAN       |                   |     COPY       |             |
|        | (coming soon)  |                   | (coming soon)  |             |
|        +----------------+                   +----------------+             |
+----------------------------------------------------------------------------+
| [Language]  [Help]  [Tariffs]                    [Login]  [Call Operator]  |
+----------------------------------------------------------------------------+
```

### Layout rationale

- **Primary action position:** Print is larger, centered, and placed above Scan and Copy, establishing a clear "start here" focal point that matches the current product state, where only Print is active.
- **Visual hierarchy:** Strong. Size and position immediately communicate that Print is the primary action, while Scan and Copy read as smaller, secondary/future items.
- **Touchscreen convenience:** A larger primary target reduces the chance of missing the only working function; the secondary buttons remain large enough to be legible as "present but disabled."
- **Possible drawbacks:** Once Scan and Copy become active, this hierarchy would imply Print is still more important than the other two, which no longer matches the intended "three key functions" framing — the layout would likely need to be reworked at that point.

---

## Concept C — Vertical Stack

### ASCII wireframe

```
+----------------------------------------------------------------------------+
| [LOGO] [promo]                                                             |
|                                                                            |
|                        +----------------------------+                      |
|                        |            PRINT            |                      |
|                        +----------------------------+                      |
|                        | - - - - - - - - - - - - -  |                      |
|                        |     SCAN (coming soon)      |                      |
|                        +----------------------------+                      |
|                        | - - - - - - - - - - - - -  |                      |
|                        |     COPY (coming soon)      |                      |
|                        +----------------------------+                      |
|                                                                            |
+----------------------------------------------------------------------------+
|        [Language]   [Help]   [Tariffs]   [Login]   [Call Operator]         |
+----------------------------------------------------------------------------+
```

### Layout rationale

- **Primary action position:** Print appears at the top of a vertical stack, relying on top-to-bottom reading order to imply priority.
- **Visual hierarchy:** Weak/implicit. All three buttons share the same width, so hierarchy comes only from vertical order, not size — similar in strength to Concept A, weaker than Concept B.
- **Touchscreen convenience:** A vertical column can suit a user standing directly in front of the kiosk without needing to reach sideways, but it concentrates all three targets into a narrow central band.
- **Possible drawbacks:** Poor use of the confirmed landscape orientation and reference resolution (2880×1800) — large areas on the left and right remain empty with no defined purpose. Priority is also communicated more subtly than in Concept B, which may be less clear at a glance.

---

## Comparison and recommendation

|                                         | Concept A — Equal Trio | Concept B — Primary Emphasis            | Concept C — Vertical Stack |
| --------------------------------------- | ---------------------- | --------------------------------------- | -------------------------- |
| Matches "three key functions" framing   | Yes                    | No (implies lasting priority for Print) | Yes                        |
| Needs rework once Scan/Copy are enabled | No                     | Likely                                  | No                         |
| Uses landscape orientation well         | Yes                    | Yes                                     | No                         |
| Communicates "only Print works today"   | Weakly                 | Strongly                                | Weakly                     |
| Touch target size/consistency           | Equal, large           | Print largest, others smaller           | Equal, large               |

**Recommendation: Concept A — Equal Trio.**

It matches the confirmed product framing of three equally-ranked core functions, makes full use of the confirmed landscape orientation, and keeps all three touch targets large and consistent, in line with the confirmed accessibility requirements. Its main trade-off is that it does not strongly spotlight Print as the only active function today — that gap is already partly addressed at the wireframe level by the disabled/"coming soon" treatment of Scan and Copy, and any further emphasis (visual styling of the disabled state) is a design decision outside the scope of this wireframe exercise. Concept B communicates current state more clearly but would likely require rework once Scan and Copy launch. Concept C does not make good use of the confirmed landscape display and is not recommended.
