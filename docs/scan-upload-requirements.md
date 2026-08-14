# Phone-Camera Scan — Confirmed Requirements

Internal project document. Consolidates the requirements confirmed with the product owner for the Scan service (`service-scan` on the Welcome Screen, currently `coming-soon`). This document defines requirements only — no visual design, specification, or wireframe exists yet, and nothing described here is implemented. See `docs/upload-method-requirements.md` for the six-method upload selection screen this is unrelated to (Scan is reached directly from Welcome, not through Upload Method Selection — it produces a document, it doesn't receive one).

## Purpose

Lets the user digitize a paper document using their own phone's camera — perspective-corrected and cleaned up to look like a real scan — without the kiosk needing a physical flatbed or sheet-fed scanner. Confirmed motivation: a physical scanner is fragile and expensive to vandal-proof in an unattended kiosk (see the anti-vandal enclosure discussion that led here); a phone camera the user already owns avoids that hardware risk entirely.

## How it works (conceptual — mirrors QR upload's architecture)

Not yet implemented, but confirmed to reuse the same mechanism already built for QR upload (`docs/qr-upload-requirements.md`), not a new pattern:

- The kiosk shows a QR code encoding a link to a lightweight, phone-facing web page served by the backend — same `GET /api/config` base-URL resolution QR upload already uses (LAN IP locally, public Railway domain when deployed).
- The destination page is **anonymous, tied only to the Kiosk Session** — no login required to capture and process a scan, same posture as QR upload today. (Login only becomes relevant at the delivery step — see "Delivery" below.)
- The kiosk learns the finished result the same way it learns about QR-uploaded files: polling the backend while this screen is open.

## Confirmed user flow

1. **Welcome Screen** — user taps the `service-scan` card. Creates or reuses a Kiosk Session, same Trigger A mechanics already defined for `service-print` (`docs/domain/kiosk-session.md`).
2. **Kiosk shows a QR code** — same two-half layout concept as `QrUploadScreen` (QR + instructions on one side), adapted for "scan this to open your camera," not "scan this to upload a file."
3. **On the phone:** the page opens, user takes a photo of one page of the document (a plain photo capture — **confirmed: no live camera viewfinder/real-time capture guidance** for this pass; simpler to build, and doesn't preclude adding one later without changing the rest of this flow).
4. **On the phone:** the photo is shown with its four corners marked — auto-detected where possible, always adjustable by dragging, since auto-detection will not always be correct (see "Image processing" below).
5. **On the phone:** once the user confirms the corners, the page is processed (perspective-corrected, cleaned up) and a preview of the result is shown.
6. **On the phone — multi-page (confirmed required):** from that preview, the user can tap **"Add another page"** to go back to step 3 and photograph the next page of the same document, repeating steps 3–5 per page. The document isn't considered finished until the user explicitly ends the session (a "Finish" action, distinct from "Add another page").
7. **On the phone — delivery (confirmed required):** once finished, the user chooses how to receive the completed (possibly multi-page) document — see "Delivery" below.
8. **Kiosk:** reflects that a scan session completed (polling), same spirit as QR's received-files list, though exact kiosk-side screen content depends on delivery choice — e.g., nothing further to do at the kiosk if delivered by email/download link.

## Image processing

Confirmed required, and confirmed split between client and server rather than all-or-nothing on one side:

- **Corner marking/adjustment (step 4)** — client-side (the phone's browser): drawing/dragging a polygon overlay on the captured photo needs no image processing at all, just canvas work, so there's no reason to round-trip to the server for it.
- **Perspective correction** to a proper rectangle from the confirmed four corners (homography transform), **noise cleanup/contrast normalization**, and **sharpening** — **confirmed server-side**: the raw photo and confirmed corner coordinates are uploaded together, and the backend does the actual transform. This runs once per confirmed page, not interactively, so there's no UX cost to it — and it avoids shipping a multi-megabyte WASM CV library to every phone, keeps quality consistent regardless of the visitor's device, and matches how every other heavy processing step in this project already works (LibreOffice conversion, antivirus scanning — both server-side, not client-side).
- **Auto-corner-detection** is a best-effort assist, not a hard requirement — manual corner adjustment (step 4) is the actual requirement, since auto-detection will not always succeed (poor contrast, shadows, glare, curled paper).

## Delivery

**Confirmed:** at the end of a scan session, the user chooses how to receive the finished document — not a single fixed method:

- **Email** — send the finished file to an address the user enters. Reuses the already-real email-sending infrastructure (`server/emailSender.ts`, via Resend) — the same building block already used for account verification/reset emails, not a new integration.
- **Download link** — a link the user can open on their own phone (they're already there) to save the file themselves.
- **Save to Personal Account** — stores the file into the account's real "My files" (`server/accountFileStore.ts`, `docs/personal-account-requirements.md`). **Requires being logged in** — if the user isn't, choosing this option should prompt login/registration at that point, reusing the already-built Register-via-QR flow (`src/components/LoginPanel/`) rather than inventing a separate one. Email and Download link do **not** require login, consistent with the rest of this flow being anonymous/session-scoped.

**Confirmed: multiple delivery methods can be selected at once** (checkboxes, not a single radio choice) — e.g., email and save-to-account together in one pass. "Finish" stays disabled until at least one is checked.

### Retention (anonymous delivery)

**Confirmed:** files delivered via Email or Download link are **not kept indefinitely** — a scanned document is plausibly more sensitive on average than what people already choose to print at a public kiosk (IDs, financial paperwork), so this deliberately doesn't inherit QR/Email upload's "stays until session cleanup" posture. Confirmed shape:

- **24-hour retention** for the raw photo(s) and processed result, then deleted — long enough to cover a forgotten download or a bounced email retry, short enough that this never becomes a standing, unauthenticated store of sensitive documents. Reuses the same TTL-sweep pattern already built for session-scoped uploads and account-file retention (`server/sessionLifecycle.ts`, `server/accountFileStore.ts`'s `sweepExpiredAccountFiles`) — a new sweep with its own, much shorter window, not a new mechanism.
- **Download links use an unguessable token** (a real random UUID, the same kind already used throughout this project for session/file ids) rather than anything sequential or brute-forceable — the one concrete extra precaution taken for this flow's higher-sensitivity content. No further hardening (e.g., password-protecting the link) — that would contradict this project's already-accepted "production hardening is out of scope for the prototype" posture (`docs/product-overview.md`).
- **"Save to Personal Account" is unaffected** — once saved there, it's permanent storage under the same real `accountFiles` rules as anything else in "My files" (including that store's own, separately-confirmed retention/quota rules, `docs/personal-account-requirements.md`), not the 24-hour window above.

## Relationship to Copy

**Confirmed architecture:** `service-copy` (also currently `coming-soon`) reuses this same capture pipeline (steps 1–6 above) but skips "Delivery" entirely — instead, the finished document(s) feed directly into the existing Print pipeline (Cart → Payment Status → Print Status, `docs/domain/kiosk-session.md`), the same way any other uploaded file does today. Practically, once Scan is built, Copy is mostly a matter of wiring its output to Print Order Configuration instead of to a delivery step, not a second capture flow. Copy's own detailed requirements (e.g., does it still allow multi-page, does it skip the corner-adjustment step to be faster) are deferred to their own document once Scan itself is built and this assumption is validated.

## Scope boundaries

Out of scope for this document: exact screen layout/wireframes (a later step, once this requirements doc is confirmed — same sequencing as every other flow in this project), Copy's own requirements (see "Relationship to Copy" above), and any change to the existing Print pipeline itself.

## Open items

None currently — the five items raised during discovery (live viewfinder, client/server processing split, multi-select delivery, document-sensitivity handling, retention window) were all resolved in this pass; see "Confirmed user flow," "Image processing," and "Delivery" above.
