# Payments and fiscal receipts — technical requirements

Business rules: `docs/payments-business-requirements.md`. Hardware and vendor background: `docs/payments-and-receipts-plan.md`. Status 2026-10-02: B1, B1b, B2 and B3 are done, on the simulated terminal — server-side pricing, the kiosk Payment screen, printing only what was paid, and the automatic refund + Telegram alert when a paid item fails to print. Receipts are only recorded as a choice until B4.

## Principles

1. **The server is the only source of truth for money.** The stand sends what is being bought (the print settings and page counts it already sends to `POST /api/print-tasks`); the server prices it, creates the payment, talks to Viva and eKasa, and decides what may be printed. Today's client-side `computeUnitPrice` (`src/utils/pricing.ts`) stays for display only and must give the same result as the server (one shared module).
2. **Integer euro cents everywhere**, VAT included. VAT per receipt line = `gross − round(gross / 1.23)`; rate kept per line (`vatRatePercent`) so a future rate change doesn't rewrite history.
3. **Nothing prints unpaid.** `POST /api/print-tasks` accepts a task only for a paid payment item that hasn't printed yet (or a portal order already paid in advance). Today any stand request is printed — that hole closes with this work.
4. **Every external system sits behind an adapter with a simulator**, chosen by env: `PAYMENT_TERMINAL=simulator|viva`, `FISCAL_REGISTER=simulator|ninedigit`, `ONLINE_CHECKOUT=simulator|viva`. Development and the hardware-less demo run fully on simulators; the simulator is driven by the same "Simulate …" buttons convention as printing (`CLAUDE.md`), closed in production like the print Simulate routes.
5. **Every step is idempotent and recoverable** after a restart or a lost connection: our payment id is sent to Viva as the merchant reference; on uncertainty we ask Viva for the session's state instead of guessing.

## Data model (new / changed tables)

`payment_orders` (exists — extended):

- `channel`: `'kiosk-terminal' | 'online-checkout'`; `standId`; `provider` (`'simulator' | 'viva'`).
- `status`: `created → awaiting-card → paid | declined | cancelled | timed-out | failed`, then `partially-refunded | refunded`. `unknown` while the outcome is being recovered after a lost connection.
- `providerSessionId` (Viva Cloud Terminal session / Smart Checkout order code), `providerTransactionId`, `cardMasked`, `failureReason`, `expiresAt` (created + 90 s), `paidAt`.
- `receiptDelivery`: `'qr' | 'email' | 'paper'`, `receiptEmail`.

`payment_items` (new) — the priced snapshot of each Cart item at payment time:

- `paymentOrderId`, `description` (receipt text, e.g. "Tlač A4 ČB obojstranne"), `quantity`, `unitPriceCents`, `amountCents`, `vatRatePercent`;
- the print configuration needed to create the print task (file id, origin, paperSize, sides, color, orientation, scale, pages, pagesPerSheet, copies);
- `printTaskId` (once printing starts), `refundedCents`.

`payment_refunds` (new): `paymentOrderId`, `amountCents`, `reason` (`'print-failed' | 'staff'`), `itemIds`, `status` (`pending | succeeded | failed`), `providerRefundId`, `createdBy` (staff id or `system`), timestamps.

`fiscal_receipts` (new): `paymentOrderId` or `refundId`, `kind` (`'sale' | 'return'`), `status` (`pending | registered | registered-offline | failed`), `receiptNumber`, eKasa `uid` / `okp`, `qrPayload`, `deliveredVia`, `deliveredAt`, `requestJson`, `responseJson`, timestamps.

## Kiosk payment flow (Cloud Terminal API)

1. Stand: `POST /api/payments` (`requireStand`) with `sessionId`, `standId`, and the selected Cart items' print configuration. Server: checks printer/terminal/register availability, prices the items, writes `payment_orders` + `payment_items`, then calls the adapter `terminal.startSale({ terminalId (from standId), amountCents, reference: paymentOrderId })` → `awaiting-card`. Returns the payment with its server-calculated total; the stand shows that total, not its own.
2. Stand polls `GET /api/payments/:id` every 1–2 s (same pattern as print tasks).
3. Server learns the outcome from Viva's webhook (`Transaction Pos Ecr Session Created/Failed`, signed with the merchant webhook key) **and** from polling Viva's session status as a fallback. Whichever arrives first wins; the transition is a single conditional UPDATE (`WHERE status = 'awaiting-card'`), so a duplicate is a no-op.
4. Customer cancel on screen: `POST /api/payments/:id/cancel` → `terminal.abort()`; if Viva reports the card was already accepted, the payment is **paid**, not cancelled — the abort result decides.
5. Timeout: at `expiresAt` the server aborts on Viva and marks `timed-out` (unless Viva says paid). "Try again" creates a **new** payment order for the same items.
6. On `paid`: register the sale in eKasa (below), then the stand moves to the receipt-choice screen and Print Status. Print tasks are created with `paymentItemId`; the server rejects a second task for the same item.
7. Lost connection between our server and Viva during a sale: status `unknown`, a background check asks Viva about our reference until it resolves; unresolved after 10 min → incident + Telegram.

Terminal map: `VIVA_TERMINAL_IDS="A:16001234,B:16005678"` (stand id → Viva terminal id), same style as `STAND_API_KEYS`.

## eKasa (NineDigit / Portos) flow

- The CHDÚ and the NineDigit service run on the pavilion mini-PC; their HTTP API is local (`localhost:3010`), unreachable from the cloud. **The print agent relays it**: the cloud queues fiscal jobs, the agent claims them (same pull model as print tasks, `server/agentRoutes.ts`), calls NineDigit locally and reports the result (receipt number, `uid`/`okp`, QR payload). If NineDigit's own cloud connection turns out to be usable, the adapter can call it directly instead — the rest doesn't change.
- Sale receipt: one line per `payment_item` (description, quantity, unit price, VAT rate), payment method "card". Sent right after `paid`.
- Return receipt: for each refund, referencing the original receipt, lines = refunded items.
- Offline: NineDigit itself issues an offline receipt (OKP) and uploads later → status `registered-offline`; nothing blocks the customer.
- Register unreachable (agent down / CHDÚ unplugged): payment is refused up front (availability check in step 1); if it breaks between payment and receipt, the receipt job stays `pending`, retries, and raises an incident.
- Delivery: QR → the stand shows `qrPayload` (the eKasa receipt link); e-mail → the server e-mails the receipt (Resend, same sender as the rest); paper → the agent asks NineDigit to print on the thermal printer.

## Refund on print failure

- Triggered from `updatePrintTaskStatus(..., 'failed')` (`server/printTaskStore.ts`) for a task linked to a payment item: create `payment_refunds` for that item's amount (only the failed items), call `terminal.refund()` (Viva: refund of the original transaction by id, no card needed — **to confirm with Viva**), then queue the return receipt.
- Always report an incident (`payment.refunded-after-print-failure`, or `payment.refund-failed`) through `reportIncident`, which already forwards to Telegram (`server/telegramNotifier.ts`).
- If Viva confirms pre-authorization on the CM30P, this becomes "capture after print / void on failure" — the adapter interface keeps that option open (`capture`, `void`).

## Online checkout (portal)

- `POST /api/accounts/orders/:id/pay` → `checkout.createOrder({ amountCents, reference, customer e-mail })` → Viva Smart Checkout order code → the portal redirects to Viva's payment page.
- Viva redirects back to the portal (success/failure page) and sends the `Transaction Payment Created` webhook; **only the webhook (or a server-side status check) marks the order paid** — the redirect alone never does.
- Shop checkout (`server/shopOrderStore.ts`) uses the same `createOrder` path.
- Refunds on request: from the admin panel, through the same refund table.

## API (new)

| Route                                                                                                            | Who                   | Purpose                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------- |
| `POST /api/payments`                                                                                             | stand                 | Price the selection, start the terminal sale                                |
| `GET /api/payments/:id`                                                                                          | stand                 | Status, total, failure reason, receipt QR                                   |
| `POST /api/payments/:id/cancel`                                                                                  | stand                 | Abort before the card is accepted                                           |
| `POST /api/payments/:id/receipt`                                                                                 | stand                 | `{ via: 'qr' \| 'email' \| 'paper', email? }`                               |
| `POST /api/payments/:id/simulate`                                                                                | stand, simulator only | `{ outcome: 'paid' \| 'declined' \| 'cancelled-on-terminal' \| 'timeout' }` |
| `POST /api/payments/webhooks/viva`                                                                               | Viva                  | Webhook receiver (+ the GET verification Viva requires)                     |
| `GET /api/agent/fiscal-jobs/next`, `POST /api/agent/fiscal-jobs/:id/result`                                      | print agent           | eKasa relay                                                                 |
| `GET /api/admin/payments`, `POST /api/admin/payments/:id/refund`, `GET /api/admin/payments/reconciliation?date=` | staff                 | Admin panel                                                                 |

## Configuration

`PAYMENT_TERMINAL`, `FISCAL_REGISTER`, `ONLINE_CHECKOUT` (simulator by default); `VIVA_ENV=demo|live`, `VIVA_CLIENT_ID`, `VIVA_CLIENT_SECRET` (POS API / OAuth), `VIVA_MERCHANT_ID`, `VIVA_API_KEY` (Smart Checkout / webhook verification), `VIVA_SOURCE_CODE`, `VIVA_TERMINAL_IDS`; agent: `NINEDIGIT_URL` (default `http://localhost:3010`). Secrets only in `.env` / Railway variables.

## Build order

- **B1** — tables + payment state machine + terminal simulator + `/api/payments` routes; server-side pricing shared with the frontend. _Done 2026-10-02._
- **B1b** — print tasks require a paid item; the print settings come from the paid line, a repeat submission returns the same task. _Done 2026-10-02._ Still open: count pages on the server instead of trusting the stand's `pageCount`.
- **B2** — kiosk Payment screen on the real API (90 s countdown, declined/timeout/cancel with "Try again"), receipt-choice screen (QR default after 30 s), prices shown in euros. _Done 2026-10-02._ The Print Status "Retry" button now returns the same tasks (no reprint) — it is replaced by the refund flow in B3.
- **B3** — refund on print failure + incidents/Telegram. _Done 2026-10-02:_ `refundFailedPrintTask` (`server/paymentStore.ts`, called from `updatePrintTaskStatus`), `payment_refunds` table, `payment.refunded-after-print-failure` (critical) / `payment.refund-failed` (emergency) incidents with the payment item as `correlationId`, so every refund alerts on Telegram despite the 10-minute cooldown; Print Status shows the refund instead of a Retry button. `PAYMENT_SIMULATE_REFUND_FAILURE=true` makes the simulator's refund fail. Return receipts follow in B4.
- **B4** — fiscal register adapter + simulator + agent relay; receipts (QR / e-mail / paper).
- **B5** — Viva Cloud Terminal client against the demo account (phone with the Viva Terminal DEMO app).
- **B6** — portal online checkout (Smart Checkout) + webhook.
- **B7** — admin: payments list, manual refund, daily reconciliation.
- **B8** — NineDigit client on real hardware; end-to-end tests on the CM30P.
