# Project Architecture — First Milestone

Internal project document. Designs the code organization for implementing the approved Welcome Screen. Grounded in `docs/product-overview.md`, the Welcome Screen requirements/specification/wireframe, `docs/design/design-system.md`, and `docs/design/component-library.md`. No code is written here — this document only decides where code will live and why.

---

# 1. Goals

The current milestone is a 7-day clickable prototype of a single screen (Welcome Screen), built with React + TypeScript + Vite, using mock data. The architecture must:

- Let the Welcome Screen be built entirely from already-approved, already-specified components — nothing here invents new UI.
- Keep the footprint small enough to build in days, not weeks: no state library, no router, no CSS framework installation.
- Apply one consistent rule everywhere a folder or abstraction is considered: it exists only once at least two concrete use cases justify it — never on a prediction about future screens. With one screen, that means the persistent header/footer, its overlays, language, and login all stay owned by the Welcome feature; extracting them into a shared layer is deferred until a second screen is an actual, not predicted, consumer.
- Leave every deferred component (from Component Library §21/§22) with no folder, no file, and no placeholder — they are added when a screen actually needs them.

---

# 2. Architectural principles

- **Composition over inheritance.** Screens and layouts are assembled from small components; nothing is built via component subclassing or shared base classes.
- **Stateless UI where possible.** Presentational components (`Button`, `IconButton`, `ServiceCard`, `StatusBadge`, `BrandMark`) receive everything via props and hold no state of their own.
- **Business logic separated from presentation.** Anything that decides _what_ is true (is the printer available? which overlay is open?) lives in a small hook or the owning screen/layout — never inside a presentational component.
- **Reusable UI components live in one place.** Every component defined in the Component Library lives under `src/components/`, regardless of which screen currently uses it.
- **Feature-driven growth.** Each confirmed flow stage (Welcome, Service selection, Document upload, ...) becomes its own folder under `src/features/` when it is actually built — not before.
- **Avoid premature abstraction.** Where the Component Library already deferred a component (Panel as a public component, OptionCard, TextField, etc.), this architecture also defers it — no placeholder file, no empty folder.

---

# 3. Proposed folder structure

```
print-kiosk/
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── styles/
    ├── types/
    ├── components/
    └── features/
        └── welcome/
```

- **`src/main.tsx`, `src/App.tsx`, `src/index.css`** — already exist from the Vite scaffold. `App.tsx` becomes the composition root (today: renders `WelcomeScreen` directly); no new top-level `app/` folder is introduced, since that would just duplicate what these two files already do.
- **`src/styles/`** — exists because the Design System already defines a named token vocabulary (`space-xs`…`space-xl`, `radius-small`…`radius-large`, etc.) that needs one shared home before any component can reference it. Only token definitions and the smallest possible base reset belong here. Component-specific styling must never be placed here.
- **`src/types/`** — exists because a handful of small shared shapes (service identity/status, overlay kind) already have more than one concrete consumer inside the Welcome feature itself (see Section 5) and must not be redefined in each. Only cross-cutting shared types belong here; a type used by exactly one component stays next to that component.
- **`src/components/`** — exists because several approved components already have more than one concrete consumer _within the Welcome Screen itself_ today (`ServiceCard` ×3, `IconButton` ×5, `Modal` ×4, `StatusBadge` ×2), and the rest are individually classified as reusable design-system components in the Component Library, independent of current call count. Every approved component (Section 5) belongs here, one subfolder each. Screen-specific composition must never be placed here.
- **`src/features/welcome/`** — exists because it is the only screen being built. It owns everything specific to today's single screen: the three services, the hardware-unavailable condition, idle behavior, **and** the persistent header/footer composition and the state its controls need (overlay open/closed, selected language, login placeholder). None of this is split out into a separate layout layer yet, since there is currently only one consumer of that shell — exactly one, not the two needed to justify a separate `layouts/` directory (see the rejected-folders list below).

Folders intentionally **not** created yet, and why:

- `app/` — would duplicate `App.tsx`/`main.tsx`.
- `layouts/` — the persistent header/footer shell is confirmed (by the Design System) to be needed by every future screen, but "confirmed for the future" is not the same as "two concrete consumers today." Exactly one screen exists, so the shell composition and its state stay inside `features/welcome/` for now. Extract `layouts/` the moment a second screen needs the same shell — at that point there genuinely are two consumers, and the move is a small, mechanical refactor (see Section 11).
- `hooks/` — no hook is shared by more than one feature yet; any hook needed now is colocated with its owner (see Section 7). Introduce this folder only once a second feature needs the same hook.
- `assets/` — no real image/icon file exists yet (branding is unconfirmed); `BrandMark`'s placeholder needs no image file. Introduce this folder only when a real asset file is added.
- `utils/` — no shared utility function is needed yet; a one-off helper, if any, stays next to its use site.
- Anything for a component the Component Library already deferred (`OptionCard`, `TextField`, `Select`, `Checkbox`, `RadioGroup`, generic `Card`, `LoadingIndicator`, `ProgressIndicator`, `StepIndicator`, `Divider`) or for a screen other than Welcome.

---

# 4. src/

| Folder        | Purpose                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `styles/`     | Design token definitions (as CSS custom properties) and the base global reset. One file to start: `tokens.css`, imported by the existing `index.css`.               |
| `types/`      | The small set of shared TypeScript types used across more than one component or feature (service identity/status, overlay kind).                                    |
| `components/` | Every approved, globally reusable UI component from the Component Library — one subfolder per component, each containing its component file and its own CSS Module. |
| `features/`   | One subfolder per confirmed flow stage that has actually been built. Today: only `welcome/`, which also owns the persistent header/footer shell (see Section 3).    |

`components/`, `hooks/`, `layouts/`, `styles/`, `types/`, `utils/`, `assets/` were all considered, per the prompt's example list; only the ones with a concrete need _today_ (`components/`, `styles/`, `types/`) are included. `layouts/` is deliberately excluded until a second screen exists — see the rejected-folders list in Section 3.

---

# 5. Component ownership

| Component             | Lives in                              | Why                                                                                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ServiceCard`         | `src/components/ServiceCard/`         | Defined in the Component Library as a global composite, not Welcome-Screen-only markup — even though only the Welcome Screen uses it today.                                                                                                                                                                   |
| `Button`              | `src/components/Button/`              | Global primitive; used inside `Modal` content and `Notification` actions.                                                                                                                                                                                                                                     |
| `IconButton`          | `src/components/IconButton/`          | Global primitive; used by every control inside `PersistentActionBar`.                                                                                                                                                                                                                                         |
| `Notification`        | `src/components/Notification/`        | Global composite; the component itself is generic, even though its one confirmed use (hardware-unavailable) is triggered from the Welcome feature today.                                                                                                                                                      |
| `Modal`               | `src/components/Modal/`               | Global composite shell; hosts the four temporary panels (Language/Help/Tariffs/Login).                                                                                                                                                                                                                        |
| `PersistentActionBar` | `src/components/PersistentActionBar/` | Global composite; rendered once, inside `WelcomeScreen`'s header/footer composition — not duplicated per screen even though only one screen renders it today.                                                                                                                                                 |
| `BrandMark`           | `src/components/BrandMark/`           | Global primitive; rendered once, inside `WelcomeScreen`'s header composition.                                                                                                                                                                                                                                 |
| `PromoAction`         | `src/components/PromoAction/`         | Global composite; **revised** — no longer part of the header composition. Presented as a popup at the start of a Kiosk Session if a promotion is active (see `docs/domain/kiosk-session.md`); not required while no promotion exists.                                                                         |
| `StatusBadge`         | `src/components/StatusBadge/`         | Global primitive; used inside `ServiceCard` for the "Coming soon" label.                                                                                                                                                                                                                                      |
| `Panel`               | _(no file yet)_                       | Component Library keeps this internal to `Modal`/`Notification` until a second, independent reuse is confirmed. For this milestone, the small shared structure is written directly inside `Modal` and `Notification` rather than extracted — extract it the moment a third consumer needs the same structure. |

Everything else in the Component Library (`TextField`, `OptionCard`, `Select`, `Checkbox`, `RadioGroup`, generic `Card`, `LoadingIndicator`, `ProgressIndicator`, `StepIndicator`, `Divider`, Navigation controls) has no folder yet, matching Component Library §22.

---

# 6. Screen ownership

Only one screen exists in this milestone:

- **`WelcomeScreen`** — lives in `src/features/welcome/`. Since it is currently the only screen, it owns everything today, split into two composition concerns within the same feature folder:
  - **Its own content:** the three `ServiceCard` instances (`service-print`, `service-scan`, `service-copy`), their statuses, the hardware-unavailable condition and its `Notification`, and idle behavior.
  - **The persistent shell:** the header (`BrandMark`, plus `end-session` when a Kiosk Session is active) and footer (`PersistentActionBar`) composition, the four temporary panels they trigger, and the state those controls need (overlay open/closed, selected language, login placeholder, Kiosk Session state). `PromoAction` is no longer part of this header composition — see `docs/domain/kiosk-session.md`. This part is written so it can be lifted out wholesale once a second screen needs the same shell — see Section 11 — but it is not pre-emptively extracted into its own folder today, since there is only one consumer.

Future screens (Service selection, Document upload, Document preview, Print settings, Price calculation, Payment, Job queue / printing status, Order collection) will each become a sibling folder under `src/features/` when they are actually specified and built. None is invented or scaffolded now.

---

# 7. State ownership

No state management library is introduced. Everything below is plain React state (`useState`), owned as close as possible to where it is used, and passed down via props.

| State                                                    | Owned by                | Why here                                                                                                                                                                                                            |
| -------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which overlay is open (Language/Help/Tariffs/Login/none) | `src/features/welcome/` | The only current consumer of both the trigger buttons (`PersistentActionBar`) and the overlay (`Modal`) is `WelcomeScreen` itself — one consumer, not the two needed to justify pulling this into a separate layer. |
| Selected language                                        | `src/features/welcome/` | Same reasoning: today, only the Welcome Screen exists to display it.                                                                                                                                                |
| Login state placeholder (logged in/out; no real auth)    | `src/features/welcome/` | Same reasoning as language.                                                                                                                                                                                         |
| Hardware-unavailable mode                                | `src/features/welcome/` | Only specified for the Welcome Screen today; drives `service-print`'s status and its `Notification`.                                                                                                                |
| Idle / idle-wake state                                   | `src/features/welcome/` | The confirmed idle behavior (backlight off, wake on input, 3-minute auto-logout) is currently specified only for the Welcome Screen.                                                                                |
| `service-scan` / `service-copy` status                   | Not state               | Both are static `coming-soon` for the entire milestone — a constant, not something that changes at runtime.                                                                                                         |

Context, Redux, Zustand, and MobX are not introduced: the component tree is shallow (one screen, a few components), so `useState` plus props fully covers every confirmed need. All of the state above is owned by `WelcomeScreen` (or a hook it calls) for the same reason no `layouts/` folder exists yet: there is only one consumer. Revisit this — likely by extracting a `layouts/` shell that owns the overlay/language/login state — once a second screen actually needs the same persistent controls, not before.

---

# 8. Styling strategy

| Approach                               | Fit for this project                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSS Modules**                        | Ships with Vite out of the box — no install, no config, no `package.json` change. Scopes styles per component, matching the component-by-component structure in Section 3. Plain CSS syntax, so no new syntax to learn beyond what's needed. Maps directly onto the Design System's named tokens via CSS custom properties.                                       |
| Plain global CSS                       | No scoping — class name collisions become likely as more components are added; harder to keep "what belongs to which component" clear as the app grows.                                                                                                                                                                                                           |
| Tailwind CSS                           | Requires installing and configuring a dependency (against this task's constraints, and against "avoid over-engineering" for a 7-day prototype); its utility-class model doesn't map cleanly onto the already-named token vocabulary (spacing scale, radius scale) the Design System already defined — that mapping would have to be rebuilt as a Tailwind config. |
| CSS-in-JS (styled-components, emotion) | Requires installing a runtime dependency and adds a rendering/runtime cost that isn't justified for a small prototype.                                                                                                                                                                                                                                            |

**Chosen: CSS Modules**, with one shared `src/styles/tokens.css` defining the Design System's named tokens as CSS custom properties (e.g., a `--space-m` variable), and one `ComponentName.module.css` colocated with each component in `src/components/` and `src/features/welcome/`. Token _values_ stay provisional/placeholder until the Design System's "To be defined" items are resolved — only the token _names_ need to exist now.

---

# 9. Routing strategy

**Not needed for this milestone.** Only one screen exists, and `service-print` navigating to "Service selection" cannot be built yet, since that screen doesn't exist and inventing it is out of scope.

Temporary behavior: `App.tsx` renders `<WelcomeScreen />` directly — there is nothing to route between. Activating `service-print` for now does nothing beyond whatever minimal, clearly-temporary placeholder feedback is implemented (e.g., a console log), since its real destination isn't built yet.

React Router (or a lighter hand-rolled "current screen" switch) is deferred until a second screen actually exists — that decision isn't made now, to avoid choosing a routing approach before there's a second route to justify it.

---

# 10. Mock data strategy

No mock-server or fixtures library is introduced. Three different needs, three different (small) treatments:

- **Static placeholder text** (the "clearly marked placeholder content" required inside the Language/Help/Tariffs/Login temporary panels) — written directly inline in the panel's JSX. There is no shape or structure to this data yet, so a separate mock file would only add indirection.
- **The hardware-unavailable condition** — held behind a small hook (e.g., a `useWelcomeScreen`-style function) owned by `src/features/welcome/`, which exposes just the derived status (`available` / `unavailable`) that `ServiceCard`/`Notification` need. The mock source _inside_ that hook can be a hardcoded value today and be replaced by a real hardware-agent call later without changing `WelcomeScreen` or any component that consumes the hook.
- **`service-scan` / `service-copy`** — a constant, not mock "data" at all, since their `coming-soon` status never changes this milestone.

---

# 11. Future scalability

Nothing above needs to change shape to support the rest of the confirmed flow — only grow:

- **The moment a second screen is added**, the persistent header/footer composition and its state (overlay/language/login) move out of `features/welcome/` into a new `src/layouts/` folder — at that point there are genuinely two consumers, which is exactly the trigger this document uses everywhere else. This is a mechanical extraction (move the shell composition and its `useState` calls into a new component, have both screens render through it), not a redesign of `components/` or of either feature.
- **Print flow, Upload methods, Job queue, Payment, Completion (Order collection)** each become a new sibling folder under `src/features/` (e.g., `features/service-selection/`, `features/document-upload/`, `features/job-queue/`), each reusing the (by then extracted) `layouts/` shell unchanged and drawing on `components/` for anything already built (`Button`, `Modal`, `Notification`, `StatusBadge`) plus whatever new component that stage justifies (e.g., `OptionCard` for upload-method selection, `TextField` for a form field, `LoadingIndicator` for the job-queue stage) — all already anticipated, but deferred, in the Component Library.
- Once a second screen exists, `src/App.tsx` gains a small "current screen" mechanism — a router if the number of screens/URL needs justify it, or a simple switch otherwise; this is a local decision at that point, not a restructuring of `components/` or existing features.
- If the overlay/language/login state ever needs to be read deep inside a future feature (not just from the shared layout itself), lifting it into a small Context at that point is a contained change — it does not require touching `components/` or other features.
- `src/hooks/`, `src/utils/`, and `src/assets/` are added the moment a second feature actually needs to share a hook, a helper, or a real asset file — the folder boundary in Section 3 already anticipates them without creating them early.

---

# 12. Initial implementation roadmap

1. **Project shell** — `src/styles/tokens.css` (token names, placeholder values) wired into the existing `index.css`; confirm `App.tsx`/`main.tsx` still boot cleanly.
2. **Reusable primitives** — `Button`, `IconButton`, `StatusBadge`, `BrandMark`, built and visually checked in isolation.
3. **Reusable composites** — `ServiceCard`, `Modal`, `Notification`, `PersistentActionBar`, built on top of the primitives above. (`PromoAction` is deferred — no active promotion exists yet; see `docs/domain/kiosk-session.md`.)
4. **`WelcomeScreen`'s persistent shell** — `BrandMark` and `end-session` in the header, `PersistentActionBar` in the footer, the four temporary Modal panels wired to the footer's triggers, overlay/language/login/Kiosk Session state added — all inside `features/welcome/`.
5. **`WelcomeScreen`'s own content** — the three `ServiceCard` instances wired to their (mock) statuses.
6. **Hardware-unavailable state** — the mock toggle, `service-print` → `unavailable`, and the `Notification` popup wired together.
7. **Idle / idle-wake behavior** — the low-power visual state and its wake handlers for the Welcome Screen.
8. **Polish pass** — revisit once real token values/typography are approved; accessibility and reference-resolution check.

No implementation happens as part of this document.
