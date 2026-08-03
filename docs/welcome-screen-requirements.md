# Welcome Screen — Confirmed Requirements

Internal project document. Consolidates the requirements confirmed with the product owner during discovery for the Welcome Screen. This document defines requirements only — no visual design or mockup exists yet.

## Display hardware

- Orientation: landscape.
- Reference target for the current build: a 14.5" touchscreen monitor, 2880×1800 resolution.
- The screen size/resolution must remain configurable — when real hardware is selected, it must be possible to change the target size/resolution.
- For now, a single standard display size/resolution is assumed across all kiosks; variation across kiosks may be supported in the future.

## User interface

- The welcome screen presents 3 primary service options, shown as service cards: Print (`service-print`), Scan (`service-scan`), Copy (`service-copy`).
- Only Print is being built in the current scope. Scan and Copy are visible as coming-soon service entries, marked as "coming soon".
- The screen also includes: a language switch icon, a help button, a tariffs/pricing info button, a personal account button, a cart icon, and a call-operator button.
- A "Finish and clear data" action (End Session) is shown whenever a Kiosk Session is active (logged in, or an anonymous session still active after returning via Back) — see `docs/domain/kiosk-session.md` for the full definition. Not shown when no session is active.
- All core functions can be used anonymously. Login is optional and never required to proceed.
- Login can be initiated directly from the welcome screen.
- Activating a service (Print/Scan/Copy) creates a Kiosk Session if one does not already exist (see `docs/domain/kiosk-session.md`); successful login also creates one if none exists yet and associates it with the account.

## Branding

- No visual design is confirmed yet.
- Reserve a small logo icon in the very top-left corner of the screen.
- Deployment context: an underground pedestrian passage with artificial lighting. Preference: a minimalist, highly readable design with modern fonts.
- Branding is the same across all kiosks (no per-location/multi-tenant branding).

## Languages

- Current milestone: English only.
- Planned for later: at least 4 additional languages — Slovak, German, Russian, Ukrainian.
- The active language is set automatically per kiosk (e.g., English now, Slovak later) — it is not chosen by the user on first load.
- The user can switch language manually from any screen.
- The persistent footer/header controls (language switch, help, tariffs, call operator, personal account, cart) are present regardless of the selected language.

## Accessibility

- High contrast and strong readability are required.
- Touch targets must be large.
- The interface must support mouse control in addition to touchscreen input.
- Screen-reader and voice support are not required.
- Operator calls (which may involve audio/video) are handled by launching an external third-party application — not built into the kiosk application itself.

## Navigation

- Help, tariffs, language selection, the login screen, the cart, and the call-operator action are all presented as pop-ups/overlays on top of the current screen, not as separate steps in the main flow.
- The user can access help, tariffs, and language selection without first selecting a service.
- Later screens in the flow should provide "Back" and "Reset" actions.
- The user can return to the welcome screen from later stages.
- "Finish and clear data" (End Session) is a distinct action from Back — see `docs/domain/kiosk-session.md` for how the two differ.

## Idle mode

Two previously-conflated concerns are kept distinct:

- **Display power-saving:** with no active Kiosk Session, the welcome screen enters a low-power idle state (no backlight) after a period with no input, for energy saving. Touch input, mouse movement, or a keyboard press wakes the screen. This is a display concern, unrelated to session state.
- **Session inactivity timeout:** when a Kiosk Session is active (logged in, or anonymous-but-active), the welcome screen follows the same unified rule as every other in-flow screen — after 5 minutes with no activity from the user or the system, a 1-minute warning is shown, then the session ends automatically (see `docs/domain/kiosk-session.md`). There is no longer a separate, welcome-screen-specific timeout.

## Error scenarios

- If required hardware (e.g., printer, payment terminal) is unavailable at startup, a pop-up notification informs the user that the service is unavailable.
- Even in this state, the call-operator, help, and login buttons remain accessible.

## Future extensibility

- **Revised:** a promotion is no longer shown via a persistent icon reserved in the layout. If a promotion is planned later, it is presented as a popup at the start of a Kiosk Session instead — see `docs/domain/kiosk-session.md`. No layout space is reserved for it.
- The top-right corner of the screen is reserved for "Finish and clear data" (End Session), shown whenever a session is active.
