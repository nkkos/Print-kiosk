# Phone-Camera Scan — Spec

Internal project document. Confirms the approved layout (Concept B from `docs/screens/scan-wireframes.md`) and defines interactive elements, states, and navigation for the Scan service — the kiosk screen plus the five-screen phone-facing flow. Requirements: `docs/scan-upload-requirements.md`. Nothing described here is implemented yet.

## Design system reuse (decision made in this document)

**Confirmed here:** the phone-facing screens use the kiosk's real design tokens (`src/styles/tokens.css` — Manrope, the teal accent, the same radius/elevation scale), not left unstyled the way QR upload's phone page deliberately was ("plain file input + upload button," `docs/qr-upload-requirements.md`). That simplicity was right for a one-field form; it would read as broken/unfinished for a multi-step flow with drag interactions and choices, especially now that the kiosk itself has a real visual identity to be consistent with. The phone pages remain their own lightweight app (not the kiosk React SPA, no component-library dependency) — they just draw from the same token values, the same relationship the portal has to the kiosk's design system in principle, even though the portal hasn't been restyled to match yet (`docs/screens/portal-personal-account-spec.md`).

## Kiosk screen

### Layout

Reuses `QrUploadScreen`'s approved two-half layout unchanged in structure (`docs/qr-upload-requirements.md`) — see `docs/screens/scan-wireframes.md` for the ASCII wireframe.

### Interactive elements

| Identifier     | Purpose                                                | Default state                      | Enabled/disabled                    | Action after click / Navigation                                                     |
| -------------- | ------------------------------------------------------ | ---------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| `service-scan` | Entry point from Welcome Screen                        | Currently `coming-soon`            | Becomes `available` once this ships | Creates/reuses a Kiosk Session (Trigger A, same as `service-print`), navigates here |
| `scan-qr-code` | QR image encoding the phone-facing flow's start URL    | Visible once the session has an id | Not interactive                     | None — scanned by the phone's own camera app, not tapped on the kiosk               |
| `scan-status`  | The right-half status area (see "Screen states" below) | Shows "Waiting" state              | Not interactive                     | None                                                                                |
| `scan-restart` | Starts a fresh scan after a completed delivery         | Hidden except in "Delivered" state | Enabled when shown                  | Returns to "Waiting" state with a newly generated QR code                           |

`navigation-back`, `navigation-home`, `end-session`, and the footer/Cart/Account/Language controls are the same shared elements every screen already has (`docs/design/design-system.md`, Section 2) — not re-specified here.

### Screen states

1. **Waiting** (default) — `scan-status` shows the idle message; no page count yet.
2. **In progress** — at least one page has been captured on the phone; `scan-status` shows a live page count. Updated via the same polling mechanism QR upload already uses.
3. **Delivered** — the phone side reached P5 (Confirmation); `scan-status` shows which delivery method(s) succeeded; `scan-restart` becomes visible.

### Navigation

- `service-scan` → this screen.
- Leaving and returning (e.g., via Back from Upload Method Selection-equivalent navigation, or Home then back) preserves the same QR code and current state, same persistence rule already confirmed for QR upload (`docs/qr-upload-requirements.md`, "Persistence across revisits") — a scan in progress on the phone isn't lost by navigating away from this screen on the kiosk.
- `scan-restart` → back to "Waiting" state, new QR code (ends the previous phone-side session).

---

## Phone-facing flow

Five screens, state carried between them (current page count, captured pages) as already described in `docs/screens/scan-wireframes.md`. Each screen below follows the same Purpose/Layout/Interactive elements/Navigation shape as the kiosk screens elsewhere in this project, adapted for a single-column mobile page.

### P1 — Start

**Interactive elements**

| Identifier        | Purpose                         | Default state | Action                                                                       |
| ----------------- | ------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| `scan-take-photo` | Opens the phone's native camera | Enabled       | `<input type="file" capture="environment">` — hands off to the OS camera app |

**Navigation:** entry point (reached via the kiosk's QR code, or via `scan-add-page` from P3) → after a photo is taken, advances to P2.

### P2 — Adjust corners

**Layout:** Concept B from the wireframes doc (dimmed area outside the current crop polygon) — confirmed, not re-explored here.

**Interactive elements**

| Identifier             | Purpose                                                                    | Default state                                                                       | Action                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scan-corner-handle-*` | Four draggable corner points (`-tl/-tr/-bl/-br`)                           | Positioned at auto-detected corners, or the photo's own corners if detection failed | Drag to adjust; polygon/dimming updates live, client-side only                                                                                                                |
| `scan-retake`          | Discards this photo, returns to P1                                         | Enabled                                                                             | → P1                                                                                                                                                                          |
| `scan-confirm-corners` | Confirms the crop, sends photo + coordinates to the backend for processing | Enabled                                                                             | Uploads photo + corner coordinates → P3 (shows a brief processing/loading state while the server-side transform runs, `docs/scan-upload-requirements.md`, "Image processing") |

### P3 — Preview / multi-page

**Interactive elements**

| Identifier          | Purpose                                                   | Default state                     | Action                                                                             |
| ------------------- | --------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| `scan-page-preview` | Shows the just-processed page                             | Visible once processing completes | None (display only)                                                                |
| `scan-page-thumb-*` | Thumbnail strip of already-captured pages (`-1`, `-2`, …) | Hidden until a 2nd page exists    | None (display only — no per-page edit/delete in this pass, see "Open items" below) |
| `scan-add-page`     | Captures another page                                     | Enabled                           | → P1                                                                               |
| `scan-finish`       | Ends capture, moves to delivery                           | Enabled                           | → P4                                                                               |

### P4 — Delivery

**Interactive elements**

| Identifier             | Purpose                             | Default state                               | Action                                                                                                     |
| ---------------------- | ----------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `scan-deliver-email`   | Checkbox — email delivery           | Unchecked                                   | Reveals `scan-email-input` when checked                                                                    |
| `scan-email-input`     | Email address field                 | Hidden unless `scan-deliver-email` checked  | Standard text input, required + valid-email if that checkbox is checked                                    |
| `scan-deliver-link`    | Checkbox — download link            | Unchecked                                   | No extra field                                                                                             |
| `scan-deliver-account` | Checkbox — save to Personal Account | Unchecked                                   | If not logged in, surfaces the existing `LoginPanel` (Register-via-QR reused) before this can be finalized |
| `scan-deliver-done`    | Finalizes delivery                  | Disabled until ≥1 checkbox above is checked | Submits the chosen method(s) → P5                                                                          |

### P5 — Confirmation

**Interactive elements**

| Identifier          | Purpose                                  | Default state | Action       |
| ------------------- | ---------------------------------------- | ------------- | ------------ |
| `scan-done-summary` | Lists which delivery method(s) succeeded | Visible       | Display only |

**Navigation:** terminal screen for this phone-side session — no further action defined here (closing the browser tab is expected; nothing to undo or continue). The kiosk's own `scan-status` reaching "Delivered" is the actual signal for the person to look back at the kiosk (`docs/screens/scan-wireframes.md`).

---

## Accessibility

Same bar as the kiosk itself (`docs/design/design-system.md`, Section 15) applied to a phone context: large touch targets (the corner-drag handles on P2 in particular need a generous hit area, larger than their visible dot, since precise dragging on a small phone screen is harder than on the kiosk's own large touchscreen), high contrast, no reliance on color alone (P2's dimming is reinforced by the polygon outline itself, not color contrast alone).

## Notes for implementation

- `scan-corner-handle-*` hit areas should be meaningfully larger than their visual size (a common mobile-web pattern: small visible dot, larger invisible touch target) — flagged explicitly since it's easy to build the visible size only and end up with handles that are hard to grab.
- The kiosk's `scan-status` polling should reuse the exact interval/pattern QR upload already established (3s), not a new value invented for this feature.
- `scan-deliver-account`'s login-prompt sub-flow reuses `LoginPanel` as a component, not a rebuilt login form — same reuse principle already applied for Register-via-QR.

## Open items

- Whether a captured page (P3's thumbnail strip) can be deleted or reordered before Finish, or whether "Retake" (only available for the page just captured, on P2) is the only correction mechanism — leaning toward deferring per-thumbnail delete/reorder to a later pass, since it adds real interaction surface for a case (fixing an earlier page after moving on) that may be rare enough to not block a first version.
- Error states (camera permission denied, upload failure, processing failure, corner-confirm submitted with a degenerate/self-intersecting polygon) — not designed yet, carried over from the wireframes doc's own open items.
