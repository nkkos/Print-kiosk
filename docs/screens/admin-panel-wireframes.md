# Admin Panel — Wireframes

Internal project document. Low-fidelity layout exploration for the admin panel that lets an operator watch equipment status in real time, review incident logs/alerts, trigger a remote fix, and (later) see failure statistics — the operational counterpart to `docs/equipment-monitoring-requirements.md`, which defines the incident model, severity levels, and auto-remediation this panel surfaces. No exact colors/spacing are prescribed here; that's `docs/design/design-system.md`'s job. **Confirmed:** this panel gets its own plain/technical style, not the kiosk's own design system — approved via the clickable HTML mockup built alongside this document (graphite ground, IBM Plex Sans/Mono, severity colors kept distinct from the panel's own teal accent), same "own style" precedent `portal/` already established for a different reason.

## Confirmed scope for this pass

- **Single pavilion** — no pavilion selector anywhere in this pass; the data model can stay pavilion-scoped underneath, but the UI doesn't need to expose a switcher until a second pavilion actually exists.
- **Two roles**: a regular on-duty **operator** (sees everything, cannot trigger a remote fix) and a **senior** role (can). **Confirmed:** role comes from logging in — this panel reuses the existing account system (`server/accountStore.ts`) rather than a separate mechanism, extended with a role field.
- **Confirmed:** the on-call roster (who's on duty when) is a fixed schedule in config/DB for this pass — no editing screen. A change to the schedule means editing that record directly, not using the Alerts & on-call screen (which stays view-only, per that screen's own notes).

## Information architecture (confirmed)

Six screens total. Five are wireframed in this pass:

1. **Overview** (this document) — real-time status cards per equipment element + the active-incidents feed. The "home" screen everything else opens from.
2. **Equipment detail** (this document) — one element's incident history + the role-gated "Remote fix" action.
3. **Incident log** (this document) — cross-equipment feed with filters (severity / source / open-closed).
4. **Alerts & on-call** (this document) — who's on duty now, escalation history, threshold values (view-only for this pass per `docs/equipment-monitoring-requirements.md`'s open items).
5. **Failure catalog** (this document) — a static reference of every known failure code per equipment element (severity, whether it's auto-fixable, whether detection is actually implemented yet) — what an operator looks up when they see an unfamiliar `code` and want to know what it means before doing anything.
6. **Statistics** — deliberately deferred until real incident data exists to design against (confirmed earlier in this same discussion).

All five wireframed screens also exist as a clickable HTML mockup (built to visually validate this document's layout choices before committing to them) — role switch, working filters, and a real confirm-then-resolve loop on the fix actions, not just static frames.

## Overview screen

### Layout

```
+----------------------------------------------------------------------------+
| Admin — Обзор                                  Дежурит: Мария П. (senior) |
|                                     [ Лог инцидентов ] [ Алерты ] [ Стат.] |
+----------------------------------------------------------------------------+
| Активные инциденты (2)                                                     |
|  [!] CRITICAL   12:41   printer.paper-jam            -> Принтер            |
|  [~] WARNING    09:03   backend.clamav-unreachable    -> Бэкенд (в дайджест)|
+----------------------------------------------------------------------------+
|                                                                              |
|  +----------------+  +----------------+  +----------------+                |
|  | ПК              |  | Принтер        |  | Экран          |                |
|  | ● OK            |  | ● CRITICAL     |  | ● OK           |                |
|  | heartbeat: 5с   |  | paper-jam      |  | heartbeat: 5с  |                |
|  +----------------+  +----------------+  +----------------+                |
|                                                                              |
|  +----------------+  +----------------+  +----------------+                |
|  | Сеть            |  | Бэкенд         |  | Платёжный      |                |
|  | ● OK            |  | ● WARNING      |  | терминал       |                |
|  | задержка: 40мс  |  | ClamAV skip    |  | — не подключён |                |
|  +----------------+  +----------------+  +----------------+                |
+----------------------------------------------------------------------------+
```

### Elements

- **Дежурит: <имя> (<роль>)** — top-right, always visible, not just on the Alerts screen — knowing who's on duty and which role they have is relevant context for the whole panel, not just its own dedicated screen.
- **Активные инциденты** — a feed above the equipment cards, not buried inside them: severity icon, timestamp, `code`, and which equipment card it belongs to. Sorted by severity then recency (an `emergency` always sits above a `critical` regardless of timestamp). Empty state: "Нет активных инцидентов" — no feed block shown at all, not an empty box (matches how QR upload's own "nothing yet" state already works — `t.qrUpload.waitingForFiles` in `src/features/qr-upload/QrUploadScreen.tsx`, a plain message rather than an empty list container).
- **Equipment cards** — one per source from `docs/equipment-monitoring-requirements.md`'s equipment sections (ПК, Принтер, Экран, Сеть, Бэкенд, Платёжный терминал), each showing: name, a severity-colored status dot (`● OK` / `● WARNING` / `● CRITICAL` / `● EMERGENCY`, exact color mapping is a design-system decision, not fixed here), and one line of the most relevant live detail (heartbeat age for PC/Screen, latency for Network, the active incident's short code for anything currently failing).
- **Платёжный терминал card** — shown as its own distinct "not connected" state (not colored as a failure) while integration stays paused, per `docs/equipment-monitoring-requirements.md`'s Section F — an unbuilt feature shouldn't visually read as a broken one.
- Clicking any card → **Equipment detail** (screen 2, not designed yet) for that element's history + the fix action.
- Top-right nav links to **Лог инцидентов**, **Алерты**, **Статистика** — present for both roles; only the fix action on the detail screen (not this screen) is role-gated.

### States shown above vs. "all healthy"

The mock above shows an active-incident state on purpose (so the feed and a `CRITICAL`/`WARNING` card are both visible at once). The default/all-healthy state is the same layout with:

- No "Активные инциденты" block at all (per its empty-state rule above).
- Every card showing `● OK` (or the payment terminal's "not connected" placeholder).

## Equipment detail screen

One element's own view: current status, its available remote-fix actions (if any — several equipment types genuinely have none, see below), and its incident history. Reached by clicking any card on the Overview screen.

**Not every equipment type has a remote fix to offer.** Per `docs/equipment-monitoring-requirements.md`'s own equipment sections, some failures are software-recoverable (PC/Screen's restart cascade, the printer's `queue-stuck` case) and some categorically aren't (network outages, a jammed printer, a payment terminal that's out of paper) — for those, this screen shows _why_ there's nothing to click, not a disabled-looking dead end. Two concrete examples below cover both shapes; Screen/Backend follow the "has actions" shape (Screen reuses the PC's own restart cascade per that document; Backend's action is "restart backend process," not yet confirmed as wired to anything real — see Open items), Network and the payment terminal follow the "no actions" shape.

### Example A — has remote-fix actions (ПК)

```
+----------------------------------------------------------------------------+
| < Обзор        ПК — Детали                       Дежурит: Мария П. (senior)|
+----------------------------------------------------------------------------+
| Статус: ● OK              Последний heartbeat: 5 секунд назад              |
| Активная сессия клиента: да (началась 5 мин назад)                         |
|                                                                              |
| Удалённый фикс:                                                            |
|  [ Перезапустить приложение ]  [ Перезапустить ОС ]  [ Hard power-cycle ]  |
+----------------------------------------------------------------------------+
| История инцидентов                                              [Фильтр ▾] |
|  12:41  INFO      pc.unresponsive        авто-исправлено (app restart)     |
|  вчера  CRITICAL  pc.dead                закрыт оператором (hard cycle)    |
|  ...                                                                        |
+----------------------------------------------------------------------------+
```

- **Активная сессия клиента** — surfaced here because it directly matters before anyone hits a restart button: a hard power-cycle (or even just an app restart) interrupts whatever a real customer is mid-way through right now. This means the admin panel needs to know whether a live Kiosk Session (`docs/domain/kiosk-session.md`) is currently open on this PC — a new cross-cutting connection this wireframe surfaces that `docs/equipment-monitoring-requirements.md` didn't originally scope (see Open items).
- **Three fix buttons, one per step of the capped restart cascade** — a senior can trigger any step directly (not forced to start from "restart app" first) — useful if, say, an app restart already failed automatically and a human wants to skip straight to a hard cycle rather than wait.
- **Role gating**: for an operator (not senior), all three buttons render disabled with a tooltip — "Доступно только роли Senior" — not hidden, so an operator still sees that fix actions exist and who to ask, rather than the screen looking feature-incomplete.
- **Confirmation required** before any action actually fires — see "Confirmation dialog" below. This is not optional even for a senior: per this project's own general standard for hard-to-reverse actions, a physical power-cycle needs a deliberate second step, not a single click.
- **"Ожидает подтверждения" state (not pictured above)**: if the automatic cascade already reached its cap (per `docs/equipment-monitoring-requirements.md`'s boot-loop guard — one automatic hard power-cycle, then it waits), this screen shows a banner instead of the normal OK status: _"Авто-восстановление достигло предела попыток — требуется решение оператора"_ — and only then does the hard-power-cycle button become the obviously-primary action.

### Example B — no remote fix possible (Принтер)

```
+----------------------------------------------------------------------------+
| < Обзор        Принтер — Детали                  Дежурит: Мария П. (senior)|
+----------------------------------------------------------------------------+
| Статус: ● CRITICAL — printer.paper-jam (открыт с 12:41)                    |
|                                                                              |
| Требует физического вмешательства — удалённый фикс недоступен для этого    |
| типа сбоя.                                                                  |
+----------------------------------------------------------------------------+
| История инцидентов                                              [Фильтр ▾] |
|  12:41  CRITICAL  printer.paper-jam         открыт                         |
|  09:15  INFO      printer.queue-stuck       авто-исправлено (1 попытка)    |
|  вчера  WARNING   printer.conversion-failed закрыт оператором              |
+----------------------------------------------------------------------------+
```

- No fix buttons at all here, for _this specific incident_ (`paper-jam`) — but the printer's `queue-stuck` incident type (visible further down in the same history) _did_ have an automatic single-retry fix, per `docs/equipment-monitoring-requirements.md`'s Section B. Whether "no fix available" is a property of the equipment type as a whole or of the specific active incident matters: the printer _can_ offer a fix sometimes (queue-stuck) and never for others (jam/out-of-paper/cover-open) — the screen reflects whichever incident is currently open, not a fixed per-equipment flag.
- Network and the payment-terminal placeholder always show this "no fix possible" shape, with no exception case — per `docs/equipment-monitoring-requirements.md`, nothing about a network outage is remotely fixable, and the payment terminal has no detail to show yet at all while integration stays paused.

### Confirmation dialog (shared by any fix action)

```
+-----------------------------------------------+
|  Подтвердите: Hard power-cycle — ПК            |
|                                                 |
|  Полная перезагрузка через управляемую розетку.|
|  Активная сессия клиента: да — она будет       |
|  прервана.                                     |
|                                                 |
|          [ Отмена ]      [ Подтвердить ]       |
+-----------------------------------------------+
```

- Every fix action (not just hard power-cycle) goes through this same confirm step — a plain app restart is much lower-stakes than a hard cycle, but still real and worth a deliberate click, not a hover-miss.
- Always states the active-session risk plainly when one exists, rather than only mentioning it on the detail screen above and assuming the person remembers by the time they reach the confirm dialog.
- Confirming logs who triggered it and when as part of the resulting incident's `autoRemediation`/`resolvedBy` fields (`docs/equipment-monitoring-requirements.md`'s Incident model — `resolvedBy: 'operator'` plus the acting person's identity in `context`).

## Incident log screen

The cross-equipment counterpart to a single element's own history (which the Equipment detail screen already shows) — every incident from every source, filterable, for "what's been going on generally" rather than "what's wrong with this one thing."

### Layout

```
+----------------------------------------------------------------------------+
| Лог инцидентов                                                              |
+----------------------------------------------------------------------------+
| Severity: [ WARNING ] [ CRITICAL ] [ EMERGENCY ] [ INFO ]                  |
| Источник: [ ПК ] [ Принтер ] [ Экран ] [ Сеть ] [ Бэкенд ] [ Терминал ]     |
| Статус:   [ Все ] [ Открытые ] [ Закрытые ]           [Сбросить фильтры]   |
+----------------------------------------------------------------------------+
| 7 записей                                                                   |
+----------------------------------------------------------------------------+
| Время    Severity   Источник    Код                    Исход               |
| 12:41    CRITICAL   Принтер     printer.paper-jam       Открыт             |
| 09:15    INFO       Принтер     printer.queue-stuck     Авто-исправлено    |
| 09:03    WARNING    Бэкенд      backend.clamav-unreach.  В дневном дайджесте|
| ...                                                                         |
+----------------------------------------------------------------------------+
```

### Elements

- **Filter chips**, not dropdowns — severity/source are both multi-select (several chips can be active at once, narrowing the list with AND-across-groups/OR-within-a-group logic), status is single-select (`Все` / `Открытые` / `Закрытые`). Chips over dropdowns because the filter state itself is worth seeing at a glance without opening anything, and there are few enough options (4 severities, 6 sources) that a dropdown would be pure overhead.
- **"Сбросить фильтры"** — always present, not just when a filter is active, so its position never shifts.
- **Row count** — states how many rows the current filter combination produced, so "3 записей" vs. an empty list is never ambiguous about whether filters produced zero results or nothing was even attempted.
- **Empty state**: "Ничего не найдено — попробуйте сбросить фильтры" — distinct from Overview's "nothing active" empty state, since here an empty result is a filter artifact, not a genuine "all healthy" signal.
- Clicking any row → that row's own equipment's **Equipment detail** screen (screen 2) — consistent with Overview's incident feed doing the same thing, so "jump to the thing that's wrong" behaves identically everywhere it appears.
- No date-range filter in this pass, despite `docs/equipment-monitoring-requirements.md`'s Methodology section mentioning one — deferred until there's enough real incident volume for a date filter to matter (see Open items).

## Alerts & on-call screen

Who's on duty, what's escalated recently, and the current (unconfirmed) auto-remediation thresholds — view-only for this pass, per `docs/equipment-monitoring-requirements.md`'s own open items.

### Layout

```
+----------------------------------------------------------------------------+
| Алерты и дежурства                                                          |
+----------------------------------------------------------------------------+
|  Дежурство сейчас            |  История эскалаций                          |
|  ┌────┐                      |  Инцидент       Алерт    Эскалация  Кому    |
|  │ МП │  Мария П.             |  pc.dead        23:02    23:12     Общий   |
|  └────┘  Senior · до 20:00   |                                    чат      |
|                               |  network.local-  03:41    03:51    Общий   |
|  Пн  Иван О.       operator  |  down                              чат      |
|  Вт  Иван О.       operator  |                                              |
|  Ср  Мария П.(сейчас) senior |                                              |
|  Чт  Мария П.       senior   |                                              |
|  Пт  Дмитрий К.     operator |                                              |
|  Сб  Дмитрий К.     operator |                                              |
|  Вс  Мария П.       senior   |                                              |
+----------------------------------------------------------------------------+
| Пороги авто-восстановления и эскалации                                     |
| ⚠ Иллюстративные значения из обсуждения, не выверены — редактирование      |
|   появится позже.                                                          |
| ПК/Экран: перезапуск приложения ............ 1 попытка, затем след. шаг    |
| ПК/Экран: hard power-cycle (авто) .......... 1 попытка, затем нужен ack    |
| Принтер: queue-stuck ........................ 1 попытка, затем critical    |
| Эскалация в общий чат при неподтверждении .. порог не выверен              |
+----------------------------------------------------------------------------+
```

### Elements

- **Дежурство сейчас** — mirrors the topbar's own "Дежурит: <имя> (<роль>)" indicator (Overview screen) but with room for more context (avatar, shift end time) since this screen exists specifically for it.
- **Roster list** — a plain read-only week view (day → name → role). Per `docs/equipment-monitoring-requirements.md`'s own open items, how the roster actually gets edited/maintained is still undesigned — this screen only displays it.
- **История эскалаций** — one row per incident that crossed the "unacknowledged past threshold → reposted to the shared ops group chat" path (`docs/equipment-monitoring-requirements.md`, Methodology → Notification & escalation). Empty is the common/good case, not called out with special styling — an empty table reads clearly enough on its own.
- **Пороги** — the same illustrative numbers already written into `docs/equipment-monitoring-requirements.md`'s equipment sections, surfaced here so an operator can see them without reading the source doc — explicitly labeled as unconfirmed, matching that document's own honesty about them, and explicitly not editable in this pass.

## Failure catalog screen

A static reference, not a live feed — every known failure `code` this system recognizes, grouped by equipment source, straight out of `docs/equipment-monitoring-requirements.md`'s own equipment sections. Exists because an operator who sees an unfamiliar code in the Incident log or on a card shouldn't have to go find and read the source markdown file to understand what it means, whether it fixes itself, and whether it's even really being watched for yet.

### Layout

```
+----------------------------------------------------------------------------+
| Справочник неисправностей                          [Поиск по коду...    ] |
+----------------------------------------------------------------------------+
| ПК                                                                          |
|  pc.os-crash             ● CRITICAL   Авто: нет         Мониторинг: план   |
|  pc.dead                 ● EMERGENCY  Авто: hard-cycle  Мониторинг: план   |
|  pc.unresponsive         ● WARNING    Авто: рестарт     Мониторинг: план   |
|  ...                                                                        |
+----------------------------------------------------------------------------+
| Принтер                                                                     |
|  printer.paper-jam       ● CRITICAL   Авто: нет         Мониторинг: да     |
|  printer.submit-timeout  ● CRITICAL   Авто: нет*        Мониторинг: да     |
|  printer.interactive-port ● CRITICAL  Авто: нет         Мониторинг: план   |
|  printer.queue-stuck     ● CRITICAL   Авто: да**        Мониторинг: план   |
|  ...                                                                        |
+----------------------------------------------------------------------------+
| Экран / Сеть / Бэкенд / Платёжный терминал  (те же карточки, свёрнуты)     |
+----------------------------------------------------------------------------+
| * ретрай проверен вживую и не помогает — не будет добавлен                 |
| ** требует прав на перезапуск spooler-сервиса, которых сейчас нет           |
+----------------------------------------------------------------------------+
```

### Elements

- **Поиск по коду** — a plain text filter across every code/message in the catalog (not the same as the Incident log's severity/source/status chips — this searches the reference text itself, e.g. typing "timeout" should surface `printer.submit-timeout`).
- **One collapsible group per equipment source** — same six sources as everywhere else in this panel (ПК, Принтер, Экран, Сеть, Бэкенд, Платёжный терминал). Printer is shown expanded above since it has the most entries confirmed live this session; the rest collapse by default to keep the page scannable.
- **Per-code row**: the `code` itself (monospace, matching every other screen's convention), its severity, whether an automatic fix exists (and a footnote when that auto-fix has a real caveat — e.g. `queue-stuck`'s spooler-restart needing privileges this backend doesn't have yet, or `submit-timeout`'s retry being tested and rejected, not just "not built"), and whether detection is actually implemented today or still planned (`printer.*` is mostly "да" after this session's wiring; every other source is still "план").
- **Not a live table** — no severity filter, no click-through to real incidents (that's the Incident log's job). This screen answers "what does this mean and is it real yet," not "show me what's currently happening."

### Navigation

- Reached via a new `admin-nav-catalog` link in the shared top nav.
- No drill-down — this is the terminal screen for "look something up," not a hub.

## Open items

- Exact color mapping for the four severity dots — the mockup's actual hex values are a reasonable starting point once real design tokens are needed, but not formally promoted to a design-system decision yet.
- The admin panel needs live visibility into whether a Kiosk Session is currently active on a given PC (`docs/domain/kiosk-session.md`) — not previously scoped in `docs/equipment-monitoring-requirements.md`; confirmed needed, implementation (querying `kiosk_sessions`) not yet built.
- The Incident log's date-range filter — dropped from this pass (see that screen's own notes) until there's real volume to filter against.
- Roster editing UI — deliberately out of scope; the schedule lives in config/DB, edited directly rather than through this panel, for now.
- Real-time update mechanism (polling vs. WebSocket/SSE) for the status cards, incident feed, and log — an implementation decision, not addressed at the wireframe level.
- **New, Failure catalog screen:** where its content actually lives — hardcoded in frontend code mirroring `docs/equipment-monitoring-requirements.md` by hand (fast, but the two can drift), vs. a small backend-served catalog the doc's own content feeds into somehow. Not decided; today's mockup just hardcodes it for the demo.

**Resolved since this document was first written** (kept here for the record, not as open items anymore): login/role-assignment reuses the existing account system (`server/accountStore.ts`, extended with a role field) — not a separate mechanism; the panel gets its own plain/technical visual style, not the kiosk's design system (see the intro above); "restart backend process" is a real, confirmed action (`docs/equipment-monitoring-requirements.md`, Section E — implemented via the process calling `process.exit(1)` and relying on Railway's restart-on-crash policy).
