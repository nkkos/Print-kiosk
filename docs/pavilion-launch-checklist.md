# Pavilion launch checklist

Decisions and must-do items before the first pavilion (Hodžovo námestie) opens to real customers. Confirmed with the product owner on 2026-09-25. Tick items off here as they land, so nothing is lost between sessions.

Expected load: 1 pavilion, 2 kiosk stands, 10–15 visitors/day.

## Target architecture (confirmed)

- **Cloud (Railway)** holds all logic and data: sessions, uploads (QR / email / portal), antivirus scan (ClamAV service), document conversion (LibreOffice), orders, payments, the print-task queue and pickup-bin allocation (`server/pickupBins.ts`), the admin panel.
- **Kiosk stands** (2 × simple PC + monitor) are thin clients: a browser in kiosk mode on the Cloudflare Pages site, tagged with a stand id (A/B). No local server, no printer driver.
- **Pavilion mini-PC** (Windows) runs the **print agent**: it polls the cloud for print tasks (outbound only, no open ports), downloads the ready-to-print PDF, prints it to the Brother queue of the reserved bin, and reports status and printer health back. Later it also drives the smart lock and cameras. It holds the Brother driver and the per-bin print queues.
- **Printer**: Brother HL-L9430CDN + MX-4000 (4 × 100-sheet mailbox bins) + LT-330CL lower tray, on the pavilion LAN.
- Local development keeps a "direct" mode where the backend prints to the local default printer itself (the current behavior).

## Before opening — infrastructure (Railway)

- [ ] Move to the **Pro plan** (support, backups, sane limits). Budget estimate $20–40/month; ClamAV's 2–3 GB of RAM is the biggest cost.
- [ ] Confirm all services run in an **EU region** (Settings → Region), for GDPR and latency.
- [ ] Enable and verify **Postgres backups**; decide on backups for `print-kiosk-volume` (uploaded files).
- [ ] Create a **staging environment**; production deploys only after checking on staging (today every push to `main` deploys straight to production).
- [ ] **Uptime monitoring** of the backend and the print agent's heartbeat, alerting through the existing Telegram bot.
- [ ] Install **LibreOffice** in the cloud build, so `.doc`/`.docx` conversion (preview + page count + pricing) works in the cloud — today it only works on a developer machine that has LibreOffice installed.

## Before opening — application security

The backend was deliberately built without hardening for the prototype (see `CLAUDE.md`, "Backend"). With real customer documents that is no longer acceptable:

- [ ] Stand and agent **device keys**; agent-only API routes are rejected without a valid key.
- [ ] **Session ownership checks**: a client can only list and read its own session's files and print tasks (today anyone who guesses a session id can list its files).
- [ ] **CORS** restricted to our own domains.
- [ ] Review the remaining unauthenticated routes one by one.

## Before opening — legal / GDPR

- [ ] Sign Railway's **DPA** (data processing agreement).
- [ ] Define the **retention period** for uploaded files and make sure deletion actually happens (see `docs/data-privacy-requirements.md`).
- [ ] Privacy notice on the kiosk and the website.

## Before opening — printer (after the hardware arrives)

- [ ] Install the full Brother PCL driver on the mini-PC (not the Microsoft IPP class driver); tick the MX-4000 and the lower tray under Device Settings.
- [ ] Create 4 queues (`HL9430-Bin1`…`Bin4`) with Printing Defaults pinned to "MX bin N"; set `PRINTER_QUEUE_BIN_1..4` (see `server/printerAdapter.ts`). Both trays hold A4 (decided 2026-09-25: the LT-330CL is a reserve A4 tray, not A5 — A5 has little walk-in demand and the printer cannot do A3 at all); leave `PRINTER_TRAY_A4` unset so the driver switches to tray 2 by itself when tray 1 runs out, and set tray 2's paper size to A4 in the printer menu.
- [x] A5 hidden in the kiosk and portal and refused by order validation while no tray holds it (`OFFERED_PAPER_SIZES` in `src/utils/printCapabilities.ts` and `server/printerAdapter.ts` — add 'A5' back in both to re-enable).
- [ ] Run the acceptance scenarios (the HL-L9430CDN acceptance checklist artifact).
- [ ] Enable SNMP v1/v2c read access in the Brother's Web Based Management; set `PRINTER_SNMP_HOST` on the agent and confirm `GET /api/printer-status` reflects a real jam / empty tray / open door.
- [ ] Tune the agent's timings on real hardware (`agent/jobTracker.ts`: grace period, idle readings, 10-minute watch limit) — in particular that a sleeping printer reports "idle" and that a finished job is detected.
- [ ] Set `VITE_HIDE_PRINT_SIMULATE=true` in the Cloudflare Pages build, so customers never see the "Simulate …" buttons (real outcomes come from the agent).
- [ ] Set `PRINT_EXECUTION=agent` and `PRINT_AGENT_TOKEN` on Railway, the same token in the agent's `.env`; register the agent's startup task (`agent\windows\install-agent-task.ps1`, elevated) and confirm it survives a reboot and a killed `node.exe`.
- [ ] Open each stand's kiosk browser with `?stand=A` / `?stand=B`; check the stand shows up in the admin Print Queue.
- [ ] Check on a real stand that the cart refuses payment while the printer is unavailable (agent stopped, door open) and unlocks by itself once it's back.
- [ ] Review incident noise: one jam currently yields a device incident (`printer.jammed`), a task incident (`printer.paper-jam`) and, if the job had reached the printer, `printer.job-interrupted` — decide which should reach Telegram.

Known hardware constraint, already handled in code: the automatic duplex unit supports A4 only, so A5 double-sided is blocked in the kiosk UI, the portal and order validation.
