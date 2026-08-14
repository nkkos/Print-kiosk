# Copy — Wireframes

Internal project document. Low-fidelity layout exploration for the Copy service, based only on requirements confirmed in `docs/copy-upload-requirements.md`. Covers the same two surfaces as Scan's own wireframes (`docs/screens/scan-wireframes.md`): the **kiosk screen** and the **phone-facing flow** — but since Copy's confirmed architecture reuses Scan's capture pipeline wholesale, most of what follows is Scan's own wireframes with the delivery-specific parts removed, not a fresh design pass. No exact colors/spacing are prescribed here beyond what the real design system (`docs/design/design-system.md`, `src/styles/tokens.css`) already defines by name.

## Kiosk screen

Same two-half layout as Scan's kiosk screen (QR code on one side, live status on the other) — only the status states and the "what happens once it's ready" step differ, since Copy hands off to Print Order Configuration instead of showing a delivery confirmation.

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
|      camera to start                                                      |
|                                                                             |
+----------------------------------------------------------------------------+
| [Call operator] [Help] [Tariffs]              [Account] [Cart] [Language]  |
+----------------------------------------------------------------------------+
```

**Right-half status area — three states**, matching Scan's own state shape but ending differently:

1. **Waiting** (default): "Waiting for you to start on your phone…" — identical wording to Scan's own Waiting state.
2. **In progress** (phone-side capture active, at least one page captured): a live page count, e.g. "3 pages captured so far…" — identical mechanism to Scan.
3. **Ready** (phone side reached "Finish"): the captured document appears as **one selectable item**, e.g.:

```
   Document ready (3 pages)
   [ Configure printing ▸ ]

   [ Copy another document ]
```

Tapping the item opens Print Order Configuration, pre-loaded with the real captured document — the same navigation QR upload's received-files list already triggers for a ready file, not a new pattern. **"Copy another document"** starts a second, independent capture (a fresh QR code, same mechanism as Scan's `scan-restart`) without leaving this screen or losing the first document, which is already safely in the Cart by the time a second capture begins (see "Confirmed flow ordering" below).

### Confirmed flow ordering

The person is expected to configure and add the first document to Cart **before** starting a second capture — "Copy another document" is reachable from the Ready state (after Print Order Configuration has already been reached once), not a way to queue up multiple raw captures before configuring any of them. This keeps the kiosk-side status area simple (one document's status at a time) and matches how QR upload already handles "come back for more" — add one, return, add another.

## Phone-facing flow

Four screens/states — one fewer than Scan, since Delivery (Scan's P4/P5) doesn't apply:

```
 P1 Start ──▶ P2 Adjust corners ──▶ P3 Preview / multi-page ──┬──▶ P-Done
                    ▲                                          │
                    └──────────── "Add another page" ──────────┘
```

### P1 — Start

Same layout as Scan's P1, **reworded** per `docs/copy-upload-requirements.md`'s confirmed instruction:

```
+-----------------------------------+
|                                   |
|          Copy a document          |
|                                   |
|   To print a copy, first scan     |
|   the document with your phone.   |
|                                   |
|      [   📷  Take a photo   ]     |
|                                   |
+-----------------------------------+
```

Same `<input type="file" capture="environment">` mechanism as Scan — no behavioral difference, wording only.

### P2 — Adjust corners

**Identical to Scan's P2, Concept B** (dimmed-outside-crop, already approved in `docs/screens/scan-wireframes.md`) — not re-litigated here, since `docs/copy-upload-requirements.md` explicitly confirmed corner adjustment is unchanged for Copy. Same auto-detect-then-adjust behavior, same "Retake"/"Confirm" actions.

### P3 — Preview / multi-page

Same layout as Scan's P3, but **"Finish" leads to P-Done instead of a delivery screen**:

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

Multi-page remains optional (confirmed) — the person can tap "Finish" after just one page, same as Scan.

### P-Done — new terminal screen (replaces Scan's P4/P5)

```
+-----------------------------------+
|                                   |
|            ✓  All set              |
|                                   |
|   Your document is ready.          |
|                                   |
|   You can put your phone away —    |
|   go back to the kiosk to choose   |
|   your print settings.             |
|                                   |
+-----------------------------------+
```

No delivery-method choice (nothing to choose — output always goes to the kiosk). Explicitly tells the person to look back at the kiosk, same closing-the-loop principle as Scan's P5, just pointed at a different next step (configure printing, not "check your inbox").

## Carried-over design principles (not re-litigated here)

- Anonymous/session-scoped for the capture itself (`docs/copy-upload-requirements.md`) — no login needed on the phone at any point, unlike Scan's "Save to My files" option (which doesn't exist for Copy).
- Same QR/base-URL resolution mechanism as Scan and QR upload (LAN IP locally, public domain deployed).
- Phone-side screens are plain, single-column, large touch targets — same accessibility bar as the kiosk itself (`docs/design/design-system.md`, Section 15).

## Open items

- Exact wording/microcopy beyond what's fixed above — deferred to the spec, same as Scan's own wireframes.
- Whether "Copy another document" should be reachable _before_ the first document is added to Cart (e.g., a person who wants to batch-capture two documents back to back before configuring either) — leaning toward "no" per "Confirmed flow ordering" above, but worth a final check before the spec locks it in.
- Any error states (camera permission denied, upload failure, processing failure, no ready document when Print Order Configuration is opened) — not designed yet, same open item Scan's own wireframes carried forward and still hasn't resolved.
