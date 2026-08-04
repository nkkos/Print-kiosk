# Multi-language Interface — Confirmed Requirements

Internal project document. Consolidates the requirements confirmed with the product owner for interface translation. Resolves the open question in `docs/product-overview.md` ("Is multi-language support required?").

## Purpose

The interface must work in English, Slovak, German, Russian, and Ukrainian, so users unfamiliar with English can use the kiosk in their own language.

## Confirmed languages

English, Slovak, German, Russian, Ukrainian.

## Language selection

- The footer's `language-switch` control (already reserved in `docs/design/component-library.md`, Section 9/13 — previously placeholder-only) becomes real: tapping it opens a popup, on the shared `Modal` shell (same pattern as Account/Help/Tariffs), listing the five languages. Tapping one switches the interface immediately and closes the popup.
- **Confirmed: session-scoped, not kiosk-scoped.** The selected language resets to the default at the start of every new Kiosk Session — consistent with the project's confirmed "no smart session restore" philosophy (same category of reset as `accountId`, `screen`), not persisted to `localStorage`. A kiosk-level "sticky" default (persisting across users) was considered and explicitly rejected for now.

## Default language

English, for the current milestone. **Confirmed to change to Slovak before a real production release** (the target market is Bratislava, Slovakia) — noted here as a planned future change (a single constant), not implemented now.

## Scope

- **Translated:** the real, confirmed user-facing kiosk interface — every screen's headings, instructional text, button labels, descriptions, popup/notification/error messages.
- **Explicitly not translated:**
  - Developer-only scaffolding — every "Simulate ..." button (connection lost/restored, payment success, print complete, hardware unavailable, etc.) and similar dev-only controls across every screen. These are development tools, not product surface.
  - The QR upload method's phone-facing page (`server/routes.ts`'s server-rendered HTML) — a separate surface outside the React app's translation infrastructure.

## Translation quality

Translations for German, Slovak, Russian, and Ukrainian are AI-generated for this pass. **This is explicitly not a substitute for native-speaker/professional review before a real production launch** — flagged as an open item, not a blocker for the prototype milestone.

## Scope boundaries

Out of scope for this document: the exact visual design of the language popup (`docs/design/component-library.md` already tracks this generically as "To be defined" for every footer popup), any real translation-management tooling/pipeline (a future concern if this ever needs professional translator workflows), and Tariffs' actual pricing content (still a placeholder regardless of language).

## Open items

- Native-speaker review of the four non-English translations before production.
- Exact visual treatment of the language popup.
- Whether Tariffs' real pricing content (once it exists) needs its own translation workflow.
