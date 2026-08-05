# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A React + TypeScript + Vite client application for a self-service printing kiosk (unattended document printing). Currently a clickable prototype: the full user journey works end-to-end against mock data (no hardware integrations, no automated tests — still explicitly out of scope per `docs/product-overview.md`). Real backend (`server/`) exceptions so far: QR and Email upload — see "Backend" below — and the full account lifecycle (real accounts/bcrypt-hashed passwords, login, registration, email verification, password reset, change-password — kiosk login/forgot-password plus a separate minimal portal, `portal/`, for the rest; see "Backend" and `docs/personal-account-requirements.md`). My files/My orders within Personal Account, Cart, Payment, and Print remain mocked in the frontend.

## Commands

- `npm run dev` — start the Vite dev server (HMR).
- `npm run build` — type-check (`tsc -b`) then production-build (`vite build`). Run this after any code change.
- `npm run lint` — oxlint.
- `npx prettier . --check` — verify formatting; `npm run format` (or `npx prettier . --write`) to fix.
- `npm run preview` — serve the production build locally.

There is no test runner/suite in this project — do not invent one.

## Backend (QR + Email upload)

`server/` is a small Express + TypeScript backend, wired into the same TS project-reference graph as the frontend (`tsconfig.server.json`, referenced from the root `tsconfig.json`) — `npm run build`/`npm run lint`/`npx prettier . --check` already cover it, no separate commands needed for verification. Runs locally for development (`npm run dev:server`/`dev:all`) and can also be deployed to Railway (`npm start`) — see `README.md`, "Deploying to Railway," for the full setup (three services: `backend` + a managed Postgres + a `clamav` Docker-image service, reached over Railway's private network).

- `npm run dev:server` — run the backend alone (`tsx watch server/index.ts`, port 3001).
- `npm run dev:all` — frontend + backend together (`concurrently`).
- `npm start` — production entrypoint (`tsx server/index.ts`, no watch) — what Railway's `backend` service runs.
- **Real database**: Postgres via Drizzle ORM (`server/db/schema.ts`, `server/db/client.ts`, migrations in `server/db/migrations/`) — see `README.md`, "Database," for local Docker setup. Migrations run automatically on boot (`server/index.ts`). `server/uploadStore.ts`/`server/emailStore.ts` are DB-backed (QR/Email upload records survive restarts/redeploys now); `kiosk_sessions`/`print_orders`/`payment_orders` tables exist for later phases (real payments, real per-account files/orders) but aren't wired into the frontend yet — Cart/Payment/Print and My files/My orders remain mocked until those phases land. Uploaded files (QR and Email attachments alike) still land on disk under `server/uploads/<sessionId-or-email-prefix>/` (gitignored) — a Railway volume is needed there for the files themselves to survive a redeploy (the DB records survive regardless).
- **Real accounts**: `accounts` + `account_tokens` tables + `server/accountStore.ts`, used by six routes in `server/routes.ts` (`register`/`login`/`verify-email`/`request-password-reset`/`reset-password`/`change-password`) — bcrypt-hashed passwords (`bcryptjs`), rate-limited login/register (`express-rate-limit`). `src/components/LoginPanel/LoginPanel.tsx` (kiosk) only calls login and request-password-reset, via `src/services/accountApi.ts`; registration, email verification, password-reset completion, and change-password all live on the separate minimal portal (`portal/`, deployed to Cloudflare Pages — see `README.md`, "Portal"). Session tokens exist now (issued by login) but only the portal's `account.html` uses one (for change-password) — the kiosk still doesn't need one, per `docs/personal-account-requirements.md`. `server/emailSender.ts` sends verification/reset emails via Resend, falling back to console-logging the link when `RESEND_API_KEY` is unset (local dev).
- `GET /api/config` returns `RAILWAY_PUBLIC_DOMAIN` when set (deployed), else falls back to LAN-IP auto-detection (local dev) — the frontend embeds this in the QR code so a phone (a separate device) can reach it. The frontend's own calls to the backend always use `localhost` in dev (see `.env.example`, `VITE_API_BASE_URL`).
- **Real inbound email**: Cloudflare Email Routing → a thin Cloudflare Worker (`cloudflare-worker/email-relay.js`, forwards raw MIME only, no parsing) → `POST /api/email/incoming`, parsed with `mailparser` and reusing the same validation/scanning pipeline as QR — see `docs/email-upload-requirements.md`, "How it works."
- This is intentionally a backend without production hardening (permissive CORS, no authorization checks on routes beyond the login endpoints themselves — e.g. any client can list any session's files by guessing its id) — matches `docs/product-overview.md`'s "production-ready backend" and "security hardening" being out of scope, not a contradiction of it. Format/size validation, real antivirus scanning, and real account login are implemented, though (see below) — those aren't "hardening" so much as correctness/data-quality checks (or, for login, a standalone confirmed feature), and the AV-scanning open item had been unresolved since the project's earliest domain discovery.
- **File format/size limits** (`server/fileValidation.ts`): shared rule across every upload method — see `docs/domain/kiosk-session.md`, "File format and size limits."
- **Real antivirus scanning** (`server/uploadStore.ts`) via a ClamAV daemon (`clamd`) over TCP, host/port from `CLAMD_HOST`/`CLAMD_PORT` (default `127.0.0.1:3310` for local dev) — see `docs/qr-upload-requirements.md`, "File scanning status," and `README.md` for local one-time setup + the Railway `clamav` service. Fails open (dev convenience, not the production answer) if `clamd` isn't reachable.

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
