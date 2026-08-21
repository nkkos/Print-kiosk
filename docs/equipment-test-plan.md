# Equipment & Software Failure — Test Plan

Internal project document. A living checklist of every test planned or already run against `docs/equipment-monitoring-requirements.md`'s failure taxonomy — grouped the same way that document is (one block per equipment/software element), each test tracked with a status so testing can pause and resume across sessions (e.g. once real hardware — a second printer, a managed smart plug, a payment terminal — is actually connected) without re-deriving what's already been covered.

**Status vocabulary used below:**

- **Пройден** — actually run against real code/hardware this session, with a real result (not just reasoned about).
- **Не пройден** — planned, not yet run.
- **Заблокирован** — can't be run yet for a stated reason (missing hardware, missing privileges, etc.).
- **В процессе** — actively being worked through right now.

## Заблокировано до подключения оборудования

Tests that need something physical not yet present, called out up front since this is exactly the "come back to this once equipment is connected" list:

- A second real physical printer (for fallback-printer testing, B2).
- A USB printer to physically unplug (B2.4) — only the WSD/network case has been tested so far.
- A managed relay/smart plug (PC hard power-cycle, Section A; possibly a printer power-cycle too).
- Elevated/admin privileges for the kiosk process (Spooler service restart/stop, B3.8; `queue-stuck` auto-remediation).
- A real payment terminal + chosen provider (Section F — integration itself is paused).
- A watchdog process for the PC/display heartbeat (Section A/C) — not built yet, so `pc.dead`/`pc.unresponsive`/display tests have nothing to run against.

## Block A — Kiosk PC

| Test                                                             | Status       | Notes                                                          |
| ---------------------------------------------------------------- | ------------ | -------------------------------------------------------------- |
| `pc.unresponsive` → app restart step                             | Не пройден   | No watchdog process exists yet to trigger this.                |
| `pc.unresponsive` → OS restart step                              | Не пройден   | Same — no watchdog yet.                                        |
| `pc.dead` → hard power-cycle (1 auto, then ack)                  | Заблокирован | Needs the managed relay/smart plug (not chosen/purchased yet). |
| `pc.disk-full` / `pc.peripheral-disconnected` / `pc.overheating` | Не пройден   | No detection built yet for any of these.                       |

## Block B — Printer

### B1. Registration in Windows

| Test                                           | Status     | Notes                                                                                                                                                                              |
| ---------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No default printer configured                  | Не пройден | Code path (`printer-not-found`) exists and is exercised by other real tests below, but this exact scenario (temporarily unsetting the Windows default) hasn't been run standalone. |
| `printerName` that doesn't match any installed | Не пройден | —                                                                                                                                                                                  |
| Printer marked Paused/Error in Windows         | Пройден    | Confirmed unreliable: a real unreachable WSD printer still reported `PrinterStatus: Normal` throughout — don't trust this signal alone.                                            |

### B2. Real device unreachable

| Test                                                     | Status       | Notes                                                                                                                                                |
| -------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| USB printer physically disconnected                      | Заблокирован | No USB printer available to unplug in this environment.                                                                                              |
| Network/WSD printer powered off / unreachable            | Пройден      | Run twice — non-deterministic: 7.6s (`submit-failed`) then 27s (`submit-timeout`). Run several times, not once, if revisiting.                       |
| Immediate retry after a failure                          | Пройден      | Confirmed not reliable — second attempt was slower, not faster. Not adopted as auto-remediation.                                                     |
| Printer on an interactive port (Print to PDF, XPS, etc.) | Пройден      | Found by accident testing as a "positive control" — hung the full 25s, same as a genuinely unreachable device. New code: `printer.interactive-port`. |
| Fallback to a second real physical printer               | Заблокирован | Needs a second real printer connected — only virtual ones (Print to PDF, OneNote, AnyDesk) exist here.                                               |

### B3. Print queue / spooler

| Test                                | Status       | Notes                                                                                             |
| ----------------------------------- | ------------ | ------------------------------------------------------------------------------------------------- |
| Spooler service stopped             | Заблокирован | `Restart-Service -Name Spooler` fails outright — the account this backend runs under isn't admin. |
| Queue backed up with stale jobs     | Не пройден   | —                                                                                                 |
| Concurrent submissions (2+ at once) | Не пройден   | Should confirm `printQueue.ts`'s serial queue still bounds total wait correctly.                  |

### B4. Job data

| Test                                            | Status     | Notes |
| ----------------------------------------------- | ---------- | ----- |
| Very large or corrupted PDF                     | Не пройден | —     |
| Print options unsupported by the target printer | Не пройден | —     |

### B5. Permissions/environment

| Test                                   | Status             | Notes                                                                                                                                                     |
| -------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process lacking OS permission to print | Пройден (частично) | Confirmed via the Spooler-restart attempt above failing on privileges — a related but not identical scenario to "printing itself blocked by permissions." |
| Missing/corrupted printer driver       | Не пройден         | —                                                                                                                                                         |

## Block C — Touchscreen / display

| Test                            | Status     | Notes                                                                    |
| ------------------------------- | ---------- | ------------------------------------------------------------------------ |
| `display.no-signal` / `.asleep` | Не пройден | No detection built yet.                                                  |
| `display.touch-unresponsive`    | Не пройден | No synthetic touch self-test exists (open item in the requirements doc). |
| `display.app-frozen`            | Не пройден | Rides on the same (not-yet-built) watchdog as the PC section.            |

## Block D — Network / connectivity

| Test                          | Status     | Notes                                                                     |
| ----------------------------- | ---------- | ------------------------------------------------------------------------- |
| `network.local-down`          | Не пройден | No heartbeat mechanism built yet — this is the only way it'd be detected. |
| `network.backend-unreachable` | Не пройден | Same.                                                                     |
| `network.flapping`            | Не пройден | Same.                                                                     |

## Block E — Backend / software failures

| Test                                                 | Status     | Notes                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ClamAV unreachable, dev (fail-open)                  | Пройден    | Real upload with no `clamd` running locally — `backend.clamav-unreachable`, `warning`.                                                                                                                                                                        |
| ClamAV unreachable, production (fail-closed)         | Не пройден | Only ever run this backend with `NODE_ENV` unset (dev) locally — the fail-closed branch is code-reviewed, not live-tested.                                                                                                                                    |
| Corrupt `.heic` conversion                           | Пройден    | Real garbage-bytes `.heic` upload → `printer.conversion-failed`, `warning`, file still lands `ready` (placeholder fallback).                                                                                                                                  |
| Corrupt `.doc`/`.docx` conversion                    | Не пройден | Plain text with a `.docx` extension did **not** fail — LibreOffice converted it anyway. Need a genuinely malformed OOXML file, not just wrong content.                                                                                                        |
| Scan/Copy page processing — degenerate corners       | Пройден    | Real request with a near-zero-area quad against the Copy pipeline → `backend.scan-processing-failed`, `info`.                                                                                                                                                 |
| DB — idle client unexpectedly disconnected           | Пройден    | Forced via `pg_terminate_backend` against the real running backend. **Found and fixed a real crash bug**: `pg.Pool` had no `'error'` listener at all — would have taken the whole process down. Now logs the incident and survives; pool recovers on its own. |
| DB — query-time connection loss                      | Не пройден | Different from the idle-client case above (a query in flight when the connection drops, vs. an idle one) — not yet forced separately.                                                                                                                         |
| Account email send failure (register/password-reset) | В процессе | Step-by-step plan agreed: register with an email outside the Resend account's own verified address, expect a real 500 + `backend.email-send-failed` incident. Not yet actually run.                                                                           |
| Scan-delivery email send failure                     | Не пройден | Same underlying code path as above (`sendScanEmail`), not separately forced.                                                                                                                                                                                  |
| Catch-all Express error middleware                   | Не пройден | Implemented (`backend.unhandled-route-error`) as a backstop, but nothing has actually hit it live yet — every real failure so far was caught by a more specific handler first.                                                                                |

## Block F — Payment terminal

Entirely **Заблокирован** — integration is on hold pending commercial terms (see the Besteron/Stripe discussion); no real provider, SDK, or hardware exists yet to test against. Revisit this whole block once that's unpaused.

## How to use this doc going forward

- When resuming testing, scan for **Заблокирован** rows first — check whether the blocking condition (hardware, privileges, a paused integration) has changed.
- Update a row's Status and Notes together — a bare status flip without what was actually observed loses exactly the kind of detail that made today's testing valuable (e.g. the WSD timing non-determinism, or the pg-pool crash bug — neither would have been found without running the real test and reading the real result).
- New tests discovered while investigating something else (the way `printer.interactive-port` and the pg-pool bug were both found by accident today) get added here **and** cross-referenced into `docs/equipment-monitoring-requirements.md`'s own equipment section — this file is the checklist/status view, that one is the taxonomy/methodology source of truth.
