# Payments and fiscal receipts — business requirements

Confirmed with the product owner on 2026-10-02. Technical design: `docs/payments-technical-requirements.md`. Background research and hardware choices: `docs/payments-and-receipts-plan.md`.

## Scope of this phase

| Point of sale                                                                    | Payment                                               | Receipt                                                                                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Print kiosk** (both stands; Print and Copy — Copy goes through the same Cart)  | Card on the stand's own Viva terminal (Ciontek CM30P) | eKasa receipt                                                                                                                               |
| **Portal** (orders paid in advance from the personal account, and shop checkout) | Online card payment (Viva Smart Checkout)             | Payment confirmation by e-mail; whether an eKasa receipt is needed for online payments is part of the query to the Financial Administration |

Not in this phase: the photo corner (it keeps its "Simulate" payment until it gets its own terminal), cash, vouchers/promo codes, company invoicing (separate plan).

Scan stays free — no payment step (`docs/scan-upload-requirements.md`).

## Prices

- Prices are in **EUR, VAT included** (the company is a VAT payer, 23 %). The customer always sees the final price.
- Until the real price list is confirmed, **placeholder prices in euro cents** are used, kept in one place so the real ones replace them without other changes.
- **Minimum card payment 0.30 €** (changed 2026-10-06 — Viva accepts no card payment below 0.30 €, demo and live alike). A smaller order is topped up to 0.30 € with its own line («Doplatok do minimálnej sumy platby kartou», also on the receipt); the Cart, the portal and the shop say so before paying. If every document of the payment ends up refunded, the top-up is refunded too.
- The amount charged is always calculated by the server from the order's settings, never taken from what the stand's screen shows.

## Kiosk: the customer's journey

1. The customer selects documents in the Cart and presses "Proceed to payment".
2. The Payment screen shows the list and the total and asks to **tap or insert the card on the terminal**. The terminal shows the same amount.
3. The customer has **60 seconds** to pay (changed from 90 on 2026-10-08: the CM30P itself stops waiting for the card after about a minute and the API can't extend it, so the stand's countdown follows the terminal). They can cancel on the screen at any time before the card is accepted.
4. **Declined, timed out or cancelled on the terminal:** the screen explains what happened and offers **"Try again"** or **"Cancel"**. Nothing is charged; the Cart stays as it was.
5. **Paid:** the customer chooses how to get the receipt (see below), and printing starts.
6. While a payment is in progress, End Session and the inactivity timeout are blocked (already the rule — `docs/domain/kiosk-session.md`).
7. Payment is refused before it starts when the printer, the terminal or the cash register is unavailable — the same way the Cart already blocks payment while the printer is unavailable.

## Receipts

- After a successful payment the customer sees a **receipt choice screen**:
  - **QR code on the screen** (default, preselected) — the customer scans it and opens the receipt on their phone;
  - **by e-mail** — the customer types the address;
  - **paper** — printed by the thermal receipt printer next to the pickup bins.
- Choosing QR or e-mail is the customer's **explicit consent to an electronic receipt**, which the law requires before the paper receipt can be skipped (§ 8(1), law 384/2025).
- If the customer doesn't choose within a short time, the QR option applies and printing continues — the customer is never blocked by the receipt choice.
- Every sale is registered in eKasa **when the payment is accepted**, regardless of how the receipt is delivered.

## When printing fails

- **Refund automatically and immediately, only for the documents that failed** — documents that printed successfully are not refunded (the customer has them).
- The refund goes back to the same card; a matching eKasa **return receipt** is issued and delivered the same way as the original receipt.
- **A Telegram alert is sent at once**: what failed, which stand, the amount refunded, and whether the refund succeeded.
- If the automatic refund itself fails, the alert says so, and staff refund it manually from the admin panel.
- The customer sees on the screen that the money for the failed documents has been returned.

## Portal: online payments

- An order created on the portal is paid online by card (Viva Smart Checkout page); only after a confirmed payment does it become "paid, awaiting print" and appear on the kiosk.
- The customer gets a payment confirmation by e-mail.
- **If the customer never comes to print, nothing happens automatically** — the order waits. A refund is made only on the customer's request, by staff, from the admin panel.

## Staff and admin panel

- List of payments with their state: paid, refunded (fully or partly), failed; with the stand, the amount, the Viva transaction and the eKasa receipt.
- Manual refund (full or for selected documents) — always with a return receipt.
- Daily reconciliation: kiosk payments vs Viva transactions vs eKasa receipts; any mismatch is highlighted and alerted.

## Telegram alerts

- Printing failed after payment (with the refund result).
- A refund failed.
- The terminal or the cash register is unreachable.
- A payment whose outcome couldn't be determined (connection lost mid-payment) — resolved automatically when possible, alerted when not.
- A reconciliation mismatch.

## Still open (for the product owner)

- Real price list (EUR with VAT).
- Whether eKasa is required at all (vending-machine exemption) and for online payments — the Financial Administration query.
- Viva's answers: pre-authorization (charge only after printing succeeded), refunds via API without the card, terminal mounting.
- Who handles a customer's refund request in practice (phone, e-mail), and the support contact shown on screen.
