import type { fiscalReceipts } from './db/schema.js';
import type { ReceiptDocument } from './fiscalReceiptStore.js';

// The customer's eKasa receipt as a phone-sized page (GET /receipts/:id) —
// what the stand's QR code and the receipt e-mail link to
// (docs/payments-business-requirements.md, "Receipts"). Laid out like a
// printed eKasa receipt: seller, register code, lines, VAT breakdown, total,
// the receipt's unique id (or offline control code) and its QR code. Plain
// HTML served by this backend, same approach as the phone upload pages.
//
// Seller details come from RECEIPT_SELLER_NAME / _ADDRESS / _ICO / _DIC /
// _IC_DPH — the company's real registration data, set at deployment.

type ReceiptRow = typeof fiscalReceipts.$inferSelect;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Both simulators (server/fiscalReceiptStore.ts, agent/fiscalDevice.ts) issue
// receipt ids starting "O-SIM" — never a real eKasa id.
function isSimulated(receipt: ReceiptRow): boolean {
  return receipt.receiptUid?.startsWith('O-SIM') ?? false;
}

function euro(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

const PAGE_STYLE = `
  :root { --ink: #101817; --soft: #56635f; --line: #d7e0de; --paper: #ffffff; --ground: #f2f6f5; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--ground); color: var(--ink);
    font: 15px/1.45 "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace; }
  main { max-width: 26rem; margin: 1.5rem auto; padding: 1.25rem 1rem; background: var(--paper);
    border: 1px solid var(--line); }
  h1 { font-size: 1rem; text-align: center; margin: 0 0 0.25rem; letter-spacing: 0.04em; }
  .center { text-align: center; }
  .soft { color: var(--soft); font-size: 0.85rem; }
  .rule { border-top: 1px dashed var(--soft); margin: 0.75rem 0; }
  .row { display: flex; justify-content: space-between; gap: 1rem; font-variant-numeric: tabular-nums; }
  .total { font-weight: 700; font-size: 1.1rem; }
  .test { text-align: center; font-weight: 700; color: #b3261e; margin-bottom: 0.5rem; }
  img { display: block; margin: 0.75rem auto 0; width: 10rem; height: 10rem; }
  .id { word-break: break-all; text-align: center; font-size: 0.8rem; }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export function renderReceiptPage(receipt: ReceiptRow | null, qrDataUrl: string | null): string {
  if (!receipt) {
    return page(
      'Doklad nenájdený',
      `<h1>Doklad nenájdený</h1><p class="center soft">Receipt not found — it may still be being issued. Try again in a minute.</p>`,
    );
  }
  const document = JSON.parse(receipt.document) as ReceiptDocument;
  const env = (name: string) => escapeHtml(process.env[name] ?? '—');
  const issued = (receipt.registeredAt ?? receipt.createdAt).toLocaleString('sk-SK', {
    timeZone: 'Europe/Bratislava',
  });
  const lines = document.lines
    .map(
      (line) => `
      <div>${escapeHtml(line.description)}</div>
      <div class="row soft"><span>${line.quantity} × ${euro(line.unitPriceCents)} · DPH ${line.vatRatePercent} %</span><span>${euro(line.amountCents)}</span></div>`,
    )
    .join('');
  const vat = document.vat
    .map(
      (rate) => `
      <div class="row soft"><span>Základ ${rate.ratePercent} %</span><span>${euro(rate.baseCents)}</span></div>
      <div class="row soft"><span>DPH ${rate.ratePercent} %</span><span>${euro(rate.vatCents)}</span></div>`,
    )
    .join('');
  const idLabel = receipt.receiptUid
    ? `UID: ${escapeHtml(receipt.receiptUid)}`
    : `OKP: ${escapeHtml(receipt.okp ?? '')}`;
  return page(
    document.kind === 'sale' ? 'Pokladničný doklad' : 'Doklad o vrátení',
    `
    ${isSimulated(receipt) ? '<div class="test">TESTOVACÍ DOKLAD — simulátor, nie je platný</div>' : ''}
    <h1>${env('RECEIPT_SELLER_NAME')}</h1>
    <div class="center soft">${env('RECEIPT_SELLER_ADDRESS')}</div>
    <div class="center soft">IČO ${env('RECEIPT_SELLER_ICO')} · DIČ ${env('RECEIPT_SELLER_DIC')} · IČ DPH ${env('RECEIPT_SELLER_IC_DPH')}</div>
    <div class="center soft">Kód pokladnice ${escapeHtml(receipt.cashRegisterCode ?? '')}</div>
    <div class="rule"></div>
    <div class="center"><strong>${document.kind === 'sale' ? 'POKLADNIČNÝ DOKLAD' : 'DOKLAD O VRÁTENÍ'}</strong></div>
    <div class="row soft"><span>Číslo ${escapeHtml(receipt.receiptNumber ?? '')}</span><span>${escapeHtml(issued)}</span></div>
    <div class="rule"></div>
    ${lines}
    <div class="rule"></div>
    ${vat}
    <div class="row total"><span>Spolu</span><span>${euro(document.totalCents)}</span></div>
    <div class="row soft"><span>Platba kartou</span><span>${euro(document.totalCents)}</span></div>
    <div class="rule"></div>
    ${receipt.status === 'registered-offline' ? '<div class="center soft">Doklad vyhotovený v režime offline</div>' : ''}
    <div class="id">${idLabel}</div>
    ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR kód dokladu" />` : ''}
    `,
  );
}
