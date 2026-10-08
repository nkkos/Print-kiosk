# Payments — open items, vendor questions and hardware acceptance

Status 2026-10-06. Everything that can be built without hardware is done (B1–B7, see `docs/payments-technical-requirements.md`). What remains depends on answers from Viva, the NineDigit service partner and the Financial Administration, and on testing with the real devices.

## Tested on the real CM30P, live account (2026-10-08)

Terminal 16804263, run locally (`VIVA_ENV=live`, `PAYMENT_TERMINAL=viva`), six real payments, all refunded:

- **Contactless sale 0.30 €** — paid; **refund through the Payment API without the card succeeded** (sale shows as voided, status X, refund −0.30 €), also with the terminal's own Refund button PIN-locked.
- **Chip sale 0.30 € and 10.20 €** — card read by chip (`panEntryMode 05`), both `CHIP – NO CVM`: the terminal didn't ask for a PIN even at 10.20 € (unattended terminals' no-PIN limit — asked Viva). Both refunded.
- **Cancel from the stand** — aborted after 11 s, Viva confirmed. When the card had already been tapped (6 s in), the abort lost (`abortSuccess: false`) and the payment was correctly kept as paid — so nothing may lie next to the terminal in the stand.
- **Timeout** — the terminal itself stops waiting after ~60–67 s (Viva error 1003); the stand's window is now 60 s and 1003 shows as "time ran out".
- **Viva's own slip** — the terminal offers the card slip by SMS or e-mail for a few seconds after paying; both arrive (not for a sale voided right away). Proposal: hide that screen in the pavilion, the customer gets our eKasa receipt on the stand (asked Viva how).

## Already settled on the Viva demo (no need to ask)

- Cloud Terminal API: sale, session polling and abort work against the Viva Terminal DEMO app (2026-10-06).
- A card-present sale can be refunded server to server (Payment API `DELETE /api/transactions/{id}`) without the card — confirmed on the demo.
- Smart Checkout: payment orders, state lookup by order code, return through a payment source with `payments/return`.
- Demo minimum amount: 0.30 €.

## Letter to Viva

Written for: Viva merchant support / account manager.

> **Subject: Ciontek CM30P in an unattended kiosk — remaining questions before go-live**
>
> Hello,
>
> We are a Viva merchant in Slovakia (Bluetec s.r.o.) integrating two Ciontek CM30P terminals into self-service print kiosks via the Cloud Terminal API. Our integration already works against the demo environment (sale, abort, server-side refund, Smart Checkout). Before ordering and going live we need to confirm:
>
> 1. **CM30P in unattended mode with the Cloud Terminal API** — is the CM30P with the unattended launcher fully supported by the Cloud Terminal API (sale, session status, abort), with no staff confirmation on the device?
> 2. **Pre-authorization** — the API has a `preauth` flag "enabled on request". Can you enable pre-authorization and capture for our account on the CM30P? We would capture only after the document has printed and void otherwise.
> 3. **Refunds** — on the demo we refund card-present sales with `DELETE /api/transactions/{id}` (Merchant ID + API key). Is that the supported way in production for CM30P sales, including same-day cancel and later refunds? Any time limits?
> 4. **Webhooks** — which events should we subscribe to for the terminal sessions and Smart Checkout payments, and is there a retry policy?
> 5. **Mounting and power** — bezel or bracket for building the CM30P into a kiosk panel (dimensions, cut-out); power supply; operating temperature; 24/7 operation on mains.
> 6. **Network** — Ethernet / Wi-Fi / 4G: which outbound hosts and ports must our firewall allow? Our pavilion is on a 4G/5G router.
> 7. **Customer experience** — idle screen branding, Slovak and English display languages, PIN entry and contactless limits on the CM30P.
> 8. **Card slip** — the CM30P has no printer; can the cardholder slip be sent by e-mail/SMS, or skipped? We issue the Slovak eKasa fiscal receipts ourselves.
>    8a. **PIN limit and slip screen** — on our CM30P chip payments up to at least 10.20 € went through without a PIN (`CHIP – NO CVM`). Above what amount does it ask for a PIN? And can the post-payment slip screen (SMS / e-mail) be switched off — `showReceipt: false` in the sale request didn't hide it?
> 9. **Launcher settings** — on our CM30P the documented gesture (10 taps bottom-left, PIN `112`) doesn't open the launcher settings. How do staff reach them for maintenance (e.g. changing Wi-Fi), and how do we change that PIN, since `112` is published in your public documentation? What do the RESET and SERVICE buttons on the back do?
> 10. **Commercial** — delivery time to Slovakia, monthly fees for the device or the unattended launcher, warranty and replacement.
>
> Thank you,
> [name, phone]

## Letter to the NineDigit service partner

Written for: a NineDigit / Portos eKasa service partner (in Slovak).

> **Predmet: eKasa NineDigit (CHDÚ Lite) pre samoobslužnú prevádzku — integrácia cez API**
>
> Dobrý deň,
>
> prevádzkujeme samoobslužný tlačový kiosk (bez obsluhy) v Bratislave a potrebujeme online registračnú pokladnicu eKasa, ktorú bude ovládať náš vlastný softvér.
>
> Máme záujem o:
>
> - **CHDÚ Lite (variant s USB)** pripojené k Windows mini-PC,
> - **termotlačiareň 80 mm** kompatibilnú s CHDÚ (slovenská diakritika),
> - **fiškalizáciu** (nahratie autentifikačných údajov z eKasa zóny).
>
> Prosíme o:
>
> 1. cenovú ponuku vrátane fiškalizácie, odporúčanej tlačiarne a dopravy,
> 2. **dokumentáciu HTTP API** (Portos eKasa, localhost:3010) — registrácia dokladu, doklad o vrátení s odkazom na pôvodný doklad, platba kartou, sadzba DPH 23 %, tlač / bez tlače (elektronický doklad),
> 3. **testovací režim alebo emulátor** na vývoj pred fiškalizáciou,
> 4. informáciu, či je možné pripojenie cez **cloud** (namiesto lokálneho API),
> 5. ako API hlási **stav pokladnice** (CHDÚ pripojené, tlačiareň bez papiera, offline doklady čakajúce na odoslanie),
> 6. či API vracia **odkaz alebo PDF elektronického dokladu** pre zákazníka.
>
> Ďakujeme,
> [meno, telefón]

## Question for the Financial Administration (add to the existing letter)

Written for: Finančná správa SR (addition to the vending-machine exemption query, in Slovak).

> **Doplňujúca otázka:** Zákazníci si môžu tlač objednať a zaplatiť aj vopred online (platobná brána, platba kartou cez internet) a dokument si potom len vytlačia v kiosku. Je takáto online platba tržbou podľa zákona č. 384/2025 Z. z., pri ktorej treba vyhotoviť pokladničný doklad v eKasa, alebo postačuje faktúra / potvrdenie o platbe?

## Setting up a CM30P for the kiosk

Without this the terminal's home screen lets anyone type an amount, open transactions or refund to their own card.

1. **Viva.com Terminal app** — More → PIN protected settings → Enable PIN Protection (own PIN, kept in the password manager):
   - protect **Settings, Transactions, Refunds, Preauth, Capture preauth, MOTO, Deeplink actions**;
   - **Disable manual amount entry** — on: payments only start from our backend (Cloud Terminal API);
   - **Kiosk mode** — on: the app fills the screen, More is PIN-locked (leave: tap More 3× → PIN);
   - **Force card presentment for refunds** — **off**: the automatic refund after a failed print must work without the card.
2. **Ciontek CM30 Launcher** (before mounting in the stand) — tap 10× bottom-left, PIN `112` → Autorun Application = Viva.com Terminal, Application Filter = Viva only, mode **Fully Unattended** → Enter Launch Mode. Hides Android navigation and starts Viva after a power cut.

Source: developer.viva.com — Unattended Solutions → Ciontek CM30 Launcher; Tutorials → Tap on Phone → PIN Protection, Kiosk Mode.

**Checked on the real CM30P (2026-10-08):** the Viva Launcher ships installed as an app; opening it once made it the controlling launcher. After a power cut the launcher shows for ~10 s and then starts the Viva.com Terminal app by itself; the Android navigation buttons are gone and the notification shade doesn't open. That is the state needed in the stand. The documented settings gesture (10 taps bottom-left, PIN `112`) did not open anything on this unit — asked Viva (question 9).

**Mounting notes (CM30P back panel):** power **24 V ⎓ 1 A** through the 6-pin connector (the stand needs a 24 V supply); **LAN** port — wire it to the pavilion switch rather than relying on Wi-Fi; RS232-A/B, USB-host, USB-C; three **SMA** antenna sockets for external 4G/Wi-Fi antennas if the stand is metal; **RESET** and **SERVICE** buttons on the back — don't press without Viva's instructions (RESET may wipe the activation).

## Hardware acceptance — payments and receipts

Run once the CM30P terminals and the fiscalised NineDigit register are installed (`PAYMENT_TERMINAL=viva`, `FISCAL_REGISTER=agent` on Railway, `FISCAL_DEVICE=ninedigit` on the agent).

| #    | Scenario                                    | Expected                                                                                 |
| ---- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| PAY1 | Pay a cart by contactless card on stand A   | Terminal of stand A shows the amount; paid within the 60 s window; receipt choice screen |
| PAY2 | Same on stand B                             | Only stand B's terminal reacts (`VIVA_TERMINAL_IDS`)                                     |
| PAY3 | Card that needs PIN / chip                  | PIN entered on the CM30P, payment completes                                              |
| PAY4 | Declined card                               | "Declined, nothing charged", Try again works                                             |
| PAY5 | Cancel on the stand before the card         | Terminal stops waiting; nothing charged                                                  |
| PAY6 | Wait out the 60 s                           | "Time ran out", terminal returns to idle                                                 |
| PAY7 | Unplug the terminal's network mid-payment   | No double charge; outcome resolved or alerted                                            |
| REC1 | Receipt by QR                               | QR on Print Status opens the eKasa receipt (real UID, verifiable in "Over doklad")       |
| REC2 | Receipt by e-mail                           | E-mail arrives with the receipt link                                                     |
| REC3 | Paper receipt                               | Printed by the receipt printer next to the bins                                          |
| REC4 | No choice for 2 minutes                     | Paper receipt printed                                                                    |
| REF1 | Simulate / cause a paper jam after paying   | Refund on the card, return receipt, Telegram alert                                       |
| REF2 | Manual refund from the admin panel (senior) | Refund on the card, return receipt                                                       |
| FIS1 | Receipt printer out of paper                | Stands stop taking payment, critical alert; resumes after refill                         |
| FIS2 | Internet down at the register               | Offline receipt (OKP) issued; sent to eKasa when back                                    |
| FIS3 | CHDÚ unplugged                              | Stands stop taking payment, alert                                                        |
| RCN1 | Next morning                                | Nightly reconciliation shows no mismatch for the test day                                |
| ONL1 | Portal "Pay now" on the live Viva account   | Returns to My orders, order paid, printable at the kiosk                                 |
