# Pavilion Security — Business Requirements

Internal project document. The pavilion (unit 1.33, Astoria Passage, Bratislava) runs unattended, so opening and closing it, watching it and raising the alarm in an emergency have to work without anyone on site. This document fixes the business requirements for the entrance door, presence detection, video surveillance, sensors and alerts, and the power and network behaviour they depend on. Hardware choice and implementation come after it.

Status of each requirement:

- **Confirmed** — decided by the product owner (2026-10-16).
- **Proposed** — a default written down so the document is complete; stands until the product owner changes it.

This document fills the gap `docs/equipment-monitoring-requirements.md` leaves open ("door lock scenarios, camera/CCTV hazard detection ... separate documents, not started"). Alerts reuse that document's incident model, severity levels and Telegram notification — they are not a second alerting system. An earlier ChatGPT discussion of the same topic (shared by the product owner, 2026-10-16) was reviewed; what was taken from it, and what was not and why, is listed at the end.

## Principles

1. **Exit from inside always works, mechanically** (confirmed). The inside handle opens the door without power, software or network, whatever state the software put the lock in. Software only ever controls entry from outside. This is a fire-safety requirement, not a convenience — EU workplace rules forbid locking emergency exits so that a person cannot leave immediately.
2. **Safety runs on site, independent of the kiosk software** (proposed). The alarm panel and the lock controller are devices of their own, not programs on the mini-PC or a stand. They hold the schedule, keep their own clock, and keep detecting, sounding and locking if the mini-PC hangs, the cloud is down or the internet is lost. The mini-PC print agent only bridges their events to the cloud and passes operator commands down. The cloud edits the schedule and sends commands; without it the pavilion keeps working on the last valid schedule.
3. **No power means locked from outside** (proposed). The door stays locked to anyone outside (fail-secure); it still opens from inside by handle and from outside with the mechanical key. The safety devices and their network path run on the UPS, so a short outage changes nothing.
4. **Every security event is an Incident** (proposed) — `reportIncident` with source `security` or `power`, severities as in `docs/equipment-monitoring-requirements.md`, the same Telegram notification and admin-panel view.
5. **Every opening and every manual action is logged** (confirmed: journal wanted) — who or what did it, how, and when.
6. **Our monitoring is not certified fire protection** (proposed). Whether the unit needs a certified fire alarm system (EPS, regulated by vyhláška 726/2002 Z. z.) and what fire equipment it needs is decided by a fire-safety specialist (technik požiarnej ochrany) for this unit. Our smoke and heat detection adds early warning on top; it does not replace a required EPS.

## 1. Entrance door

Only the entrance door from the passage is controlled (confirmed). It is a glass door owned by the building owner (the city), so **any lock or strike fitted to it needs the owner's written consent**, and the hardware should avoid drilling the glass. The operator door of the technical compartment uses an ordinary key and is not controlled; it is only monitored (section 4).

### Hardware

**Budget first** (confirmed, 2026-10-16): a consumer smart lock, not a commercial lock with a separate controller.

**Chosen: Nuki Smart Lock Pro (4th generation), about 289 €** (confirmed). The door has a euro key cylinder (confirmed), so the lock mounts inside on that cylinder and turns it: no drilling of the glass or the frame, removable without a trace — the least intrusive option for a door the city owns.

**No keypad** (confirmed): the entrance should look clean. Everything else about the lock stays as plain as possible.

What the Nuki setup must provide:

- **Mechanical exit from inside** (confirmed) — the lock's turn knob opens the deadbolt by hand with a flat battery, no power and no network; the door's latch opens by its handle as before. Whether a turn knob (rather than a single push handle) is enough for this door is a question for the fire-safety specialist.
- **Mechanical opening from outside** (confirmed) — a key in the cylinder, for a dead battery or a fault. This needs a cylinder with an emergency function (the key works from outside while the Nuki sits on the inside); if the present cylinder lacks it, it is replaced (about 30–50 €).
- **Self-locking:** "lock immediately after closing" with the door sensor, so an inside exit or an operator visit never leaves the door unlocked in Closed mode.
- A **door closer**, so the door actually closes on its own — check the door has one.
- **Two separate signals**, both from Nuki:
  - the door sensor (is the door shut?);
  - the lock state (is it actually locked?).

  Together they tell apart four situations software alone cannot: shut and locked; shut but not locked; open; told to lock but still open.

- **Schedule and commands from our software** (confirmed: by schedule and by admin-panel command). Nuki has no opening-hours schedule of its own, so the print agent on the pavilion mini-PC runs the schedule and drives the lock over the local network (Nuki's local API or Matter). That keeps the schedule independent of the internet; principle 2's "independent of the kiosk software" is relaxed here for budget — if the mini-PC is down, the door stays in its last state and the operator uses the admin panel once the mini-PC is back, or the key.

### Modes

| Mode   | When                                   | Door                                                                                                              |
| ------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Open   | Opening hours, unless an exception     | Closed but unlocked: a customer pulls the handle and walks in (confirmed — no automatic opener, not propped open) |
| Closed | Outside opening hours, or an exception | Locked from outside; opens from inside by handle                                                                  |

**Opening hours: every day 7:00–22:00** (confirmed).

**Friendly entrance** (confirmed goal): people must not be afraid to pull the handle. Proposed:

- a sign at the handle — "Otvorené · Open · 7:00–22:00 · potiahnite / pull";
- a status light by the door, green when open and red when closed, so the state is clear from the passage.

### Exceptions

- The operator can close the pavilion for any period — hours, days, until further notice (confirmed): for repairs, holidays, an incident.
- An exception has a start, an end (or "until reopened") and a reason shown in the journal (proposed).
- Proposed: the stands show "Pavilón je dočasne zatvorený" with the reopening time while an exception is active.

### Opening sequence (proposed)

At **6:45** a self-test checks the safety conditions:

- no smoke or heat alarm since the last close;
- no unresolved intrusion alarm;
- the lock, door contact and bolt signal answer;
- mains power present;
- the alarm panel answers.

If all pass, the door switches to Open at 7:00. If any fails, the door **stays closed** ("Opening blocked — inspection required"), and a `critical` incident names the failed check.

Only safety conditions block opening. A broken printer or stand is an ordinary equipment incident: the pavilion still opens and the stands show what is unavailable.

### Closing sequence (proposed timings)

1. **21:50** — announcement over the pavilion speaker (the background-music speaker, confirmed) in Slovak and English: the pavilion closes in 10 minutes. The stands show a closing banner.
2. **21:55** — the stands stop starting new sessions; sessions already paid finish printing.
3. **21:58** — second announcement.
4. **22:00** — the door locks if the presence sensor (section 2) sees nobody. If someone is still inside:
   - the door waits up to 15 minutes, repeating the announcement every 5 minutes;
   - it locks at the latest at 22:15 — the person can still walk out by the inside handle, and the door re-locks behind them;
   - a `critical` incident "person inside after closing" goes to the operator with the hall camera.
5. **After locking** — the door contact must report shut and the bolt locked. If not, a `critical` incident "pavilion failed to lock" goes to the operator.

### Operator entry outside hours

- **Who:** the operator (confirmed).
- **How** (confirmed): standing at the door, the operator opens the admin panel on a phone and opens the door. No keypad, no PIN.
- Proposed:
  - the journal shows who came in through their admin-panel login; a leaving operator loses access when their staff account is disabled;
  - an admin opening also disarms the intrusion alarm until the door is locked again, so a visit does not raise `security.motion-after-hours`;
  - after an admin opening, the door re-locks automatically on closing.
- **Mechanical key** (confirmed: mechanical opening must remain) — for a dead lock battery, a down mini-PC or no internet on the operator's phone; held by the senior operator (proposed).

### Operator commands

Confirmed for the first version, **senior operator only** (as with the "Сразу" forced stand reload):

- **Open now** — the door switches to Open mode until the next scheduled change or until "Close now".
- **Close now** — the door switches to Closed mode, through the same presence check and lock confirmation as the 22:00 sequence.

Considered and not needed now: "open for 10 minutes" for a courier or technician, and a "lock down everything" emergency mode. Add them only when a real case appears.

### On a smoke or heat alarm

The entrance **stays locked from outside** (confirmed): the door is glass, firefighters can get through it, and a false alarm at night with an open door is the bigger risk. Inside exit works as always.

### Journal

Every opening, mode change and manual action is recorded (confirmed):

- when;
- what — door opening, mode change, schedule or exception edit, alarm acknowledgement, playback of incident video;
- how — schedule, admin command, inside knob, key (as far as the lock can tell them apart);
- who — the operator for admin commands.

Proposed: kept for 12 months, shown in the admin panel and filterable by date.

## 2. Presence detection

Proposed. The closing sequence needs to know whether anyone is still inside, and the intrusion alarm needs to know whether anyone is moving after hours.

- **A ceiling mmWave presence sensor** in the hall. It detects a person standing or sitting still, where an ordinary motion sensor (PIR) thinks the room is empty.
- **The alarm system's own motion sensor** (PIR) for intrusion. Certified alarm systems use it, and it is what an insurer counts.
- **Presence data is used only for the closing and alarm logic.** No movement tracks or counts are stored.

## 3. Video surveillance

**Purpose — both** (confirmed): evidence after vandalism or theft, and a live remote look at the pavilion, for example when an alert arrives.

### Cameras

**Two cameras** (confirmed):

- **Hall** — the main one. It may be a pan-tilt (PTZ) camera the operator turns remotely; it returns on its own to a default position showing the hall, the stands and the entrance door (proposed).
- **Technical compartment** — a simple fixed camera inside. It also sees anyone who opens the operator door.

A single camera cannot replace both: the compartment is closed, so a hall camera never sees inside it.

**Budget first** (confirmed, 2026-10-16): consumer indoor cameras at about 50 € each (Xiaomi class), recording to a memory card, viewed remotely in the vendor's app — not PoE cameras with a separate recorder. The storage and retention rules below apply as far as such a camera allows: a looping memory card replaces the recorder, and incident clips are saved by hand from the app until the software can do it.

**Candidate: TP-Link Tapo C220** (about 40–45 € + memory card; proposed) over a Xiaomi camera of the same price, because it offers RTSP/ONVIF — the mini-PC can later save incident clips itself, and the camera can join a recorder without being replaced. It also has pan/tilt, privacy zones and a microSD slot. Wi-Fi 2.4 GHz only.

When setting it up, check:

- an EU data region for the vendor's cloud;
- privacy zones over screens, the PIN pad and the passage;
- the microphone switched off;
- the memory card size so the loop lasts about 72 hours (roughly 32 GB, to verify after a day of recording).

### What the cameras must never see

Proposed:

- the inside of the photo corner;
- a payment terminal's PIN pad;
- stand screens, the scan shelf or the printout cells closely enough to read a customer's document;
- more of the passage through the glass than the door itself needs.

Where the angle cannot avoid one of these, a privacy mask blacks it out in the recording.

**No audio** (confirmed).

### Storage

Confirmed rule: no place that needs an approval, and the remote operator can reach it. None of the options below needs an authority's approval — GDPR asks for no prior permission, only the obligations listed under GDPR.

Proposed:

- **Recording on site:** on a small recorder (NVR) in the technical compartment, encrypted, on the UPS, on the security network (VLAN, see `docs/pavilion-launch-checklist.md`). Recording continues when the internet is down.
- **No continuous cloud recording.** The pavilion's uplink is a weak LTE signal (`docs/pavilion-launch-checklist.md`), and a camera stream of roughly 1–2 Mbit/s each would compete with printing and payments.
- **Incident clips go to the cloud.** On an `emergency` incident, a clip from 5 minutes before to 15 minutes after the event is uploaded, so evidence survives even if the recorder is stolen or destroyed.

### Retention

Proposed:

- **ordinary recording — 72 hours,** then overwritten automatically;
- **incident clips** (from an incident, or marked by the operator) — kept in a separate incident archive until the incident or police case is closed.

Why 72 hours and not longer: the European Data Protection Board's video guidelines (published in Slovak by ÚOOÚ) say that for a small shop protecting against vandalism, about 24 hours is usually enough, and anything beyond 72 hours needs stronger justification. 72 rather than 24 covers a weekend when only Telegram watches the pavilion.

### Remote view

Proposed:

- live view, PTZ control and playback for the operator;
- first version: the camera vendor's own app, over an encrypted connection;
- later: the admin panel opens the right camera from an incident.

### GDPR

- a camera notice at the entrance (pictogram + controller identity + where the full privacy notice is);
- a privacy notice section on video;
- an entry in the record of processing activities;
- a short legitimate-interest assessment.

## 4. Sensors and alerts

**Sensor set confirmed** (2026-10-16):

- smoke;
- temperature and humidity in the technical compartment;
- entrance and operator-door contacts;
- hall motion;
- mains loss from the UPS;
- a glass-break detector for the shop window.

No water-leak sensor: the pavilion has no water supply (confirmed).

Proposed additions:

- **a heat / rate-of-rise detector** in the technical compartment, next to the smoke detector;
- **a temperature sensor in the hall.**

**Our smoke detectors are the only fire detection in the unit**: the passage's fire alarm system does not cover it (confirmed). So:

- at least one smoke detector in the hall and one in the technical compartment;
- a loud local siren, so the passage's night security or a passer-by notices;
- no detector may depend on the internet to sound locally.

Incident codes, severities and thresholds below are proposed. Each event maps to an incident code and a severity; `emergency` is always pushed immediately, never deduplicated away within the cooldown if the event repeats after being resolved.

| Event                                                                    | Incident code                        | Severity    | Notes                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------ | ----------- | ------------------------------------------------------------------------ |
| Smoke detector (hall + technical compartment)                            | `security.smoke`                     | `emergency` | Local siren; the only fire detection in the unit                         |
| Heat detector, or compartment temperature rising more than 5 °C in 5 min | `security.heat`                      | `emergency` | A fast rise matters more than a steady high value                        |
| Glass-break detector (shop window)                                       | `security.glass-break`               | `emergency` | While Closed; while Open, `critical`                                     |
| Entrance opened while Closed, without an admin command or key            | `security.door-forced`               | `emergency` | Break-in                                                                 |
| Motion in the hall while Closed, with no authorised entry since locking  | `security.motion-after-hours`        | `emergency` | Someone hid inside, or a break-in through the window                     |
| Pavilion failed to lock (door not shut or bolt not thrown)               | `security.lock-failed`               | `critical`  | From the closing sequence or "Close now"                                 |
| Person still inside after closing                                        | `security.person-inside-after-close` | `critical`  | From the closing sequence, with the hall camera                          |
| Opening blocked by the morning self-test                                 | `security.opening-blocked`           | `critical`  | Names the failed check                                                   |
| Entrance left open more than 2 min while Closed                          | `security.door-held-open`            | `critical`  | E.g. after an operator visit                                             |
| Operator door opened while Closed                                        | `security.tech-door-opened`          | `critical`  | Info only if an operator entered by admin command within the last 30 min |
| Technical compartment above 35 °C                                        | `security.temperature-high`          | `critical`  | Warning above 30 °C                                                      |
| Hall below 10 °C or above 30 °C                                          | `security.hall-temperature`          | `warning`   | Paper and printing quality                                               |
| Humidity in the technical compartment below 30 % or above 65 %           | `security.humidity`                  | `warning`   | Paper and printer; tune to the printer's specification                   |
| Mains power lost (from the UPS)                                          | `power.mains-lost`                   | `critical`  | With remaining UPS runtime                                               |
| Alarm panel, lock controller, recorder or a camera stops answering       | `security.<device>-offline`          | `critical`  | Heartbeat, as for the stands                                             |
| Someone exits by the inside handle while Closed                          | `security.inside-exit-after-hours`   | `info`      | Journal only — a late customer leaving is normal                         |

### Automatic actions (proposed)

- **Smoke or heat:**
  - local siren;
  - the stands stop new sessions and show "Opustite pavilón · Leave the pavilion";
  - the print agent stops sending jobs to the printers;
  - the incident clip is saved;
  - the operator is notified.

  The door stays locked from outside (section 1). Cutting power to equipment or ventilation is not automatic until a fire-safety specialist approves that logic.

- **Break-in** (door forced, glass break, motion after hours):
  - siren;
  - incident clip saved;
  - operator notified.
- **Mains loss:**
  - the stands stop starting new sessions;
  - the printers stop with the power (they are not on the UPS);
  - the safety devices, network and recorder keep running on the UPS;
  - the mini-PC shuts down cleanly before the UPS runs out.

Alerts go to Telegram as today. Proposed for the second version: the camera snapshot attached where a camera covers the spot.

### Operator view

Proposed: the admin panel overview shows **one pavilion status**, not raw sensor values — normal, warning, or needs attention now — with a short block per area:

- door and lock state;
- intrusion;
- smoke and temperature;
- power and UPS;
- network;
- cameras.

Details open on click. The door commands (section 1) sit next to it.

## 5. Power and network for the safety devices

Proposed. The technical compartment is a freestanding box powered from existing sockets through portable RCDs, with no new electrical installation (see the techbox documentation). So power groups are made with plug-in equipment, not DIN-rail contactors in a distribution board — that would be an electrical installation and could trigger the building-authority notification the box design avoids.

- **Safety group, on the UPS:**
  - router;
  - PoE switch;
  - alarm panel;
  - lock controller;
  - recorder and cameras;
  - mini-PC, long enough to shut down cleanly.
- **Working group, not on the UPS:**
  - printers — a laser printer's warm-up current is too high for a small UPS;
  - stand PCs and screens;
  - photo-corner equipment.
- **Remote power switching** of working-group devices — for a hung PC or printer — through a certified network-controlled power strip or smart plugs on the kiosk network, as `docs/equipment-monitoring-requirements.md` already plans for the PC power-cycle.
- **Two internet uplinks** with automatic failover, so the operator can still open the door and see the cameras when one fails — already required in `docs/pavilion-launch-checklist.md`.

## Taken from the ChatGPT discussion — and not taken

Taken:

- the separate door-position and bolt signals;
- the "failed to lock" alarm;
- waiting for presence before locking;
- the mmWave presence sensor;
- the morning self-test with blocked opening;
- rate-of-rise heat detection;
- hall temperature and humidity thresholds;
- privacy masks and the documents-unreadable rule;
- local encrypted recording with incident clips;
- the 72-hour retention, from the EDPB guidelines;
- safety devices independent of the kiosk PC;
- the UPS split (printers not on the UPS);
- automatic actions per event type;
- one summarised status for the operator;
- logging every manual action;
- the reminder that our detection does not replace a required certified fire alarm.

Not taken, and why:

- **Three cameras** — the product owner confirmed two: a hall camera that also covers the entrance, and one in the technical compartment.
- **Water-leak sensors** — the product owner decided against them (no water supply). The ChatGPT reasoning was leaks from the building above; cheap to add later if that turns out to be a real risk.
- **Unlocking the exit on fire** — the exit is always mechanically free; the entrance stays locked from outside (confirmed).
- **DIN-rail contactors and four switched circuits** — an electrical installation the freestanding box deliberately avoids; plug-in switching does the same job.
- **A self-built PLC or Home-Assistant-class "safety controller"** — a certified alarm panel and a commercial lock controller do the safety part with a certificate an insurer accepts; the mini-PC only bridges events.
- **Lighting and HVAC control, CO₂, PM2.5, paper weight sensors, a thermal camera** — not needed for opening; later if a real need appears.
- **A help / SOS intercom button** — the remote customer intercom is its own topic (`docs/equipment-monitoring-requirements.md`, Scope boundaries), not started.
- **Printer SNMP monitoring and PC watchdog** — already built (`agent/jobTracker.ts`, `server/standMonitor.ts`, `docs/equipment-monitoring-requirements.md`).

## Implementation status (2026-10-16)

**Door control — built, tested against a simulated lock, not yet against the real Nuki:**

- Cloud: `server/doorSchedule.ts` (opening hours, closures, override — pure, shared with the agent), `server/pavilionDoor.ts` (plan, staff commands, journal, door incidents), routes in `server/agentRoutes.ts` (`GET /api/agent/door`, `POST /api/agent/door-report`) and `server/adminRoutes.ts` (`/api/admin/door…`, commands senior only).
- Agent: `agent/doorController.ts` (follows the plan, relocks, detects inside exits and forced openings), `agent/doorLock.ts` (`DOOR_LOCK=simulated` or `nuki-mqtt`).
- Admin: the "Дверь павильона" block at the top of the Overview (`admin/screens/DoorPanel.tsx`) — state, "Открыть"/"Закрыть", closures, journal; usable from a phone.
- How "Открыть" works: outside the plan's open hours (night, a closure) it is **one visit** — the lock opens and locks again once the door has been opened and shut (or after 2 minutes if nobody opened it); it never leaves the pavilion open for the night. Within open hours it cancels an earlier "Закрыть". "Закрыть" within open hours closes until the plan next changes (normally 22:00).
- Incidents: `security.door-forced` (emergency, each time), `security.lock-failed`, `security.door-held-open`, `security.lock-unreachable` (critical), `security.lock-battery-low` (warning); all but the first close by themselves.
- Known limitation: relocking is done by the agent (Nuki can't switch its own auto-lock by schedule). If the mini-PC or the agent is down, the door keeps its last state — after an inside exit at night it stays unlocked until the agent is back. The existing `pc.print-agent-offline` incident reports that; staff then use the key.

**Stands and opening hours — built (2026-10-18):** with `PAVILION_HOURS_ENFORCED=true` the stands read `GET /api/pavilion-hours` (`server/pavilionDoor.ts`) and show a strip on every screen (`pavilion-hours-banner`, `src/layouts/KioskScreenLayout/usePavilionHours.ts`): 10 minutes before closing "closes at 22:00, please finish"; 5 minutes before "no new orders" and the Welcome service cards turn unavailable (orders in progress and paid jobs carry on); while closed "opens again at 7:00" (or "temporarily closed" during an open-ended closure). Staff's closures and "Закрыть" show up within about 30 seconds. The closure's reason is never shown to customers — it is staff text.

**Phone call + SMS for the worst incidents — built (2026-10-18):** `server/urgentCaller.ts` calls and texts `URGENT_ALERT_PHONES` through Twilio for `security.smoke`, `security.heat`, `security.door-forced` and `security.glass-break` (at most once per 5 minutes per code), next to the usual Telegram message. Needs a Twilio account and number before it does anything; until then it logs the would-be call.

**Not built yet:** presence check before locking (section 2), closing announcements over the speaker, morning self-test, cameras, alarm sensors.

## Open items

- **Lock** — Nuki Smart Lock Pro chosen; still to check: the cylinder has an emergency function (else replace it), the door has a closer, and the fire-safety specialist accepts a turn knob as the inside exit.
- **Owner consent** for hardware on the entrance door.
- **Fire-safety specialist** — does the unit need a certified fire alarm (EPS) or other fire equipment; approve the automatic actions on smoke or heat.
- **Who responds at night** — confirmed for now: only the product owner; a security company with call-out (central monitoring station, PCO) may be added later. A Telegram message does not wake anyone, so `security.smoke`, `security.heat`, `security.door-forced` and `security.glass-break` also phone and text (built 2026-10-18, see Implementation status) — still to do: a Twilio account, a sender number, voice and SMS permission for Slovakia, one test call.
- **Insurance** — mandatory (confirmed), insurer and its requirements not known yet. Insurers often require a certified alarm (EN 50131 grade 2) with a monitoring-station link. Proposed: buy the intrusion and smoke sensors (contacts, motion, glass-break, smoke, siren) as one grade-2-certified alarm system that can later connect to a PCO, so a later insurer or security company does not force replacing it; ask the insurer before buying. That system must also let our backend receive its events (API, relay output or integration) — check when choosing.
- **Video retention** — 72 hours proposed from the EDPB guidelines; confirm nothing stricter in current ÚOOÚ guidance.
- **Timings and thresholds** — closing sequence, 15-minute presence wait, temperature and humidity limits are proposals; tune after the first weeks.
