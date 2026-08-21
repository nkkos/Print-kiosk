# Remote Equipment Monitoring & Incident Handling — Confirmed Requirements

Internal project document. The pavilion is meant to run fully unattended from day one — no on-site staff — so equipment failures have to be detected, logged, and (where safely possible) auto-remediated remotely, with a human operator notified whenever something needs a real decision. This document consolidates what's been confirmed so far about that process: a general methodology, plus one section per hardware/software element covered today. It directly starts answering two of `docs/product-overview.md`'s long-standing open questions ("What is the scope of the administrative interface (monitoring, remote configuration, reporting)?" and "What is the required behavior when the kiosk loses network connectivity?") — not exhaustively, but as a first confirmed slice.

This document defines requirements only — implementation (the `incidents` table, the Telegram notifier, the watchdog process) is tracked separately, not started yet.

## Purpose

Establishes a single, consistent way to detect, log, notify about, and (where safe) auto-recover from equipment failures — so the pavilion's unattended operation doesn't depend on someone happening to notice a problem in person.

## Methodology

### Incident model

Every failure — regardless of which piece of equipment it comes from — is recorded as one **Incident**, using a single shared shape rather than a separate table/format per equipment type. This is what makes cross-equipment correlation and a unified operator view possible later.

| Field                       | Meaning                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `id`, `createdAt`           | standard                                                                                                        |
| `source`                    | which subsystem — `pc`, `printer`, `display`, `network`, `backend`, `payment-terminal`, ... (extensible)        |
| `code`                      | machine-readable, namespaced by source — e.g. `printer.paper-jam`, `network.backend-unreachable`                |
| `severity`                  | `info` / `warning` / `critical` / `emergency` — see below                                                       |
| `message`                   | human-readable description for the operator                                                                     |
| `context`                   | free-form JSON — whatever's relevant (last job id, driver error text, heartbeat gap, etc.)                      |
| `autoRemediation`           | what the system tried on its own, if anything, and the outcome                                                  |
| `resolvedAt` / `resolvedBy` | `resolvedBy` is `auto` or `operator`, or both null while still open                                             |
| `correlationId`             | links related events into one incident timeline (e.g. jam → retry → retry-failed → operator-alerted → resolved) |

### Severity levels

- **`info`** — self-healed on the first attempt; kept for history/analytics, never wakes anyone.
- **`warning`** — degraded but the kiosk still works (low ink, a single sub-minute network blip, a skipped virus scan). Batched into a daily digest, not pushed immediately.
- **`critical`** — a customer-facing feature is broken (printer offline, backend unreachable) — needs an operator, but isn't a physical-safety concern.
- **`emergency`** — needs immediate human attention (PC completely unresponsive past its threshold, a physical tamper event). Always pushed immediately, never batched.

### Detecting total failure, not just logged exceptions

A dead process can't log its own death. Two complementary detection paths are needed:

1. **In-process exception handling** — catches known, "expected" failures (jam, offline device, DB error) at the point they happen and calls a shared `reportIncident(...)`.
2. **Heartbeat / liveness check** — the kiosk PC pushes a periodic "I'm alive" signal to the backend (or the backend polls it); if no heartbeat arrives within a threshold, the backend itself raises the incident — this is the only way `pc.dead` (case E in the PC section below) is ever detected, since nothing on a fully hung machine can self-report.

### Notification & escalation

**Confirmed: on-call is a rotating team, and alerts stay on Telegram only — no SMS/phone escalation for now.** That combination shapes the escalation design:

- `critical`/`emergency` alerts go as a direct Telegram message to whoever is currently on duty.
- If unacknowledged past a threshold (not yet numerically fixed — see Open items), the alert additionally posts to a shared ops group chat visible to the whole team, so a backup person can pick it up — still Telegram, no SMS/call fallback.
- `warning`-level events are batched into a daily digest posted to the shared group chat, not sent to individuals in real time.
- **Deduplication:** repeated occurrences of the same `correlationId` don't re-notify on every retry — only on first occurrence, on severity escalation, or after a cooldown window if still unresolved.
- **Known risk, accepted for now:** since there's no SMS/call fallback, an `emergency` alert that nobody sees on Telegram in time has no other path to a human. Worth revisiting once the team/pavilion count grows — see Open items.

**Implemented and verified live (2026-08-21), with two deliberate simplifications from the design above** (`server/telegramNotifier.ts`):

- **One shared chat, not a personal DM to whoever's on duty.** A Telegram bot can't message an arbitrary person until they've started a chat with it first — a real onboarding step this pass doesn't build — and there's no public webhook endpoint available locally to capture per-person chat ids even if it did. The on-duty person is still named in the message text (resolved from the new weekly roster — see below), just not DM'd individually. Escalation-to-group-chat and the "direct" alert collapse into the same channel for now.
- **Deduplication is a plain `(source, code, notifiedAt within a 10-minute cooldown)` check, not a correlationId chain** — no real `reportIncident(...)` call site anywhere in this codebase actually populates `correlationId` yet, so there was nothing to chain against. Verified live: a second identical `printer.paper-jam` reported within the cooldown window left `notifiedAt` null (no Telegram call attempted), confirming dedup actually suppresses the resend rather than just being reasoned about.
- Dev fallback matches Resend/ClamAV's own pattern: missing `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` logs the would-be message instead of sending — verified this path live too (the on-call name correctly resolved into the logged message).
- The **daily digest for `warning`-level events is not implemented** — batching requires a scheduled job, and there was no practical way to verify a 24h cadence live in this session. Only `critical`/`emergency` actually notify today.
- **On-call roster is real**, not a placeholder: `staffRoster`/`staffAccounts` (a genuinely separate table from the kiosk/portal's own `accounts` — see `docs/screens/admin-panel-wireframes.md`'s note on why), a fixed weekly (not date-specific) schedule, edited only via `server/scripts/setRosterDay.ts` — no UI, per the confirmed decision.

### Auto-remediation — general principle

Try a bounded, safe automatic fix for known-transient failures before escalating — but:

- Always log (and usually alert) even when the auto-fix worked, so a component that's quietly self-healing repeatedly doesn't stay invisible until it fails for good.
- Cap retry/restart attempts — never loop indefinitely. A capped cascade (see the PC section) that ends in "stop and wait for a human" is always better than an endless retry loop that could waste consumables or mask a real hardware fault.
- **Hardware power-cycle (confirmed: planned)** is the last resort in that cascade — a remotely managed relay/smart plug that can cut and restore power to the kiosk PC when nothing software-level gets a response. After an automatic hardware power-cycle, the system requires an operator's manual acknowledgment before it's allowed to attempt another one — this is the boot-loop guard.

## Equipment sections

Each section: known failure modes (with their `code`), how they're detected, what auto-remediation (if any) applies, and escalation notes. Sections will be added over time as more equipment/scenarios are worked through — door lock control, camera/CCTV-based hazard detection, and the remote customer intercom are deliberately **not** covered here yet (see Scope boundaries).

### A. Kiosk PC (host)

The machine the whole application runs on.

**Known failure modes:**

- `pc.os-crash` — OS hang or crash
- `pc.disk-full` — logs, `server/uploads/`, or conversion temp files fill the disk
- `pc.unexpected-restart` — an unplanned reboot (e.g. a forced Windows Update)
- `pc.unresponsive` — the app's own health-check stops responding, but it's not yet known whether the OS itself is still alive
- `pc.dead` — no heartbeat received past the threshold (the most severe case — see "Detecting total failure" above)
- `pc.peripheral-disconnected` — a USB device (printer, future payment terminal) drops off at the OS level
- `pc.overheating` — only if a temperature sensor is added later; not currently instrumented

**Detection:** local watchdog process polling the app's health endpoint, plus the heartbeat pushed to the backend for the `pc.dead` case.

**Auto-remediation (capped cascade):**

1. App unresponsive → restart the app process (browser/kiosk-mode window) — 1 attempt.
2. Still unresponsive → software-level OS restart — 1 attempt.
3. Still no heartbeat (or the OS restart itself never lands) → hardware power-cycle via the managed relay — 1 automatic attempt, then requires operator acknowledgment before another cycle is allowed.

**Escalation:** `pc.dead` is always `emergency`. Every step of the cascade above still logs an incident even if it resolves the problem.

### B. Printer

`server/printerAdapter.ts` already submits real print jobs; this section is about turning its failure paths into structured, alertable incidents instead of silent/generic failures.

**Known failure modes:**

- `printer.out-of-paper`
- `printer.out-of-ink`
- `printer.paper-jam`
- `printer.offline` — lost its USB/network connection
- `printer.queue-stuck` — a job hangs in the Windows spooler
- `printer.cover-open` — or any other "needs a physical hand" state
- `printer.driver-crash`
- `printer.conversion-failed` — LibreOffice/`heic-convert` unavailable or failed; already falls back to the placeholder PDF today, but that fallback currently happens silently and should raise a `warning` instead
- `printer.submit-timeout` — **confirmed reproducible, not just anticipated**: found while testing against a real default-in-Windows-but-unreachable printer — `pdf-to-printer`'s underlying call has no timeout of its own, so it hung indefinitely instead of failing. Worse than a silent single job: `server/printQueue.ts`'s serial queue waits for each submission to _settle_ before starting the next one, so an unbounded hang stalls every subsequent print job too, not just the stuck one. Fixed by racing the submission against a 25s timeout (`server/printerAdapter.ts`) so a hang becomes this code instead of silence.
- `printer.interactive-port` — **new, found while verifying the fix above**: a printer whose Windows port requires a human (e.g. "Microsoft Print to PDF"'s `PORTPROMPT:` port, which waits for someone to choose a save location) hangs identically to an unreachable device in a headless kiosk context — confirmed live, it hit the same 25s timeout. Not a connectivity problem at all: this is a printer-type/setup mistake, not a runtime failure to auto-remediate — see "Verification tests" below, category B7.

**Detection:** extend `server/printTaskStore.ts`'s existing status tracking with these specific codes instead of a generic failure state (now implemented — every `printer-not-found`/`submit-failed`/`submit-timeout`/simulated outcome flows through `updatePrintTaskStatus` into `reportIncident`); add a spooler-queue health check for `queue-stuck`.

**Auto-remediation:**

- `queue-stuck` → restart the spooler service and resubmit the job once; if it still fails, stop and raise `critical` — no further retries (avoids wasting paper/ink on a doomed job). **Caveat found 2026-08-21:** restarting the Spooler service requires elevated/admin privileges — confirmed by trying it (`Restart-Service -Name Spooler` fails outright under the account this backend normally runs as). This auto-remediation step isn't viable until the kiosk process is deliberately granted that privilege at deploy time; not yet done.
- `out-of-paper` / `out-of-ink` / `paper-jam` / `cover-open` → no auto-fix is possible (needs a physical hand) — always `critical`, no retry loop at all.
- `conversion-failed` → keep the existing placeholder-PDF fallback, but now also raise a `warning` so it's visible instead of silent.
- `submit-timeout` → no automatic retry in this pass (a hung printer usually needs a physical check, not a resubmission) — surfaces as `critical` and unblocks the queue for the next job. **Confirmed by live testing, not just left open:** a bounded auto-retry does _not_ reliably help — two consecutive real attempts against the same unreachable printer took 7.6s (a fast `submit-failed`) then 27s (a full `submit-timeout`) — the second attempt was slower, not faster. Retrying is a gamble, not a fix; not adopted as an auto-remediation step.

**Escalation:** `critical` for anything that blocks printing right now — this is the single most customer-visible failure category.

**Verification tests (2026-08-21)** — an exhaustive list for exercising this section, organized by category. Items marked _(confirmed)_ were actually run against a real printer this session, not just designed on paper.

- **B1. Printer registration in Windows** (fast, no real device contact needed)
  1. No default printer configured at all → `getDefaultPrinterName()` returns null → `printer.offline`.
  2. An explicitly-requested `printerName` that doesn't match any installed printer.
  3. A printer Windows itself marks Paused/Error via `Get-Printer` — **don't rely on this alone**: _(confirmed)_ a real unreachable WSD printer still reported `PrinterStatus: Normal` the whole time; Windows' own printer-object status doesn't reflect real device reachability.
- **B2. Real device unreachable** (the most common real-world case) 4. USB printer physically disconnected. 5. Network/WSD printer powered off or off the network — _(confirmed)_ **the failure timing is non-deterministic**: two consecutive identical attempts against the same real unreachable printer took 7.6s and 27s respectively. A single test run proves nothing; run this scenario several times before drawing conclusions. 6. Immediate retry after a failure — _(confirmed, see Auto-remediation above)_ — doesn't reliably help or fail faster. 7. A printer whose port requires human interaction (`PORTPROMPT:` and similar — Print to PDF, Print to XPS, other "virtual output" printers) — _(confirmed)_ hangs exactly like an unreachable device; this is a printer-type/configuration mistake, not a connectivity fault. **Practical implication:** never configure this class of printer as the kiosk's active target — worth a startup-time sanity check (query the configured printer's port type, warn loudly if it's interactive) rather than only discovering it via a live 25s customer-facing hang.
- **B3. Print queue / spooler** 8. Spooler service stopped — _(attempted, blocked)_: needs admin/elevated rights to even test; the account this backend runs under doesn't have them today (see the `queue-stuck` auto-remediation caveat above). 9. Queue backed up with stale jobs from a previous crash. 10. Concurrent submissions — fire two or more `POST /api/print-tasks` at once and confirm `server/printQueue.ts`'s serial queue still bounds total wait time correctly (one stuck job shouldn't block others past their own timeout window).
- **B4. Job data** 11. Very large or corrupted PDF. 12. Print options (paper size, page range, etc.) the target printer doesn't actually support.
- **B5. Permissions/environment** 13. Process lacking OS-level permission to use the printer. 14. Missing or corrupted printer driver.

**Ruled out, with evidence, not just assumption:** a cheap pre-flight "is the printer alive" check before committing to a real print — investigated directly in `pdf-to-printer`'s source: `getPrinters()`/`getDefaultPrinter()` both only run `Get-CimInstance Win32_Printer`, reading Windows' own cached printer metadata, never actually contacting the device. A WSD port doesn't even expose a resolvable host/IP (`Get-PrinterPort` shows an empty `PrinterHostAddress`) to probe independently. There is no cheap way to know a printer is really reachable short of attempting the real job — which is exactly what the `submit-timeout` fix already does, as fast as this can honestly be done today.

### C. Touchscreen / display

**Known failure modes:**

- `display.no-signal`
- `display.touch-unresponsive` — the screen shows a picture but doesn't react to touch (the most deceptive case — looks fine from a camera glance)
- `display.app-frozen` — the UI layer specifically hung (a subset of `pc.unresponsive`, but worth its own code since the OS/host can otherwise be fine)
- `display.asleep` — didn't wake after an idle period

**Detection:** touch has no natural "heartbeat" the way a process does — for now this rides on the same app-level health-check as `pc.unresponsive`. A dedicated synthetic touch self-test is flagged as an open item, not solved here.

**Auto-remediation:** same capped cascade as the PC section (app restart → OS restart → hardware power-cycle).

**Escalation:** `critical` — a broken screen blocks the entire kiosk regardless of what else works.

### D. Network / connectivity

**Known failure modes:**

- `network.local-down` — the pavilion's own router/LAN is down
- `network.backend-unreachable` — the kiosk can't reach the Railway backend, whether the local network or Railway's side is at fault
- `network.flapping` — repeated short outages rather than one clean down/up

**Detection:** the same heartbeat mechanism used for `pc.dead` doubles as network-liveness detection — from the backend's point of view, "no heartbeat" and "network down" look identical, which is fine since both need the same response (alert, can't be auto-fixed remotely).

**Auto-remediation:** none possible for the network itself — this is purely detect-and-alert. Sub-minute blips are not alerted individually; only sustained outages past a threshold raise an incident. Flap frequency itself is tracked as a `warning` signal, since frequent flapping usually means degrading hardware even when each individual outage is short.

**Escalation:** `critical` once sustained — it blocks every network-dependent feature (QR upload, the Scan/Copy phone hand-off, payment).

### E. Backend-dependent services

Covers the Postgres database, the ClamAV daemon, and the backend's own application code — not the kiosk PC.

**Known failure modes:**

- `backend.db-unreachable` / `backend.db-pool-exhausted`
- `backend.clamav-unreachable` — implemented and verified live (see the equipment monitoring session log): `warning` in dev (fail-open), `critical` in production (fail-closed, a real file gets rejected)
- `backend.disk-full` — the Railway volume backing uploads
- `backend.process-crash`
- `backend.scan-processing-failed` — **new, implemented and verified live**: Scan/Copy's own `warpAndCleanPage` failing (`InvalidCornersError` for a degenerate quad, or anything else unexpected) — wired into `scanStore.ts`/`copyStore.ts`'s `processPage`. `InvalidCornersError` reports as `info` (self-resolvable — the person just retakes the photo); anything else reports `warning`. This doesn't cleanly belong to any of the six equipment sources (it's the backend's own image-processing logic, not a dependency) — bucketed under `backend` for now rather than introducing a seventh source category; worth revisiting (see Open items).
- `backend.email-send-failed` — **new, implemented**: any real Resend send failure (`server/emailSender.ts`, called from `routes.ts`'s registration/password-reset/scan-email-delivery routes) now reports an incident before re-throwing, so the existing HTTP behavior (500 on register/reset, 502 on scan delivery) is unchanged — only visibility was added. Not verified against a real Resend failure this session (would have required actually breaking the working `RESEND_API_KEY`); confidence comes from mirroring the already-verified `sendScanEmail` catch-and-report pattern exactly, not from a live test.
- `backend.unhandled-route-error` — **new, implemented**: a catch-all Express error-handling middleware (`server/index.ts`, registered after every route) catches anything not explicitly wired above — Express 5 auto-forwards a rejected async handler's error here even without a try/catch at the call site. The backstop for whatever this document hasn't anticipated yet.

**Detection:** `reportIncident(...)` is now wired into every catch/fail-open branch listed above, plus the catch-all middleware as a backstop — no longer just a plan.

**Real bug found and fixed while wiring this section (2026-08-21):** `server/db/client.ts`'s `pg.Pool` had no `'error'` listener at all. Confirmed by reading `pg-pool`'s own source: it emits `'error'` on an idle client's unexpected disconnect, completely separate from any query's own promise rejection — and Node's default behavior for an unlistened `EventEmitter` `'error'` event is to throw, which `server/index.ts`'s `uncaughtException` handler would then treat as fatal and exit the whole process over a transient DB blip. **Verified live**, not just reasoned about: forced a real idle-connection termination via `pg_terminate_backend` against the running dev backend — before the fix this would have crashed it; after adding `pool.on('error', ...)` (reports `backend.db-unreachable`, `critical`, and does not rethrow), the backend stayed up, kept serving requests, and the pool recovered on its own.

**Also verified live:** a genuinely corrupt `.heic` upload reliably produces `backend.scan-processing-failed`'s sibling, `printer.conversion-failed` (Section B) — worth noting a corrupt `.docx` did **not** reproduce the same failure in testing: LibreOffice converted a plain-text file with a `.docx` extension without complaining, producing a readable (if garbled) PDF rather than failing. `heic-convert` (pure JS, no LibreOffice tolerance) rejected the equivalent garbage input immediately. Conversion-failure testing for `.doc`/`.docx` needs a genuinely malformed OOXML file, not just wrong content, to reproduce reliably — not yet found one.

**Auto-remediation:** DB reconnect uses the driver's own exponential backoff for query-time failures; the new `pool.on('error', ...)` handler covers the separate idle-client case, and deliberately does not attempt to reconnect itself — `pg-pool` already replaces the failed idle client internally, this handler's only job is stopping it from crashing the process. ClamAV stays fail-open (dev) / fail-closed (prod) by design — the fix here is visibility, not a different failure behavior. `scan-processing-failed`/`email-send-failed`/`unhandled-route-error` have no auto-remediation — a bad photo needs a retake, a bad send needs investigating, and an unanticipated error is by definition not something with a pre-planned fix.

**Manual remote fix (confirmed):** a senior can trigger a full backend-process restart from the admin panel (`docs/screens/admin-panel-spec.md`'s `equipment-fix-backend-restart-process`) — implemented as the backend calling `process.exit(1)` itself after logging the incident and letting the response flush, relying on Railway's own restart-on-crash policy to bring a fresh instance up (the same platform behavior `server/index.ts`'s existing `SIGTERM`/`SIGINT` handling already coexists with for routine redeploys). Not a cascade like the PC's — one manual action, no automatic retry ladder, since an unwanted backend restart is disruptive enough that it should never happen without a person deciding to.

**Escalation:** `critical` for DB down and any unhandled route error (both potentially break broad swaths of the app). ClamAV skips start as `warning`/digest, but escalate to `critical` if they persist for a sustained period — a long-running AV bypass is a real exposure, not just noise. `scan-processing-failed` at `info` severity is deliberately quiet — a single bad photo is normal, expected, and self-resolving.

### F. Payment terminal (placeholder — integration currently paused)

Generic failure categories only, not tied to a specific provider yet — payment integration is on hold pending commercial terms (see the Besteron/Stripe discussion). This section gets revised with real error codes and retry semantics once a provider is chosen.

**Known failure modes (generic):**

- `payment-terminal.offline`
- `payment-terminal.transaction-timeout`
- `payment-terminal.host-unreachable` — network path to the PSP itself
- `payment-terminal.certificate-expired`
- `payment-terminal.tamper-detected` — not a routine failure: a physical tamper attempt, the terminal self-locks

**Detection / auto-remediation:** TBD — depends entirely on the chosen provider's SDK/protocol (Besteron, for instance, exposes PAX/NEXO/ZVT/AXA PRO2).

**Escalation:** everything else here is `critical` at most, but `payment-terminal.tamper-detected` is always `emergency` regardless of provider — it's a physical-security incident, not an operational one.

## Scope boundaries

Deliberately **not** covered in this document, tracked as separate future topics from today's "fully autonomous pavilion" discussion:

- Entrance lock open/close scenarios.
- Camera/CCTV-based automatic hazard detection.
- The remote customer-support intercom (video/audio "call an operator").
- The on-call roster's actual implementation (where the shift schedule lives, how an incident gets routed to the _currently_ on-duty person's Telegram) — this document states the requirement (routing must exist), not the tool that provides it; likely lands in the future admin panel/CRM system per `docs/product-overview.md`'s "Administrative interface" line item.
- A concrete payment-terminal provider (Section F stays generic until one is chosen).

## Open items

- Exact cooldown/retry-count thresholds per failure type — the numbers used above (1 retry here, N minutes there) are illustrative starting points from this discussion, not tuned/confirmed values. The Telegram notify cooldown (10 minutes) is the one number in this bucket that's actually implemented and live-verified now, still not "tuned" in any real sense.
- Managed relay/smart-plug hardware selection for the PC power-cycle — confirmed as planned, but no specific product chosen yet.
- Whether "Telegram only, no SMS/call" escalation remains sufficient once the team or pavilion count grows — explicitly accepted as a known gap for now (see Methodology, "Notification & escalation").
- A dedicated synthetic touch-input self-test for the display section — currently just inherits the PC's app-level health-check, which may not actually catch `display.touch-unresponsive` reliably.
- Door lock scenarios, camera/CCTV hazard detection, and the remote customer intercom — separate documents, not started.
- **New (2026-08-21):** granting the kiosk backend process whatever elevated privilege it needs to actually restart the Spooler service — confirmed missing today, blocks the `queue-stuck` auto-remediation step entirely until addressed at deploy time.
- **New (2026-08-21):** a startup-time sanity check that warns if the configured/default printer sits on an interactive port (`PORTPROMPT:` or similar) — proposed after `printer.interactive-port` was found, not yet implemented.
- **New (2026-08-21):** B3's spooler-backup and concurrent-submission tests (items 9–10) — designed but not yet actually run, unlike the rest of the B-section list.
- **New (2026-08-21):** whether `backend.scan-processing-failed` deserves its own equipment source (e.g. a seventh "capture"/"scan" category) instead of being bucketed under `backend` — flagged when adding it, not resolved; the admin panel's six-source assumption (`docs/screens/admin-panel-spec.md`'s Notes for implementation) would need revisiting either way.
- **New (2026-08-21):** `backend.email-send-failed` is implemented but only verified by code-pattern review, not a live-forced Resend failure (would have meant breaking the real, working `RESEND_API_KEY`) — lower confidence than everything else wired today, which was all verified live.
- **New (2026-08-21):** reproducing a genuine `.doc`/`.docx` conversion failure — a plain-text file with a `.docx` extension didn't trigger one; LibreOffice converted it anyway. A real malformed-OOXML test file is still needed to verify that path as thoroughly as `.heic` was verified.
- **New (2026-08-21):** Telegram's daily digest for `warning`-level events — not implemented at all (only `critical`/`emergency` notify today).
- **New (2026-08-21):** escalation-to-group-chat-on-timeout — not implemented; today's Telegram wiring only sends the initial alert, nothing checks whether it went unacknowledged and reposts anywhere.
- **New (2026-08-21):** per-person Telegram DM (vs. today's one shared chat) would need each staff member to message the bot first (to obtain a chat id) plus a public webhook endpoint to capture that — neither exists; revisit once deployed somewhere with a real public URL (Railway), not locally.
- **New (2026-08-21):** `hasActiveKioskSession()`'s 10-minute staleness threshold (`server/sessionLifecycle.ts`) is a reasonable-guess safety margin against the kiosk's own ~6-minute idle-timeout, not a tuned value — same honesty as every other threshold in this list.
