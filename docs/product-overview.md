# print-kiosk — Product Overview

Internal project document. Reflects the confirmed product vision as agreed with the product owner.

All project artifacts are written in English. Russian may be used only in direct communication with the product owner.

## Product purpose

A client application for a self-service printing kiosk. The primary scenario is unattended document printing without employee assistance.

## Kiosk services

The kiosk is intended as a multi-service self-service station, not a print-only device.

- Print is the active service for the current milestone.
- Scan and Copy are confirmed future services.
- Scan and Copy are visible on the Welcome Screen as coming-soon service entries, but are not implemented in the current milestone.

## Current milestone

Build a working clickable prototype of the kiosk client application within 7 days. The complete user journey should work first using mock data; real integrations will be added later.

## Project principles

- Deliver working software as early as possible.
- Build the application incrementally, one completed feature at a time.
- Prefer simple solutions over unnecessary abstractions.
- Avoid speculative architecture.
- Use mock implementations until real integrations are required.
- Every implemented feature must be testable immediately.

## Target users

- Customers using the self-service kiosk.
- Users with no technical background.
- The interface must be optimized for a touch screen.

## Confirmed printing flow

- Welcome screen
- Service selection
- Document upload
- Document preview
- Print settings
- Price calculation
- Payment
- Job queue / printing status (a stage in the user journey; does not necessarily require a separate screen)
- Order collection
- Error handling and recovery scenarios

## Confirmed upload methods

- QR code
- Temporary email
- Telegram bot
- Personal account
- Web upload
- USB drive

## Confirmed high-level architecture

- Kiosk client application
- Local hardware agent
- Server-side services
- Persistent storage
- Administrative interface

## Confirmed hardware

- Touch screen
- Printer
- Payment terminal
- Electronic lock
- Sensors
- Camera

## Out of scope for the current sprint

- Production-ready backend
- Hardware integrations
- Performance optimization
- Security hardening
- Offline synchronization
- Automated testing

## Already completed

- Project repository initialized
- Development environment configured
- React + TypeScript + Vite project created
- Git repository initialized locally (branch `main`)
- Code quality tooling configured: oxlint (linting) and Prettier (formatting)
- Vite demo template content removed, replaced with a minimal placeholder
- `.gitignore` configured

## Not implemented yet

- Clickable prototype screens for the confirmed printing flow
- Mock data layer for the user journey
- Mocked upload method flows for the clickable prototype (QR code, temporary email, Telegram bot, personal account, web upload, USB drive)
- Real external integrations for these upload methods (to be added later)
- Payment integration
- Local hardware agent (printer, payment terminal, electronic lock, sensors, camera)
- Backend, database, and file storage
- Administrative interface

## Open questions

- What is the file retention/deletion policy after printing?
- What is the required behavior when the kiosk loses network connectivity?
- What is the scope of the administrative interface (monitoring, remote configuration, reporting)?
- What are the refund/recovery steps when payment succeeds but printing fails (or vice versa)?
- What are the kiosk screen size, resolution, and orientation?
- How is the physical kiosk browser locked down against navigation away from the app (refresh, address bar, keyboard shortcuts, closing the window)? Surfaced while testing the real QR upload backend: a plain browser reload currently returns the user to the Welcome Screen (session/Cart persist via `localStorage`, but which screen they were on and in-progress QR/Email state do not — a deliberate, already-confirmed "no smart session restore" decision, not itself the gap). The likely real answer is deployment-level (e.g., Chrome kiosk mode, `--kiosk`, disabling browser chrome and shortcuts) rather than an app-code fix, but this hasn't been confirmed or scoped.
