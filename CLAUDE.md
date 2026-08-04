# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A React + TypeScript + Vite client application for a self-service printing kiosk (unattended document printing). Currently a clickable prototype: the full user journey works end-to-end against mock data (no hardware integrations, no automated tests — still explicitly out of scope per `docs/product-overview.md`). One exception: the QR upload method has a real, dev-only backend (`server/`) — see "Backend" below. Every other upload method (Email, Personal account) remains fully mocked in the frontend.

## Commands

- `npm run dev` — start the Vite dev server (HMR).
- `npm run build` — type-check (`tsc -b`) then production-build (`vite build`). Run this after any code change.
- `npm run lint` — oxlint.
- `npx prettier . --check` — verify formatting; `npm run format` (or `npx prettier . --write`) to fix.
- `npm run preview` — serve the production build locally.

There is no test runner/suite in this project — do not invent one.

## Backend (dev-only, QR upload)

`server/` is a small Express + TypeScript backend, wired into the same TS project-reference graph as the frontend (`tsconfig.server.json`, referenced from the root `tsconfig.json`) — `npm run build`/`npm run lint`/`npx prettier . --check` already cover it, no separate commands needed for verification.

- `npm run dev:server` — run the backend alone (`tsx watch server/index.ts`, port 3001).
- `npm run dev:all` — frontend + backend together (`concurrently`).
- In-memory only (`server/uploadStore.ts`) — no database, nothing survives a restart. Uploaded files land on disk under `server/uploads/<sessionId>/` (gitignored).
- `GET /api/config` returns the backend's auto-detected LAN IP, which the frontend embeds in the QR code so a phone (a separate device) can reach it — the frontend's own calls to the backend always use `localhost` (see `.env.example`, `VITE_API_BASE_URL`).
- This is intentionally a _dev-only_ backend (permissive CORS, no real auth) — matches `docs/product-overview.md`'s "production-ready backend" and "security hardening" being out of scope, not a contradiction of it. Format/size validation and real antivirus scanning are implemented, though (see below) — those aren't "hardening" so much as correctness/data-quality checks, and the AV-scanning open item had been unresolved since the project's earliest domain discovery.
- **File format/size limits** (`server/fileValidation.ts`): shared rule across every upload method — see `docs/domain/kiosk-session.md`, "File format and size limits."
- **Real antivirus scanning** (`server/uploadStore.ts`) via a local ClamAV daemon (`clamd`) over TCP — see `docs/qr-upload-requirements.md`, "File scanning status," and `README.md` for the one-time setup + how to start `clamd` before testing. Fails open (dev-only) if `clamd` isn't running.

## Documentation is the source of truth

`docs/` contains the confirmed product, domain, and design decisions this codebase implements. Before adding or changing behavior, check whether it's already settled there — most non-trivial decisions (session lifecycle, confirmation rules, popup behavior, component structure) were deliberately discussed and written down, not left to code-time judgment:

- `docs/product-overview.md` — product vision, scope, confirmed flow stages, open questions.
- `docs/domain/kiosk-session.md` — the canonical Kiosk Session domain model: lifecycle, Back/Cancel/End Session semantics, End Session visibility/confirmation rules, automatic inactivity timeout, popup placement rules, Cart/Print Order/Payment Order relationships. This is the single most-referenced doc from code comments.
- `docs/email-upload-requirements.md` — the confirmed Email upload flow and its simplifications.
- `docs/screens/*-spec.md` / `*-wireframes.md` — per-screen requirements and approved layout.
- `docs/design/component-library.md` — the full component inventory, each entry's purpose/structure/variants/open decisions.
- `docs/implementation/project-architecture.md` — the original architecture rationale (written when only the Welcome Screen existed; some folder/state claims in it are now superseded by what's described below, but the underlying reasoning — the two-consumer extraction rule — still governs the codebase).

Code comments frequently cite a specific doc/section instead of restating the reasoning — follow those references when in doubt.

## Architecture

**No router.** `src/App.tsx` is a composition root holding a single `Screen` union and one `useState<Screen>`, with a chain of `if (screen === '...') return <XScreen ... />`. There is no nesting/history — each screen component receives explicit navigation callbacks (`onBack`, `onHome`, etc.) that call `setScreen(...)` in `App.tsx`. Introduce React Router (or a richer state machine) only once the number of screens/URL needs genuinely justifies it.

**`src/App.tsx` owns all cross-screen state** (Kiosk Session, Cart, selected file, "used upload methods", etc.), passed down via props — no Context/Redux/Zustand. This is a deliberate consequence of the project's recurring rule: _shared state/abstractions are extracted only once at least two concrete consumers exist_, never speculatively. `App.tsx` is the natural owner once a second screen needs the same session/cart data.

**`src/layouts/KioskScreenLayout/`** is the shared shell every screen renders through: header (`BrandMark` + conditional `end-session`), an optional Back/Home row, the persistent footer (`PersistentActionBar`), and every cross-cutting popup — Cart, the End Session confirmation dialog, the "connection lost" notification, and the inactivity-warning notification. It was extracted from `WelcomeScreen`/`UploadMethodSelectionScreen` once a third screen needed the identical composition (the same two-consumer-extraction rule as above). Screens pass in `cartItems`, `onEndSession`, `onProceedToPayment`, etc.; `KioskScreenLayout` itself owns the popup open/closed state and the inactivity timer, calling back up into `App.tsx`'s handlers when something session-level actually needs to happen.

**Popups never cover the header/footer.** This is a specific, confirmed rule (`docs/domain/kiosk-session.md`): a popup (Cart, End Session confirmation, Notification) must leave the header/footer visible and usable. `src/components/Modal/` implements this by positioning itself `absolute` inside `KioskScreenLayout`'s `.content` (which is `position: relative`), not `fixed` to the viewport, and by not dimming the background. Any new popup should reuse `Modal` as its shell rather than rendering its own overlay.

**Feature-per-screen.** Each screen lives in its own folder under `src/features/<screen-name>/` (e.g. `features/email-upload/`, `features/payment-status/`), holding the screen component + its `.module.css`. Reusable, screen-agnostic components live under `src/components/<ComponentName>/`, one subfolder per component — a component only moves there once it's actually reused (or is a confirmed design-system primitive/composite per the component library), not preemptively.

**Session lifecycle nuances that shape the code:**

- End Session ("Finish and clear data") shows a confirmation dialog only if the Cart is non-empty; an empty session ends immediately.
- Ending a session is a two-step transition: `App.tsx` switches to an `EndingSessionScreen` (no header/footer/Cart — nothing is actionable) immediately, then after a fixed prototype delay actually clears session/cart/etc. state and returns to Welcome.
- `sessionId` (only the id — nothing else) is persisted to `localStorage` so an active session survives a page reload; this is intentionally _not_ a full state restore (screen/cart are not persisted), per the confirmed "no smart session restore" decision.
- The automatic inactivity timeout (5 min idle → 1 min warning → auto End Session) lives inside `KioskScreenLayout` and is gated on the `sessionActive` prop, so it's naturally suspended on screens that pass `sessionActive={false}` (Payment/Print Status, where End Session is blocked anyway because a transaction is committed).
- Any handler passed to `KioskScreenLayout` as `onEndSession` must have a stable identity (wrap in `useCallback`) since the inactivity-timer `useEffect` depends on it.

**Mock/prototype conventions:** every simulated backend outcome (email arrival, payment, printing) is a manual "Simulate ..." button rather than a real async call — this is intentional scaffolding, not a stand-in that needs immediate replacement. Comments mark these clearly; keep that pattern for any new simulated flow.

**Naming:** interactive element `id`s use kebab-case and are treated as part of the confirmed spec (e.g. `end-session`, `navigation-back`, `upload-method-email`, `btn-cart`) — check `docs/design/component-library.md` and the screen specs before inventing a new one. Components are PascalCase; CSS Modules are colocated per component/screen with design tokens (`src/styles/tokens.css`) consumed as CSS custom properties (`var(--space-m)`, etc.) — token _values_ are still placeholders pending real Design System sign-off, but token _names_ are stable.
