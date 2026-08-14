# Phone-Camera Scan — Wireframes

Internal project document. Low-fidelity layout exploration for the Scan service, based only on requirements confirmed in `docs/scan-upload-requirements.md`. Covers two separate surfaces that need their own wireframes: the **kiosk screen** (one screen, reuses an already-approved layout pattern) and the **phone-facing flow** (five screens/states, genuinely new — nothing in this project has wireframed a multi-step phone-side flow before). No exact colors/spacing are prescribed here beyond what the real design system (`docs/design/design-system.md`, `src/styles/tokens.css`) already defines by name — this document is about structure and interaction, not pixel values.

## Kiosk screen

Reuses `QrUploadScreen`'s approved two-half layout (`docs/qr-upload-requirements.md`) rather than inventing a new one — the underlying mechanic (QR code on one side, live status on the other, kiosk polling in the background) is identical, only the copy and the right-half content differ.

```
+----------------------------------------------------------------------------+
| BrandMark                                                  [Finish and     |
|                                                              clear data]    |
| [Back]  [Home]                                                             |
|                                                                             |
|      +----------------------+        +------------------------------+      |
|      |                      |        |                              |      |
|      |      [ QR CODE ]     |        |     <status area, see        |      |
|      |                      |        |      states below>           |      |
|      +----------------------+        |                              |      |
|      Scan with your phone's          +------------------------------+      |
|      camera to start scanning                                             |
|                                                                             |
+----------------------------------------------------------------------------+
| [Call operator] [Help] [Tariffs]              [Account] [Cart] [Language]  |
+----------------------------------------------------------------------------+
```

**Right-half status area — three states**, all plain text/status, no new component needed beyond what already exists:

1. **Waiting** (default): "Waiting for you to start on your phone…" — same idle-waiting tone as `QrUploadScreen`'s `t.qrUpload.waitingForFiles`.
2. **In progress** (phone-side session active, at least one page captured): a live page count, e.g. "3 pages captured so far…" — reassures the person standing at the kiosk that something is happening on their phone, without needing to show the pages themselves (they're already looking at their phone for that).
3. **Delivered**: a short confirmation once the phone side reaches "Finish" — what it says depends on the delivery method(s) chosen (e.g., "Sent to your email" / "Saved to your account"), plus a way to start over (a plain "Scan another document" action, resets to state 1 with a fresh QR code the same way leaving/returning to `QrUploadScreen` already preserves-vs-resets today).

## Phone-facing flow

Five screens in sequence, all served by the same lightweight, anonymous, session-scoped page QR upload already uses (`docs/scan-upload-requirements.md`, "How it works"). Diagrammed as a flow, not five independent screens designed in isolation, since the state carried between them (which page you're on, how many pages captured) matters as much as any one screen's own layout:

```
 P1 Start ──▶ P2 Adjust corners ──▶ P3 Preview / multi-page ──┬──▶ P4 Delivery ──▶ P5 Confirmation
                    ▲                                          │
                    └──────────── "Add another page" ──────────┘
```

### P1 — Start

```
+-----------------------------------+
|                                   |
|          Scan a document          |
|                                   |
|   Take a clear, well-lit photo    |
|   of one page.                    |
|                                   |
|      [   📷  Take a photo   ]     |
|                                   |
+-----------------------------------+
```

Tapping the button is a plain `<input type="file" capture="environment">` — opens the phone's own native camera UI (confirmed: no custom live viewfinder, `docs/scan-upload-requirements.md`). Nothing about this screen is bespoke; it exists mainly to hold the instruction text before the OS camera takes over.

### P2 — Adjust corners

The one screen here that's a genuine design decision, not a foregone layout — two concepts:

**Concept A — outline only**

```
+-----------------------------------+
|  Adjust the edges                 |
|                                   |
|  +-------------------------------+ |
|  | O┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄O | |
|  | ┊    [ full photo, as-shot ] ┊| |
|  | ┊                            ┊| |
|  | O┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄O | |
|  +-------------------------------+ |
|                                   |
|   [ Retake ]         [ Confirm ]  |
+-----------------------------------+
```

Four draggable corner handles connected by lines, drawn over the untouched photo. Simple to build (a polygon overlay, nothing else changes visually), but doesn't show what will actually be kept vs. discarded — the user has to imagine the crop.

**Concept B — dimmed outside the crop (recommended)**

```
+-----------------------------------+
|  Adjust the edges                 |
|                                   |
|  +-------------------------------+ |
|  |▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓| |
|  |▓▓O┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄O▓▓▓| |
|  |▓▓┊   [ document, in-crop ]  ┊▓▓| |
|  |▓▓O┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄O▓▓▓| |
|  |▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓| |
|  +-------------------------------+ |
|                                   |
|   [ Retake ]         [ Confirm ]  |
+-----------------------------------+
```

Same four draggable handles, but the area outside the current polygon is darkened/dimmed, same convention every mainstream scan/crop app uses (this is the one place a direct comparison to CamScanner-style apps is actually relevant — the interaction pattern, not the branding). Immediately legible: light area is "kept," dark area is "discarded," updates live as a handle is dragged.

**Recommendation: Concept B.** The extra implementation cost over Concept A is small (a masked overlay, not new interaction logic — the drag handling is identical either way) and the legibility gain is real: someone doing this once at a kiosk, under time pressure, benefits far more from "what you see is what you get" than from having to mentally project the eventual crop from four lines.

### P3 — Preview / multi-page

```
+-----------------------------------+
|  Page 1 ready                     |
|                                   |
|  +-------------------------------+ |
|  |                               | |
|  |   [ processed, cleaned scan ] | |
|  |                               | |
|  +-------------------------------+ |
|                                   |
|  [1] [2] [3]   <- only shown once > 1 page
|                                   |
|   [ + Add another page ]          |
|   [ Finish ]                      |
+-----------------------------------+
```

Shows the server-processed result (`docs/scan-upload-requirements.md`, "Image processing") for the page just captured. The thumbnail strip only appears once a second page exists — on the very first page it would just be visual noise for something not true yet. **"Add another page"** returns to P1 for the next page (confirmed multi-page mechanic); **"Finish"** moves on to P4. Both stay available for as long as the user keeps adding pages — there's no page-count cap implied here.

### P4 — Delivery

```
+-----------------------------------+
|  Get your document                 |
|                                   |
|  ☐  Email it to me                 |
|      [ email address        ]      |  <- appears only once checked
|                                   |
|  ☐  Download link (this phone)     |
|                                   |
|  ☐  Save to My files               |
|      (you'll need to log in)       |
|                                   |
|            [ Done ]                |  <- disabled until ≥1 checked
+-----------------------------------+
```

All three confirmed delivery methods as checkboxes (multi-select confirmed, `docs/scan-upload-requirements.md`), each revealing its own extra field/step only once checked — keeps the default view uncluttered. Checking "Save to My files" while logged out surfaces the existing `LoginPanel` (the same component already used for Register-via-QR) rather than a bespoke login form — reuse, not a new pattern.

### P5 — Confirmation

```
+-----------------------------------+
|                                   |
|            ✓  All set              |
|                                   |
|   Sent to you@example.com          |
|   Saved to My files                |
|                                   |
|   You can put your phone away —    |
|   check the kiosk screen.          |
+-----------------------------------+
```

Lists back exactly which of the chosen delivery methods succeeded (plain confirmation text per method checked in P4) and explicitly tells the person to look back at the kiosk — since the kiosk screen's own "Delivered" state (see "Kiosk screen" above) is what actually closes the loop for whoever's standing there.

## Carried-over design principles (not re-litigated here)

- Anonymous/session-scoped except where "Save to My files" is chosen (`docs/scan-upload-requirements.md`).
- Same QR/base-URL resolution mechanism as QR upload (LAN IP locally, public domain deployed).
- Phone-side screens are plain, single-column, large touch targets — the same accessibility bar as the kiosk itself (`docs/design/design-system.md`, Section 15), even though a phone isn't the kiosk's own touchscreen.

## Open items

- Exact wording/microcopy for every screen (placeholders above) — deferred to the spec.
- Whether "Retake" on P2 discards the photo entirely (back to P1) or allows re-adjusting the same photo's corners without reshooting — leaning toward "Retake" meaning reshoot and a separate, implicit "just keep dragging" for corner-only fixes, but not confirmed.
- Any error states (camera permission denied, upload failure, processing failure) — not designed yet, out of scope for this pass.
