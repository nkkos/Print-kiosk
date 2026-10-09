# Pavilion launch checklist

Decisions and must-do items before the first pavilion (Hodžovo námestie) opens to real customers. Confirmed with the product owner on 2026-09-25. Tick items off here as they land, so nothing is lost between sessions.

Expected load: 1 pavilion, 2 kiosk stands, 10–15 visitors/day.

## Target architecture (confirmed)

- **Cloud (Railway)** holds all logic and data: sessions, uploads (QR / email / portal), antivirus scan (ClamAV service), document conversion (LibreOffice), orders, payments, the print-task queue and pickup-bin allocation (`server/pickupBins.ts`), the admin panel.
- **Kiosk stands** (2 × simple PC + monitor) are thin clients: a browser in kiosk mode on the Cloudflare Pages site, tagged with a stand id (A/B). No local server, no printer driver.
- **Pavilion mini-PC** (Windows) runs the **print agent**: it polls the cloud for print tasks (outbound only, no open ports), downloads the ready-to-print PDF, prints it to the Brother queue of the reserved bin, and reports status and printer health back. Later it also drives the smart lock and cameras. It holds the Brother driver and the per-bin print queues.
- **Printer**: Brother HL-L9430CDN + MX-4000 (4 × 100-sheet mailbox bins) + LT-330CL lower tray, on the pavilion LAN.
- Local development keeps a "direct" mode where the backend prints to the local default printer itself (the current behavior).

## Before opening — pavilion network and power

Confirmed with the product owner on 2026-10-09. Every device in the pavilion reaches the internet through one router, so the router, its SIM cards, the switch and the power supply are the pavilion's single points of failure: any of them down stops everything (stands, payments, printing). The mini-PC, the printer or one stand failing only stops part of the service. The diagram is published as the «Схема павильона» artifact.

- [ ] **Measure the mobile signal** inside the pavilion (where the router will stand) and outside, for each candidate operator (Orange, Telekom, O2, 4ka), before buying the router, the SIM cards and the antenna. Targets for LTE: RSRP better than −100 dBm, SINR above 5 dB; if inside is clearly worse than outside, plan an external antenna.
- [ ] **Router**: Teltonika with **two SIM slots and automatic failover**. The two SIM cards come from **different operators**, so one operator's outage doesn't stop the pavilion.
- [ ] **External antenna** if the signal measurement calls for it.
- [ ] **Fixed line** as the main channel, with mobile as the backup, if the building offers one.
- [ ] **Teltonika RMS** (remote management) set up, so the router can be checked, rebooted and reconfigured without a site visit; **ping reboot** turned on (the router restarts itself after N minutes without internet).
- [ ] **Spare router** with the same configuration exported and loaded, kept ready to swap in.
- [ ] **PoE switch** (managed, VLAN-capable). Every wired device runs through it, so it is as critical as the router; consider a spare.
- [ ] **Three separate networks (VLANs)**: kiosk and payments (stands, Viva terminals, mini-PC, printer, cash register); security (cameras, NVR, lock, sensors); guests (Wi-Fi with limits, internet only, no access to the others).
- [ ] **No inbound ports**: every device connects out by itself (stands, print agent, Viva terminals), so no port forwarding and no public IP are needed.
- [ ] **UPS** on the router, the switch, the mini-PC and the Viva terminals. The printer may stay off it: a print that fails on a power cut is refunded by the normal print-failure path.
- [ ] **Printer on the LAN** (static IP), not USB, so the agent can read paper, toner and jam status over SNMP.
- [ ] **Connection-loss test** on the two-PC setup (old PC as a stand, laptop as the agent): pull the stand's cable, including in the middle of a payment. Check that the stand shows "no connection", that `pc.dead` reaches Telegram after 3 minutes and closes itself on reconnect, and that the nightly Viva reconciliation flags a payment interrupted by the outage.

## Before opening — infrastructure (Railway)

- [ ] Move to the **Pro plan** (support, backups, sane limits). Budget estimate $20–40/month; ClamAV's 2–3 GB of RAM is the biggest cost.
- [ ] Confirm all services run in an **EU region** (Settings → Region), for GDPR and latency.
- [ ] Enable and verify **Postgres backups** (steps in `README.md`, "Uptime monitoring and backups"). `print-kiosk-volume` holds only customers' short-lived files (deleted within hours) — no backup needed.
- [ ] Create a **staging environment**; production deploys only after checking on staging (today every push to `main` deploys straight to production). Code side done 2026-10-07 (`APP_ENV`, screen label, `[STAGING]` alerts/e-mails, no live Viva on staging, `staging` branch); the Railway and Cloudflare setup is in `README.md`, "Staging environment".
- [ ] **Uptime monitoring** of the backend and the print agent's heartbeat, alerting through the existing Telegram bot. Done inside the backend: the print agent (`pc.print-agent-offline`) and the kiosk stands (`pc.dead`, `server/standMonitor.ts` — set `STAND_API_KEYS` or `MONITORED_STANDS` to switch it on). Outside check of the backend itself: `GET /api/health` (200 only with the database answering) for UptimeRobot or similar — setup in `README.md`, "Uptime monitoring and backups"; still to be created there.
- [ ] Install **LibreOffice** in the cloud build, so `.doc`/`.docx` conversion (preview + page count + pricing) works in the cloud — today it only works on a developer machine that has LibreOffice installed.

## Before opening — application security

The backend was deliberately built without hardening for the prototype (see `CLAUDE.md`, "Backend"). With real customer documents that is no longer acceptable:

- [x] Stand and agent **device keys** in code (`server/security.ts`, `STAND_API_KEYS`; agent: `PRINT_AGENT_TOKEN`) — stand-only routes: print tasks, session files and content, email messages, session start/end, scan/copy creation, photo orders, photo sharing, AI backgrounds.
- [x] **Account ownership**: the kiosk reads My files / My orders with the login's session token; an account's files and file content go only to that account.
- [x] **Email relay secret** (`EMAIL_RELAY_SECRET` + the Worker's `RELAY_SECRET`); **Simulate** print outcomes closed in agent mode; **CORS** allow-list (`CORS_ORIGINS`).
- [ ] **Turn them on**: set `STAND_API_KEYS`, `EMAIL_RELAY_SECRET`, `CORS_ORIGINS` on Railway, `RELAY_SECRET` on the Cloudflare Worker, and open each stand (and the photo kiosk) once with `?stand=…&key=…`. The backend logs `[security] not configured: …` at boot for anything still off.
- [ ] Phone-side capability links (QR upload page, scan/copy pages, scan download links) are still "whoever has the link": a bystander who photographs the QR on screen can upload into that session (not read it). Decide whether that needs a separate short-lived upload token.
- [x] Rate limits per client IP on phone/public uploads (120 per 10 min) and on routes that send e-mail (10 per 15 min); security headers (helmet, no CSP because the phone pages use inline scripts). The backend now trusts Railway's proxy hop, so limits — including the existing login limit — are per client, not one bucket for everybody.

## Before opening — payments and receipts

- [ ] Real Viva terminals connected (`PAYMENT_TERMINAL=viva`, B5) — until then the kiosk takes simulated payments only.
- [ ] Cash register: NineDigit CHDÚ on the mini-PC, fiscalised by the service partner; `FISCAL_REGISTER=agent` on Railway, `FISCAL_DEVICE=ninedigit` on the agent (B8).
- [ ] Set the company's details for the receipt page: `RECEIPT_SELLER_NAME`, `RECEIPT_SELLER_ADDRESS`, `RECEIPT_SELLER_ICO`, `RECEIPT_SELLER_DIC`, `RECEIPT_SELLER_IC_DPH`.
- [ ] Real price list in `src/utils/tariff.ts`.

## Before opening — legal / GDPR

- [ ] Sign Railway's **DPA** (data processing agreement).
- [ ] Define the **retention period** for uploaded files and make sure deletion actually happens (see `docs/data-privacy-requirements.md`).
- [ ] Privacy notice on the kiosk and the website.

## Before opening — printer (after the hardware arrives)

- [ ] Install the full Brother PCL driver on the mini-PC (not the Microsoft IPP class driver); tick the MX-4000 and the lower tray under Device Settings.
- [ ] Run `agent\windows\setup-printer.ps1` (elevated): it creates the 4 queues (`HL9430-Bin1`…`Bin4`, plus `HL9430-Staff`) with Printing Defaults pinned to "MX bin N" — then check them by hand (acceptance P5); set `PRINTER_QUEUE_BIN_1..4` (see `server/printerAdapter.ts`). Both trays hold A4 (decided 2026-09-25: the LT-330CL is a reserve A4 tray, not A5 — A5 has little walk-in demand and the printer cannot do A3 at all); leave `PRINTER_TRAY_A4` unset so the driver switches to tray 2 by itself when tray 1 runs out, and set tray 2's paper size to A4 in the printer menu.
- [x] A5 hidden in the kiosk and portal and refused by order validation while no tray holds it (`OFFERED_PAPER_SIZES` in `src/utils/printCapabilities.ts` and `server/printerAdapter.ts` — add 'A5' back in both to re-enable).
- [ ] Run the acceptance scenarios (the HL-L9430CDN acceptance checklist artifact).
- [ ] Enable SNMP v1/v2c read access in the Brother's Web Based Management; set `PRINTER_SNMP_HOST` on the agent and confirm `GET /api/printer-status` reflects a real jam / empty tray / open door.
- [ ] Tune the agent's timings on real hardware (`agent/jobTracker.ts`: grace period, idle readings, 10-minute watch limit) — in particular that a sleeping printer reports "idle" and that a finished job is detected.
- [ ] Set `VITE_HIDE_PRINT_SIMULATE=true` in the Cloudflare Pages build, so customers never see the "Simulate …" buttons (real outcomes come from the agent).
- [ ] Set `PRINT_EXECUTION=agent` and `PRINT_AGENT_TOKEN` on Railway, the same token in the agent's `.env`; register the agent's startup task (`agent\windows\install-agent-task.ps1`, elevated) and confirm it survives a reboot and a killed `node.exe`.
- [ ] Set up each stand PC with `stand\windows\setup-stand.ps1 -StandId A|B -StandKey …` (`README.md`, "Kiosk stand PC"); confirm it signs in and opens the kiosk by itself after a reboot and a power cut, reopens Chrome when it's closed, and shows up in the admin Print Queue and Overview → Стойки. Then on the real touch screen: no edge swipe, pinch zoom or swipe-back gets out of the kiosk; the touch keyboard opens in the e-mail and login fields; Windows 11's three- and four-finger touch gestures are off (Settings → Bluetooth & devices → Touch); the admin «Перезагрузить страницу» reloads the stand.
- [ ] Check on a real stand that the cart refuses payment while the printer is unavailable (agent stopped, door open) and unlocks by itself once it's back.
- [x] Admin Print Queue shows the printer's live state from the agent (state, blocking problems and warnings, toner/drum levels, when the agent last called in).
- [ ] Review incident noise: one jam currently yields a device incident (`printer.jammed`), a task incident (`printer.paper-jam`) and, if the job had reached the printer, `printer.job-interrupted` — decide which should reach Telegram.

Known hardware constraint, already handled in code: the automatic duplex unit supports A4 only, so A5 double-sided is blocked in the kiosk UI, the portal and order validation.
