# Admin Panel — Spec

Internal project document. Confirms the approved layout (`docs/screens/admin-panel-wireframes.md`, validated against the clickable HTML mockup built alongside it) and defines interactive elements, states, and navigation for the five wireframed screens — Overview, Equipment detail, Incident log, Alerts & on-call, Failure catalog. Requirements: `docs/equipment-monitoring-requirements.md`. Statistics (screen 6) stays deferred, per that document's own confirmed decision. Nothing described here is implemented yet.

## Confirmed scope (carried over from the wireframes)

- Single pavilion — no pavilion selector.
- Two roles: **operator** (full read access, cannot trigger a remote fix) and **senior** (can). Which role the current person has comes from login/session — not designed here (see Open items) — every element below that's role-gated assumes that determination already happened before this screen renders.

## Shared elements (every screen)

| Identifier               | Purpose                              | Default state  | Enabled/disabled                   | Action after click / Navigation                        |
| ------------------------ | ------------------------------------ | -------------- | ---------------------------------- | ------------------------------------------------------ |
| `admin-nav-overview`     | Top nav — Overview                   | Visible        | Enabled                            | → Overview                                             |
| `admin-nav-log`          | Top nav — Incident log               | Visible        | Enabled                            | → Incident log                                         |
| `admin-nav-alerts`       | Top nav — Alerts & on-call           | Visible        | Enabled                            | → Alerts & on-call                                     |
| `admin-nav-catalog`      | Top nav — Failure catalog            | Visible        | Enabled                            | → Failure catalog                                      |
| `admin-nav-stats`        | Top nav — Statistics                 | Visible        | Disabled — screen not designed yet | None                                                   |
| `admin-oncall-indicator` | Shows who's on duty now + their role | Always visible | Not interactive                    | None — same data the Alerts screen shows in more depth |

## Overview screen

### Interactive elements

| Identifier                        | Purpose                                | Default state                                              | Enabled/disabled | Action after click / Navigation               |
| --------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ---------------- | --------------------------------------------- |
| `incident-feed`                   | Active-incidents list, above the cards | Hidden entirely when empty                                 | Not interactive  | None (container)                              |
| `incident-row-<incidentId>`       | One active incident's row              | One per open, unresolved incident                          | Enabled          | → Equipment detail for that incident's source |
| `equipment-card-pc`               | ПК status card                         | Visible                                                    | Enabled          | → Equipment detail (`pc`)                     |
| `equipment-card-printer`          | Принтер status card                    | Visible                                                    | Enabled          | → Equipment detail (`printer`)                |
| `equipment-card-display`          | Экран status card                      | Visible                                                    | Enabled          | → Equipment detail (`display`)                |
| `equipment-card-network`          | Сеть status card                       | Visible                                                    | Enabled          | → Equipment detail (`network`)                |
| `equipment-card-backend`          | Бэкенд status card                     | Visible                                                    | Enabled          | → Equipment detail (`backend`)                |
| `equipment-card-payment-terminal` | Платёжный терминал card                | Visible, "not connected" state while integration is paused | Enabled          | → Equipment detail (`payment-terminal`)       |

### Screen states

1. **All healthy** (default) — `incident-feed` not rendered at all; every card shows `OK` (or the payment terminal's own "not connected" placeholder, which is not a failure state).
2. **Active incidents** — `incident-feed` shows one row per open incident, sorted severity-first then by recency; the affected card(s) show their current severity instead of `OK`.

### Navigation

- Reached via `admin-nav-overview`, or as the panel's own landing screen.
- Any card or feed row → **Equipment detail**, pre-scoped to that element.

## Equipment detail screen

### Interactive elements

| Identifier                              | Purpose                                                       | Default state                                                            | Enabled/disabled                                    | Action after click / Navigation                                                     |
| --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `equipment-detail-back`                 | Returns to Overview                                           | Visible                                                                  | Enabled                                             | → Overview                                                                          |
| `equipment-fix-pc-restart-app`          | Restarts the app process on the ПК                            | Visible only on the `pc` detail screen                                   | Enabled for senior; disabled (tooltip) for operator | Opens `equipment-fix-confirm-modal`                                                 |
| `equipment-fix-pc-restart-os`           | Restarts the ПК's OS                                          | Visible only on the `pc` detail screen                                   | Enabled for senior; disabled (tooltip) for operator | Opens `equipment-fix-confirm-modal`                                                 |
| `equipment-fix-pc-hard-cycle`           | Hard power-cycle via the managed relay                        | Visible only on the `pc` detail screen                                   | Enabled for senior; disabled (tooltip) for operator | Opens `equipment-fix-confirm-modal`                                                 |
| `equipment-fix-display-restart-app`     | Same restart cascade, for the Экран                           | Visible only on the `display` detail screen                              | Enabled for senior; disabled (tooltip) for operator | Opens `equipment-fix-confirm-modal`                                                 |
| `equipment-fix-display-restart-os`      | —                                                             | Visible only on the `display` detail screen                              | Enabled for senior; disabled (tooltip) for operator | Opens `equipment-fix-confirm-modal`                                                 |
| `equipment-fix-display-hard-cycle`      | —                                                             | Visible only on the `display` detail screen                              | Enabled for senior; disabled (tooltip) for operator | Opens `equipment-fix-confirm-modal`                                                 |
| `equipment-fix-backend-restart-process` | Restarts the backend process                                  | Visible only on the `backend` detail screen                              | Enabled for senior; disabled (tooltip) for operator | Opens `equipment-fix-confirm-modal` — see Open items about whether this is real yet |
| `equipment-detail-nofix-notice`         | Explains why no fix button exists for this incident/equipment | Visible on `printer` (jam-type incidents), `network`, `payment-terminal` | Not interactive                                     | None                                                                                |
| `equipment-detail-history`              | This element's own incident history table                     | Visible; empty state if no history yet (e.g. `payment-terminal`)         | Not interactive                                     | Display only                                                                        |

### Confirmation dialog

| Identifier                              | Purpose                                        | Default state                                                                                                              | Enabled/disabled | Action after click / Navigation                                                                                                                                     |
| --------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `equipment-fix-confirm-modal`           | Confirms the chosen fix action before it fires | Hidden until a fix button is pressed                                                                                       | —                | —                                                                                                                                                                   |
| `equipment-fix-confirm-session-warning` | "Активная сессия клиента — она будет прервана" | Visible only if a Kiosk Session is currently active on this PC (see `docs/screens/admin-panel-wireframes.md`'s Open items) | Not interactive  | None                                                                                                                                                                |
| `equipment-fix-confirm-cancel`          | Cancels, no action taken                       | Visible                                                                                                                    | Enabled          | Closes the modal, returns to Equipment detail unchanged                                                                                                             |
| `equipment-fix-confirm-submit`          | Actually runs the chosen fix                   | Visible                                                                                                                    | Enabled          | Closes the modal; the incident's `resolvedBy`/`autoRemediation` fields record who confirmed and when (`docs/equipment-monitoring-requirements.md`'s Incident model) |

### Screen states

1. **Has fix actions, healthy** — status `OK`, fix buttons present (role-gated), history below.
2. **Has fix actions, degraded/failing** — status reflects the real severity; if the automatic cascade already exhausted its cap (`docs/equipment-monitoring-requirements.md`'s boot-loop guard), a banner replaces the normal status line and the next-step fix button reads as the primary action — exact visual treatment not finalized (see Open items).
3. **No fix possible** — `equipment-detail-nofix-notice` shown instead of any fix button, explaining why (physical intervention needed, or nothing is remotely fixable for this source at all).

### Navigation

- Reached from any Overview card, any `incident-row-<id>`, or any Incident log row for the same source.
- `equipment-detail-back` → Overview.

## Incident log screen

### Interactive elements

| Identifier                                            | Purpose                                   | Default state                              | Enabled/disabled | Action after click / Navigation                               |
| ----------------------------------------------------- | ----------------------------------------- | ------------------------------------------ | ---------------- | ------------------------------------------------------------- |
| `incident-log-filter-severity-info`                   | Toggles the `info` severity filter        | Inactive (all severities shown by default) | Enabled          | Toggles on/off, re-filters the list below                     |
| `incident-log-filter-severity-warning`                | Toggles the `warning` severity filter     | Inactive                                   | Enabled          | Toggles on/off, re-filters the list below                     |
| `incident-log-filter-severity-critical`               | Toggles the `critical` severity filter    | Inactive                                   | Enabled          | Toggles on/off, re-filters the list below                     |
| `incident-log-filter-severity-emergency`              | Toggles the `emergency` severity filter   | Inactive                                   | Enabled          | Toggles on/off, re-filters the list below                     |
| `incident-log-filter-source-pc` … `-payment-terminal` | One toggle per equipment source (6 total) | Inactive                                   | Enabled          | Toggles on/off, re-filters the list below                     |
| `incident-log-filter-status-all`                      | Shows both open and resolved              | Active (default)                           | Enabled          | Selects this status filter (single-select with the two below) |
| `incident-log-filter-status-open`                     | Shows only unresolved incidents           | Inactive                                   | Enabled          | Selects this status filter                                    |
| `incident-log-filter-status-resolved`                 | Shows only resolved incidents             | Inactive                                   | Enabled          | Selects this status filter                                    |
| `incident-log-filter-reset`                           | Clears every active filter                | Always visible                             | Enabled          | Resets all filters to default, re-renders the list            |
| `incident-log-row-<incidentId>`                       | One incident row                          | One per matching incident                  | Enabled          | → Equipment detail for that row's source                      |

### Screen states

1. **Unfiltered** — every incident (open and resolved) across all equipment, most recent first.
2. **Filtered, results found** — the row count updates; only matching rows render.
3. **Filtered, no results** — "Ничего не найдено — попробуйте сбросить фильтры" in place of the table.

### Navigation

- Reached via `admin-nav-log`.
- Any row → **Equipment detail** for that source.

## Alerts & on-call screen

### Interactive elements

This screen is entirely **view-only** in this pass — every element below is display-only. The roster itself lives in config/DB, edited directly rather than through this panel (confirmed — see `docs/screens/admin-panel-wireframes.md`).

| Identifier                  | Purpose                                                               | Default state                                | Enabled/disabled | Action after click / Navigation |
| --------------------------- | --------------------------------------------------------------------- | -------------------------------------------- | ---------------- | ------------------------------- |
| `alerts-oncall-now`         | Who's on duty right now, their role, shift end time                   | Visible                                      | Not interactive  | None                            |
| `alerts-roster`             | The week's on-call schedule                                           | Visible                                      | Not interactive  | None                            |
| `alerts-escalation-history` | Table of incidents that crossed the escalation threshold              | Visible; empty table if none yet             | Not interactive  | None                            |
| `alerts-thresholds`         | Read-only table of the current auto-remediation/escalation thresholds | Visible, labeled as illustrative/unconfirmed | Not interactive  | None                            |

### Navigation

- Reached via `admin-nav-alerts`.
- No further navigation from this screen in this pass (no drill-down into a specific escalation's own incident — could be added later, not confirmed now).

## Failure catalog screen

### Interactive elements

Static reference content — nothing here is a live feed of real incidents (that's the Incident log's job).

| Identifier                       | Purpose                                                                      | Default state                                                        | Enabled/disabled | Action after click / Navigation                                                             |
| -------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `catalog-search`                 | Free-text filter across every code/message in the catalog                    | Empty                                                                | Enabled          | Filters the groups/rows below live                                                          |
| `catalog-group-pc`               | Collapsible group — ПК's known codes                                         | Collapsed by default                                                 | Enabled          | Toggles expand/collapse                                                                     |
| `catalog-group-printer`          | Collapsible group — Принтер's known codes                                    | **Expanded by default** (most entries confirmed live this session)   | Enabled          | Toggles expand/collapse                                                                     |
| `catalog-group-display`          | Collapsible group — Экран's known codes                                      | Collapsed by default                                                 | Enabled          | Toggles expand/collapse                                                                     |
| `catalog-group-network`          | Collapsible group — Сеть's known codes                                       | Collapsed by default                                                 | Enabled          | Toggles expand/collapse                                                                     |
| `catalog-group-backend`          | Collapsible group — Бэкенд's known codes                                     | Collapsed by default                                                 | Enabled          | Toggles expand/collapse                                                                     |
| `catalog-group-payment-terminal` | Collapsible group — Платёжный терминал's known codes                         | Collapsed by default                                                 | Enabled          | Toggles expand/collapse                                                                     |
| `catalog-entry-<source>-<code>`  | One row per known failure code (e.g. `catalog-entry-printer-submit-timeout`) | Visible when its group is expanded and it matches the current search | Not interactive  | None — display only (severity, whether auto-fixable, whether monitoring is implemented yet) |

### Screen states

1. **Unfiltered** — every group present; only Принтер expanded by default, matching how much of it is actually implemented today.
2. **Searching** — typing in `catalog-search` expands any group with a matching row and hides non-matching rows/groups, same "filter, don't navigate away" pattern as the Incident log.

### Navigation

- Reached via `admin-nav-catalog`.
- No drill-down to real incidents or Equipment detail — this screen is a dead end by design (see the wireframes' own note: "look something up," not a hub).

## Accessibility

Same bar as the rest of this project (`docs/design/design-system.md`, Section 15): every severity state is conveyed by both color and text/label (never color alone — matches the mockup's `sev` chip always pairing a colored dot with an uppercase text label), keyboard focus is visible on every interactive element, and the confirmation modal traps focus and closes on Escape (already proven in the HTML mockup).

## Notes for implementation

- The mockup's **role switch** (toggling between "Оператор"/"Senior" in the topbar) and **theme toggle** (☀/☾) are demo-only conveniences for evaluating both states side by side — neither is part of this confirmed spec. The real role comes from logging in — this panel reuses the existing account system (`server/accountStore.ts`), extended with a role field, rather than a separate mechanism; whether a manual theme toggle ships in the real product at all hasn't been decided.
- `equipment-fix-backend-restart-process` is a real, confirmed action, not aspirational — implemented as the backend process calling `process.exit(1)` after logging the incident, relying on Railway's restart-on-crash policy (`docs/equipment-monitoring-requirements.md`, Section E).
- `incident-row-<incidentId>` and `incident-log-row-<incidentId>` are the same underlying incident possibly rendered in two different lists (Overview's feed only shows _open_ ones; Incident log shows everything) — same identifier scheme, different filtering, not two different data sources.
- Six equipment sources are a closed, fixed set for this pass (`pc`, `printer`, `display`, `network`, `backend`, `payment-terminal`) — the fixed `equipment-card-*`/`equipment-fix-*` identifiers above assume this; a second pavilion or a genuinely new equipment type would need this revisited, not just extended.

## Open items

- Exact visual treatment for the "auto-remediation exhausted its cap, awaiting operator" state on Equipment detail — mentioned in the wireframes as a banner, not pixel-specified.
- Incident log's date-range filtering — deliberately absent from both the wireframes and this spec until real incident volume exists to design against.
- Threshold editing — the Alerts & on-call screen shows thresholds read-only; editing is a future decision, not scoped here.
- Failure catalog's actual content source — hardcoded to mirror `docs/equipment-monitoring-requirements.md` by hand for now (see that document's own Open items) vs. a backend-served version; not decided.
- No fix-action route exists yet for `equipment-fix-pc-*`/`equipment-fix-display-*` (the restart cascade) — only `equipment-fix-backend-restart-process` is real; the others need infrastructure (a watchdog process, a managed relay) not built this pass.
- Escalation-to-group-chat-on-timeout and the `warning`-level daily digest — not implemented (see `docs/equipment-monitoring-requirements.md`'s own Open items); only the immediate `critical`/`emergency` Telegram alert is real today.

**Resolved since this document was first written**: login/role-assignment is implemented — a separate `staffAccounts`/`staffSessions` schema and `server/staffAccountStore.ts` reusing `accounts`'s bcrypt+session mechanism, not a role field on `accounts` itself (revised from this document's original assumption once actually built — see `docs/screens/admin-panel-wireframes.md`'s own note). Real routes exist: `POST /api/admin/login`, `GET /api/admin/me`, `GET /api/admin/incidents`, `GET /api/admin/roster`, `GET /api/admin/kiosk-session-active`, `POST /api/admin/equipment/backend/restart-process` (`server/adminRoutes.ts`) — all gated by `requireStaffSession`, the last one also by `requireSeniorRole` (verified live: an operator token gets a real 403, a senior token succeeds and marks the triggering incident resolved). Live Kiosk Session visibility is real too (`server/sessionLifecycle.ts`'s `hasActiveKioskSession`, with a 10-minute staleness guard against a crashed session that never updated its own status). This panel gets its own plain/technical visual style, not the kiosk's design system; the on-call roster is a real table (`staffRoster`), edited only via `server/scripts/setRosterDay.ts`, no UI in this pass.
