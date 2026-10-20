# Kiosk Screens Redesign — Plan

Started 2026-10-20 on branch `redesign`. Goal set by the product owner: every kiosk screen looks modern and calm, and a customer understands within about 2 seconds what the screen is for and what to do next. No technical buttons or labels on customer-facing screens; hints on the screen itself instead.

Source of ideas: the product owner's ChatGPT screen pack (32 mock-ups, 2026-10-20) — taken as a design direction, not as a spec. Where it disagreed with confirmed decisions or the hardware, the confirmed side wins (table below).

## Way of working

Releases: the `redesign` branch goes to staging after each batch (seen on the stand monitor with the real flow), and to production once the whole print path — batches 1–4 — is done, so a customer never meets half-new, half-old screens mid-flow. Batches 5–7 follow in a second release.

1. One screen at a time, built in the real code with the real behaviour.
2. A 1920×1080 screenshot goes to the product owner for approval in chat.
3. After a batch of approved screens, one look on the real stand monitor (iiyama TF1615MC, 15.6", 1920×1080, touch) — touch, type size, readability.
4. The screen's spec in `docs/screens/` is updated with the approved version.

## Batches

1. **Foundation + Welcome** — tokens (`src/styles/tokens.css`), header with status, footer with icons, `Button` variants, `ServiceCard`, `DevOnly` (Simulate scaffolding fenced off, removed with `VITE_HIDE_SIMULATE=true`).
2. **Into the flow** — upload-method selection, QR upload, e-mail upload, account login, files from the account.
3. **Files and print** — file preparation/list, print configuration, preview, order review (instead of today's Cart popup).
4. **Payment and pick-up** — payment, "checking payment", printing, "done, take your documents", refund on failure.
5. **Scan and Copy.**
6. **Popups** — help, tariffs, language, "how your data is protected", end session, inactivity warning, empty cart.
7. **System states** — no connection, stand unavailable, file error, closing-soon strip, pavilion closed; **an on-screen keyboard inside the app** (decided 2026-10-20) — the stand has no physical keyboard, and the Windows touch keyboard in Chrome kiosk mode appears unreliably, covers half the screen and may offer a way out of the kiosk.
8. **Phone pages** — QR upload, scan, copy on the customer's phone.
9. Texts in all five languages; Slovak checked by a native speaker.

The photo kiosk is a separate, later piece of work.

## Where the screen pack was corrected

| In the mock-ups                                         | Confirmed                                                             | Used                                             |
| ------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| Paper A4 / A3                                           | The printer does A4 and A5 (`src/types/kiosk.ts`)                     | A4 / A5                                          |
| ₽ on "Payment question"                                 | Prices in euros                                                       | €                                                |
| Asking "like a book / like a notepad" for duplex        | The flip edge is chosen automatically from the page orientation       | Not asked                                        |
| Popups dim the whole screen, header and footer included | Popups never cover the header/footer (`docs/domain/kiosk-session.md`) | Kept, unless the product owner decides otherwise |
| End Session only on some screens                        | In the header on every screen while a session is active               | In the header                                    |
| "Contact the operator" everywhere                       | The remote intercom isn't built                                       | Hidden until decided                             |
| Scan tools "improve readability", "rotate", "crop"      | Only corner adjustment exists                                         | Only real features                               |
| Pictures with words inside                              | Five interface languages                                              | No text in images                                |
| Mixed illustration styles                               | —                                                                     | One line-icon set (`lucide-react`)               |
| 16:9 screen                                             | Docs still said 2880×1800; the stand screen is 1920×1080              | 1920×1080                                        |

## Open decisions (product owner)

1. Brand name and logo — "Future Print" is a working name (`src/components/BrandMark/BrandMark.tsx`).
2. ~~Popups: keep "never cover header/footer", or dim the whole screen as in the mock-ups.~~ Decided 2026-10-20: dim and blur only the working area; header and footer stay clear and usable (`docs/domain/kiosk-session.md` updated).
3. What "Contact the operator" does before the intercom exists — a phone number / messenger QR, or hidden.
4. Illustrations: line icons only, or drawn scenes (commissioned or generated as one set, without text). 2026-10-20: the product owner is considering bringing the comic-style scenes back — people don't like reading. The steps are one component (`src/components/StepList/`), so scenes would replace the icons on every screen at once.
5. The step indicator "Files → Settings → Review → Payment → Print" across the whole print flow.

Defaults used until decided: working name, operator hidden, line icons only, step indicator from batch 3.

## Status

| Screen                                          | Status                |
| ----------------------------------------------- | --------------------- |
| Welcome                                         | Approved (2026-10-20) |
| Upload method selection                         | Approved (2026-10-20) |
| QR upload                                       | Approved (2026-10-20) |
| E-mail address + list                           | Approved (2026-10-20) |
| Login popup (+ register, reset)                 | Approved (2026-10-20) |
| Files from the account                          | Approved (2026-10-20) |
| Print settings + preview                        | Approved (2026-10-20) |
| Order review (replaces Cart popup)              | Approved (2026-10-20) |
| Payment + receipt choice                        | Approved (2026-10-20) |
| Printing / pick-up / refund                     | Approved (2026-10-20) |
| Thank you (finalising session)                  | Approved (2026-10-20) |
| Scan (+ "print the scan")                       | Approved (2026-10-20) |
| Copy (straight to print settings)               | Approved (2026-10-20) |
| Popups: help, prices, language, data protection | Approved (2026-10-20) |
| End session confirm + inactivity warning        | Approved (2026-10-20) |
