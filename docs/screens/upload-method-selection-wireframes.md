# Upload Method Selection Screen — Low-Fidelity Wireframe Concepts

Internal project document. Explores low-fidelity layout options for the Upload Method Selection Screen, based only on `docs/upload-method-requirements.md` and `docs/screens/upload-method-selection-spec.md`, and reusing the header/footer conventions already established in `docs/screens/welcome-screen-wireframes.md`. No colors, typography, icons, branding, shadows, gradients, or animations are chosen here. Both concepts originally shared the same confirmed header (`BrandMark` top-left, `PromoAction` slot top-right) and the same confirmed persistent footer (Call Operator, Help, Tariffs — left group; Login, Language — right group); they differed only in how `navigation-back`, the instructional text, and the six `OptionCard` entries are arranged in the main content area. **Concept A was selected** — see the "Kiosk Session update" note under Concept A for the header/footer changes made since selection, following the introduction of the Kiosk Session domain model (`docs/domain/kiosk-session.md`). Concept B is shown in its original, unrefined form for comparison purposes.

---

## Concept A — 3×2 Grid (selected)

### ASCII wireframe

```
+------------------------------------------------------------------------------+
| [LOGO]                                                    [Finish and       |
|                                                             clear data]      |
| [ Back ] [ Home ]                                                            |
|                                                                              |
|              Select how you'd like to upload your document                  |
|                            for printing                                     |
|                                                                              |
|   +---------------+   +---------------+   +---------------+                |
|   |   QR code   * |   |     Email     |   |    Telegram   |                |
|   |               |   |               |   |               |                |
|   | Use your      |   | Send your     |   | Use the bot   |                |
|   |   phone       |   |   file        |   |               |                |
|   +---------------+   +---------------+   +---------------+                |
|                                                                              |
|   +---------------+   +---------------+   +---------------+                |
|   |  Personal     |   |   Web page    |   |   USB drive   |                |
|   |  account      |   |               |   |               |                |
|   | Your saved    |   | Open online   |   | Connect your  |                |
|   |   files       |   |               |   |   drive       |                |
|   +---------------+   +---------------+   +---------------+                |
|                                                                              |
+------------------------------------------------------------------------------+
| [Call Operator] [Help] [Tariffs]           [Account] [Cart] [Language]       |
+------------------------------------------------------------------------------+
```

(The `*` on QR code is illustrative only — the "used this session" marker, shown once a method has been used at least once; see the "Kiosk Session update" note below.)

### Layout rationale

- **`navigation-back` placement:** Its own standalone row, left-aligned, directly below the header and above the instructional text — the first thing encountered after the header, independent of the footer, matching the confirmed requirement that it is a standalone main-flow action rather than a footer control.
- **Card grouping:** Six cards in two even rows of three (3×2), mirroring the equal-size, equal-spacing treatment already established for the Welcome Screen's service cards — no method reads as more or less important than another.
- **Visual scanning:** Left-to-right, top-to-bottom — a natural reading order across two short rows, so the user's eye covers all six options quickly without needing to track a long list.
- **Touch targets:** Two rows leaves ample vertical room per card for a large touch target and both lines of text (title + description), consistent with the confirmed large-touch-target requirement.
- **Footer separation:** The footer sits in its own bordered band at the bottom, visually distinct from the card grid above it, matching the confirmed requirement that footer popups never interrupt the method-selection task.
- **No scrolling:** Two rows of cards plus a header row and a footer row comfortably fit the confirmed landscape reference display without needing to stack additional rows.
- **Possible drawbacks:** With six equally-weighted cards and no visual hierarchy, a first-time user has no cue about which method might be fastest or most common — though this is consistent with the confirmed requirement that all six remain on equal footing.

### Kiosk Session update

Following the introduction of the Kiosk Session domain model (`docs/domain/kiosk-session.md`), the header/footer are updated from the original comparison above:

- **Header:** the top-right `[promo]` slot is removed — a promotion, if active, is now a popup at session start, not a persistent header icon. "Finish and clear data" (End Session) takes the top-right corner instead, shown since a Kiosk Session already exists by the time this screen is reached.
- **A second standalone action, Home, is added next to Back** — both are shown together; on this screen they reach the same destination (Welcome Screen), but are confirmed as distinct actions.
- **Footer right group updated:** Login is renamed/generalized to Account, and a Cart icon is added — right group is now Account, Cart, Language (previously Login, Language).
- **Each method card may show a "used this session" marker** (illustrated above as `*` on QR code) once that method has been used at least once during the current session.

---

## Concept B — 2×3 Grid

### ASCII wireframe

```
+------------------------------------------------------------------------------+
| [LOGO]                                                              [promo] |
|                                                                              |
| [ Back ]      Select how you'd like to upload your document for printing    |
|                                                                              |
|              +----------------+   +----------------+                        |
|              |    QR code     |   |     Email      |                        |
|              | Use your phone |   | Send your file  |                       |
|              +----------------+   +----------------+                        |
|                                                                              |
|              +----------------+   +----------------+                        |
|              |    Telegram    |   | Personal account|                       |
|              |  Use the bot   |   | Your saved files|                       |
|              +----------------+   +----------------+                        |
|                                                                              |
|              +----------------+   +----------------+                        |
|              |   Web page     |   |   USB drive     |                       |
|              |  Open online   |   | Connect your drive|                     |
|              +----------------+   +----------------+                        |
|                                                                              |
+------------------------------------------------------------------------------+
| [Call Operator] [Help] [Tariffs]                    [Login] [Language]      |
+------------------------------------------------------------------------------+
```

### Layout rationale

- **`navigation-back` placement:** Inline with the instructional text row, left-aligned at the same vertical position as the header text, rather than occupying its own separate row — a more compact alternative that keeps the top of the screen to a single line.
- **Card grouping:** Six cards in three even rows of two (2×3) — a narrower, taller grouping centered in the middle of the screen rather than spanning its full width.
- **Visual scanning:** Top-to-bottom in a single narrow column pair — closer to reading a short list than scanning a grid; the user's eye travels vertically down the middle of the screen.
- **Touch targets:** Each card can be as wide as needed within the two-column band, but three rows leave less vertical headroom per card than Concept A's two rows, for the same overall content height.
- **Footer separation:** Same bordered footer band as Concept A, equally distinct from the content above it.
- **No scrolling:** Three rows still fit the confirmed landscape display without scrolling, but with less vertical margin than Concept A, since more rows share the same available height.
- **Possible drawbacks:** A 2×3 grouping leaves the wide landscape display's left and right areas empty, making poor use of the confirmed landscape orientation — the same drawback noted for the rejected vertical-stack concept in the Welcome Screen wireframes. Inline placement of `navigation-back` next to the instructional text also risks the two competing for the same visual "first line," rather than Back reading clearly as its own action.

---

## Comparison table

|                              | Concept A — 3×2 Grid                          | Concept B — 2×3 Grid                                     |
| ---------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| Scanability                  | Fast — two short rows, left-to-right          | Slower — three rows read like a list                     |
| Touch-target size            | More vertical room per card (2 rows)          | Less vertical room per card (3 rows)                     |
| Use of landscape space       | Uses the full width well                      | Leaves both sides empty; poor use of landscape width     |
| Clarity of `navigation-back` | Clear, standalone row of its own              | Shares a row with the instructional text — less distinct |
| Footer separation            | Clear, bordered band                          | Clear, bordered band (equal to Concept A)                |
| Risk of crowding             | Low — six cards spread across a wide row pair | Moderate — three stacked rows in a narrower band         |
| Future adaptability          | Extra methods would need a new row (easy)     | Extra methods would need a new row (deeper column)       |

## Recommendation

**Concept A — 3×2 Grid** is recommended for the current prototype. It makes full use of the confirmed landscape orientation (unlike Concept B, which leaves both side margins empty), gives `navigation-back` its own unambiguous position separate from both the header text and the footer, and leaves more vertical space per card for the confirmed large-touch-target requirement. Concept B is a workable alternative but repeats the same landscape-underuse drawback already identified and rejected for the Welcome Screen's vertical-stack concept, and its inline Back placement is less clearly distinguishable from the instructional text. This recommendation is based on the confirmed requirements (landscape display, no scrolling, large touch targets, `navigation-back` as a standalone action) rather than any aesthetic preference.

# Terminology

- `navigation-back` is used throughout for the Back action, per the approved specification.
- `OptionCard` is used for the six upload-method entries, per the Component Library (Section 17).
- `ServiceCard` is not renamed and is not used here — it remains reserved for the kiosk's core services (Print, Scan, Copy).
- No `ProcedureCard` or `FlowCard` terminology is introduced.
