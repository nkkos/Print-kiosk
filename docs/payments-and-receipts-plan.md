# Payments and receipts (eKasa) — confirmed plan

Decisions confirmed with the product owner on 2026-10-01/02. Implementation hasn't started; the kiosk's Payment step is still the "Simulate …" mock.

Detailed requirements: `docs/payments-business-requirements.md` (business rules) and `docs/payments-technical-requirements.md` (design and build order); vendor questions and hardware acceptance tests: `docs/payments-open-items.md`.

## Card payments — Viva.com

- Acquirer: **Viva.com**. Terminal: **Ciontek CM30P** (chip & PIN + contactless, unattended-certified by Viva), **one per kiosk stand**, 330 € each. Chosen over the contactless-only CM30C because cards periodically demand chip + PIN (strong customer authentication) and amounts above the contactless limit need a PIN.
- Integration: **Viva Cloud Terminal API** from our cloud backend — start a sale on the stand's own terminal (stand id → Viva terminal id), wait for the result (polling and/or webhooks), abort on timeout, refund. No local network link between stand and terminal is needed.
- Open questions for Viva before ordering: Cloud Terminal API in unattended launcher mode, kiosk mounting and power, receipts (the terminal has no printer), delivery to Slovakia, POS API credentials and the demo environment.

## Cash register — eKasa (law 384/2025 Z. z., in force since 2026-01-01)

- **Whether a register is needed at all is not settled.** Card payments at the point of sale count as revenue that must be recorded, but § 3(2)(b)(3) exempts services provided through vending machines ("predajné automaty"), and the law doesn't define the term. A written query to the Financial Administration is being sent; until it's answered, plan for a register.
- If needed: **NineDigit / Portos eKasa** (certified now; CHDÚ device on the pavilion mini-PC, HTTP API locally or over their cloud connection; ≈ 200–220 € + 60 € fiscalisation). Cloud-only registers (SORP: SuperKasa, llarik) would fit the architecture better but weren't verifiably certified as of 2026-10-02.
- **The company is a VAT payer** — receipts show VAT (23 %).
- Receipt delivery: **electronic by default** (e-mail or QR on the stand's screen — the law allows it when the customer agrees before printing). For customers who want paper, one thermal receipt printer (57/80 mm, NineDigit can't print on the Brother) next to the pickup bins.

## Order of operations

1. Customer pays on the stand's terminal → Viva result reaches the cloud.
2. Sale registered in eKasa → receipt delivered (e-mail / QR / paper).
3. Job printed into the reserved bin.
4. **If printing fails: refund immediately and automatically** (with the matching eKasa return receipt) **and send a Telegram alert at once** that printing failed and the money was refunded (confirmed 2026-10-02).

## Effort estimate (given 2026-10-02)

About 2–2.5 weeks of development: Viva payments 3–4 days, eKasa integration 3–4 days, the pay → receipt → print → refund chain plus daily reconciliation in the admin panel 2–3 days, testing on real hardware 2–3 days. Calendar risk: terminal and CHDÚ delivery, and eKasa registration/fiscalisation (eKasa zone access with eID, authentication data, activation by a service partner), which only the company can do.
