# Copy — Spec

Internal project document. Confirms the approved layout (`docs/screens/copy-wireframes.md`) and defines interactive elements, states, and navigation for the Copy service — the kiosk screen plus the four-screen phone-facing flow. Requirements: `docs/copy-upload-requirements.md`. Nothing described here is implemented yet.

## Reuse decision (made in this document)

**Confirmed here:** the phone-facing pages reuse the same lightweight-design-system approach Scan's own phone pages use (`docs/screens/scan-spec.md`, "Design system reuse") — same token values, same non-React-SPA plain page. Where a Copy phone screen is functionally identical to its Scan counterpart (P2's corner adjustment, P3's preview/multi-page mechanics), **its interactive element ids still get their own `copy-` prefix**, not reused `scan-` ids — matching this project's own precedent (Scan's kiosk screen reused `QrUploadScreen`'s _layout_ but not its element ids; Copy does the same relative to Scan). This keeps every id traceable to exactly one screen/flow regardless of how much underlying code ends up shared between the two.

## Kiosk screen

### Layout

Reuses Scan's own kiosk-screen layout unchanged in structure (`docs/screens/scan-spec.md`) — see `docs/screens/copy-wireframes.md` for the ASCII wireframe.

### Interactive elements

| Identifier                | Purpose                                                   | Default state                      | Enabled/disabled                    | Action after click / Navigation                                                                                                            |
| ------------------------- | --------------------------------------------------------- | ---------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `service-copy`            | Entry point from Welcome Screen                           | Currently `coming-soon`            | Becomes `available` once this ships | Creates/reuses a Kiosk Session (Trigger A, same as `service-print`/`service-scan`), navigates here                                         |
| `copy-qr-code`            | QR image encoding the phone-facing flow's start URL       | Visible once the session has an id | Not interactive                     | None — scanned by the phone's own camera app                                                                                               |
| `copy-status`             | The right-half status area (see "Screen states" below)    | Shows "Waiting" state              | Not interactive                     | None                                                                                                                                       |
| `copy-configure-printing` | Opens Print Order Configuration for the captured document | Hidden except in "Ready" state     | Enabled when shown                  | Navigates to Print Order Configuration, pre-loaded with the real captured document                                                         |
| `copy-another-document`   | Starts a second, independent capture                      | Hidden except in "Ready" state     | Enabled when shown                  | Returns `copy-status` to "Waiting" with a newly generated QR code (ends the previous phone-side capture, same mechanism as `scan-restart`) |

`navigation-back`, `navigation-home`, `end-session`, and the footer/Cart/Account/Language controls are the same shared elements every screen already has — not re-specified here.

### Screen states

1. **Waiting** (default) — `copy-status` shows the idle message; no page count yet.
2. **In progress** — at least one page has been captured on the phone; `copy-status` shows a live page count. Updated via the same 3s polling mechanism Scan already uses.
3. **Ready** — the phone side reached "Finish"; `copy-status` shows the captured document as one item (page count included) with `copy-configure-printing` and `copy-another-document` both visible.

### Navigation

- `service-copy` → this screen.
- Leaving and returning preserves the same QR code and current state, same persistence rule already confirmed for Scan/QR upload — a capture in progress on the phone isn't lost by navigating away from this screen on the kiosk.
- `copy-configure-printing` → Print Order Configuration (real navigation, leaves this screen). Returning here afterward (via Back) still shows the same "Ready" state for the same document — tapping it again just re-opens configuration for the same real file, same as reopening any other already-uploaded file.
- `copy-another-document` → back to "Waiting" state, new QR code.

---

## Phone-facing flow

Four screens, state carried between them (current page count, captured pages) as described in `docs/screens/copy-wireframes.md`.

### P1 — Start

| Identifier        | Purpose                         | Default state | Action                                                                       |
| ----------------- | ------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| `copy-take-photo` | Opens the phone's native camera | Enabled       | `<input type="file" capture="environment">` — hands off to the OS camera app |

**Navigation:** entry point (reached via the kiosk's QR code, or via `copy-add-page` from P3) → after a photo is taken, advances to P2.

### P2 — Adjust corners

**Layout:** identical to Scan's P2 (Concept B, dimmed area outside the current crop polygon) — confirmed unchanged in `docs/copy-upload-requirements.md`, not re-explored here.

| Identifier             | Purpose                                                                    | Default state                                                                       | Action                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `copy-corner-handle-*` | Four draggable corner points (`-tl/-tr/-bl/-br`)                           | Positioned at auto-detected corners, or the photo's own corners if detection failed | Drag to adjust; polygon/dimming updates live, client-side only                                                                      |
| `copy-retake`          | Discards this photo, returns to P1                                         | Enabled                                                                             | → P1                                                                                                                                |
| `copy-confirm-corners` | Confirms the crop, sends photo + coordinates to the backend for processing | Enabled                                                                             | Uploads photo + corner coordinates → P3 (shows a brief processing/loading state while the server-side transform runs, same as Scan) |

### P3 — Preview / multi-page

| Identifier          | Purpose                                                   | Default state                     | Action                                                                             |
| ------------------- | --------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| `copy-page-preview` | Shows the just-processed page                             | Visible once processing completes | None (display only)                                                                |
| `copy-page-thumb-*` | Thumbnail strip of already-captured pages (`-1`, `-2`, …) | Hidden until a 2nd page exists    | None (display only — no per-page edit/delete, same open item Scan carried forward) |
| `copy-add-page`     | Captures another page                                     | Enabled                           | → P1                                                                               |
| `copy-finish`       | Ends capture, moves to the terminal screen                | Enabled                           | → P-Done                                                                           |

### P-Done — Confirmation

| Identifier          | Purpose                                                       | Default state | Action       |
| ------------------- | ------------------------------------------------------------- | ------------- | ------------ |
| `copy-done-message` | Tells the person to return to the kiosk to configure printing | Visible       | Display only |

**Navigation:** terminal screen for this phone-side capture — no further action defined here (closing the browser tab is expected). The kiosk's own `copy-status` reaching "Ready" is the actual signal for the person to look back at the kiosk.

---

## Accessibility

Same bar as the kiosk itself (`docs/design/design-system.md`, Section 15) applied to a phone context — identical considerations already noted for Scan (`docs/screens/scan-spec.md`, "Accessibility"): large touch targets (`copy-corner-handle-*` in particular), high contrast, no reliance on color alone.

## Notes for implementation

- `copy-corner-handle-*` hit areas should be meaningfully larger than their visual size — same note as Scan's own P2.
- The kiosk's `copy-status` polling should reuse the exact interval/pattern already established (3s) — not a new value.
- Whatever backend/client code already implements Scan's P1–P3 and corner-detection pipeline should be reused directly for Copy's P1–P3 (same underlying mechanism, different ids/wording/ending) rather than duplicated — the exact code-sharing approach (a shared render function parameterized by "scan" vs. "copy," vs. two separate but structurally identical modules) is an implementation decision, not specified here.

## Open items

None currently — `docs/copy-upload-requirements.md`'s and `docs/screens/copy-wireframes.md`'s open items (multi-page optionality, corner-adjustment reuse, kiosk-side per-document representation, retention, pricing, and the "Copy another document" ordering question) were all resolved in those two documents before this spec was written.
