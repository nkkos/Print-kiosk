# Copy — Confirmed Requirements

Internal project document. Consolidates the requirements confirmed with the product owner for the Copy service (`service-copy` on the Welcome Screen, currently `coming-soon`). This document defines requirements only — no visual design, specification, or wireframe exists yet, and nothing described here is implemented. Builds directly on `docs/scan-upload-requirements.md`'s "Relationship to Copy" section, which already confirmed the core architecture before Copy's own requirements were worked out.

## Purpose

Lets the user photograph a paper document with their own phone and print it, without the kiosk needing a physical copier. Same underlying motivation as Scan (`docs/scan-upload-requirements.md`, "Purpose"): a physical scanning/copying mechanism is fragile and expensive to vandal-proof in an unattended kiosk, and reusing the phone-camera capture pipeline avoids that hardware risk for Copy too, not just Scan.

## How it works (conceptual — reuses Scan's capture pipeline)

**Confirmed architecture (from `docs/scan-upload-requirements.md`):** Copy reuses Scan's exact capture pipeline (QR code → phone-facing page → photo → corner adjustment → server-side processing → optional multi-page loop) but skips Scan's "Delivery" step entirely. Instead, the finished (possibly multi-page) document feeds directly into the existing Print pipeline (Print Order Configuration → Cart → Payment Status → Print Status), the same way any other uploaded file does today.

Unlike Scan, **the phone's job ends once the document is captured** — printing itself (paper size, sides, color, quantity) is configured on the **kiosk's own screen**, matching how QR upload already splits the work: the phone uploads, the kiosk configures and pays. This was an explicit choice over the alternative (configuring print settings on the phone too), to stay consistent with the rest of the Print flow rather than introduce a second, phone-based configuration path.

## Confirmed user flow

1. **Welcome Screen** — user taps the `service-copy` card. Creates or reuses a Kiosk Session, same Trigger A mechanics as `service-print`/`service-scan` (`docs/domain/kiosk-session.md`).
2. **Kiosk shows a QR code** — same two-half layout as Scan's kiosk screen (QR + status on one side).
3. **On the phone (P1 — Start):** same capture flow as Scan's P1–P3, with **Copy-specific instructional wording** — e.g. Scan's P1 doesn't need to explain _why_ the person is photographing something, but Copy's P1 should read along the lines of "To print a copy, first scan the document with your phone," since arriving here without having gone through the Scan discussion first would otherwise be confusing.
4. **On the phone (P2 — Adjust corners):** identical to Scan — same auto-detection (best-effort, server-side OpenCV) plus manual drag-to-adjust, unchanged. Not simplified or skipped for Copy.
5. **On the phone (P3 — Preview / multi-page):** identical to Scan — **multi-page is optional, available on request** (the person can tap "Add another page," or finish after just one), same as Scan's own multi-page behavior. Not made mandatory or removed for Copy.
6. **On the phone — finish:** unlike Scan's P4 (choose a delivery method), Copy has **no delivery-method screen** — "Finish" leads straight to a simple terminal phone screen ("Done — return to the kiosk"), since the actual next step (print configuration) happens on the kiosk, not the phone.
7. **Kiosk:** once the phone-side capture finishes, the kiosk reflects the captured document as a single selectable item — see "Kiosk-side representation" below — the same way QR upload's received-files list already works. Tapping it opens Print Order Configuration, pre-loaded with the real captured (possibly multi-page) document, exactly as any other uploaded file would be today.
8. **From there on, the existing Print pipeline is unchanged:** Print Order Configuration → Add to Cart → Payment Status → Print Status, no Copy-specific behavior.

## Kiosk-side representation

**Confirmed:** a completed Copy capture (even if multi-page) shows on the kiosk as **one selectable item representing the whole document**, not one item per captured page. This matches how a real multi-page uploaded file (e.g. a multi-page PDF from QR/Email) already appears today, and how Print Order Configuration is already built to handle a single document with multiple pages (page-range selection, per-page pricing) rather than a list of independent single-page files.

## Multiple Copy attempts in one session

**Confirmed:** the person can complete a Copy capture, add it to the Cart, and then start an entirely separate Copy capture for a second document — analogous to Scan's `scan-restart`, but here the motivation is "I have another document to print," not "I made a mistake." Each completed capture becomes its own Cart item.

**Confirmed:** paying for multiple Copy documents (or a mix of Copy and any other print source) in one payment already works via the existing Cart mechanics — the Cart already accumulates multiple `PrintOrder`s from any source and lets the user select several for one "Proceed to payment" pass (`docs/domain/kiosk-session.md`, "Related entities"). This requires no new payment/Cart behavior — only that each finished Copy document becomes a normal Cart item like any other.

## Retention

**Confirmed:** unlike Scan's anonymous 24-hour retention window (`docs/scan-upload-requirements.md`, "Retention"), Copy's captured pages are **session-scoped**, tied to the Kiosk Session's own lifecycle — the same retention posture QR/Email uploads already have. This is because Copy's output never leaves the kiosk session (no email/download-link/account handoff to a possibly-different context) — the person is always still standing at the same kiosk, in the same session, printing. Reuses the existing session-scoped cleanup/TTL-sweep pattern (`server/sessionLifecycle.ts`) rather than Scan's separate shorter-window sweep.

## Pricing

**Confirmed:** Copy is a paid service, same pricing model as Print (`docs/personal-account-requirements.md` / `src/utils/pricing.ts`'s `computeUnitPrice`) — this follows automatically from Copy's output going through the same Print Order Configuration → Cart → Payment Status path as any other print job, not a separate pricing decision. Scan itself remains free (no payment step in its own flow) — see the "Relationship to Copy" distinction already drawn in `docs/scan-upload-requirements.md`.

## Image processing

No new decisions — identical to Scan's already-confirmed split (`docs/scan-upload-requirements.md`, "Image processing"): corner marking/adjustment is client-side (the phone's own canvas work), perspective correction/cleanup/sharpening and best-effort auto-corner-detection are server-side, reusing the same `server/scanProcessor.ts`/`server/documentCornerDetector.ts` pipeline Scan already has.

## Scope boundaries

Out of scope for this document: exact screen layout/wireframes (a later step, once this requirements doc is confirmed — same sequencing as every other flow in this project), and any change to the existing Print pipeline itself (Print Order Configuration, Cart, Payment Status, Print Status all stay as they are — only the _origin_ of a document becomes real for Copy, the same way it already did for QR/Email/Account).

## Open items

None currently — the open items already flagged in `docs/scan-upload-requirements.md`'s "Relationship to Copy" (whether Copy allows multi-page, whether it skips corner-adjustment) plus the ones raised during this pass (kiosk-side per-document vs. per-page representation, retention window, multi-attempt/multi-payment handling, pricing) were all resolved above.
