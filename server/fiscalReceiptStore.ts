import { randomBytes } from 'node:crypto';
import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { db } from './db/client.js';
import { fiscalReceipts, paymentItems, paymentOrders, paymentRefunds } from './db/schema.js';
import { reportIncident } from './incidentStore.js';
import { sendReceiptEmail } from './emailSender.js';
import { publicBackendUrl } from './lanIp.js';

// eKasa receipts (docs/payments-technical-requirements.md, "eKasa (NineDigit
// / Portos) flow"; business rules in docs/payments-business-requirements.md,
// "Receipts"). A receipt is created once the customer has chosen how to get
// it — paper must be decided before the register prints — and then
// registered by the fiscal register:
//   FISCAL_REGISTER=simulator (default) — registered here at once with
//     made-up identifiers, so the whole flow runs without hardware;
//   FISCAL_REGISTER=agent — left 'pending' for the pavilion print agent,
//     which claims it (GET /api/agent/fiscal-jobs/claim), registers it on
//     the CHDÚ next to it and reports back.
// A refund gets a return receipt referencing the sale's, delivered the same
// way as the sale's.

export interface ReceiptLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  vatRatePercent: number;
}

export interface ReceiptDocument {
  kind: 'sale' | 'return';
  /** Our payment order id — the register's external reference. */
  reference: string;
  lines: ReceiptLine[];
  totalCents: number;
  vat: { ratePercent: number; baseCents: number; vatCents: number }[];
  paymentMethod: 'card';
  /** Print on the register's receipt printer (the customer chose paper). */
  print: boolean;
}

/** What the agent receives: the document plus, for a return, the sale
 * receipt it refers to. */
export interface FiscalJob {
  id: string;
  document: ReceiptDocument;
  originalReceipt: {
    receiptUid: string | null;
    okp: string | null;
    receiptNumber: string | null;
  } | null;
}

export interface RegisterResult {
  status: 'registered' | 'registered-offline';
  receiptUid: string | null;
  okp: string;
  receiptNumber: string;
  cashRegisterCode: string;
}

const AGENT_CLAIM_TIMEOUT_MS = 2 * 60_000;
const MAX_ATTEMPTS = 5;
/** After this long without a choice, the receipt is printed on paper — the
 * one delivery that needs no consent (business requirements, "Receipts"). */
export const RECEIPT_CHOICE_TIMEOUT_MS = 2 * 60_000;
const STUCK_RECEIPT_MS = 5 * 60_000;

export function fiscalMode(): 'simulator' | 'agent' {
  return process.env.FISCAL_REGISTER === 'agent' ? 'agent' : 'simulator';
}

export function receiptUrl(id: string): string {
  return `${publicBackendUrl()}/receipts/${id}`;
}

function vatSummary(lines: ReceiptLine[]): ReceiptDocument['vat'] {
  const byRate = new Map<number, number>();
  for (const line of lines) {
    byRate.set(line.vatRatePercent, (byRate.get(line.vatRatePercent) ?? 0) + line.amountCents);
  }
  return [...byRate].map(([ratePercent, grossCents]) => {
    const baseCents = Math.round(grossCents / (1 + ratePercent / 100));
    return { ratePercent, baseCents, vatCents: grossCents - baseCents };
  });
}

function buildDocument(
  kind: ReceiptDocument['kind'],
  reference: string,
  lines: ReceiptLine[],
  print: boolean,
): ReceiptDocument {
  return {
    kind,
    reference,
    lines,
    totalCents: lines.reduce((sum, line) => sum + line.amountCents, 0),
    vat: vatSummary(lines),
    paymentMethod: 'card',
    print,
  };
}

/** The sale receipt, once the customer's choice is known. No-op when the
 * payment already has one. */
export async function createSaleReceipt(paymentOrderId: string): Promise<void> {
  const [order] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, paymentOrderId));
  if (!order || !order.receiptDelivery || order.channel !== 'kiosk-terminal') return;
  const [existing] = await db
    .select({ id: fiscalReceipts.id })
    .from(fiscalReceipts)
    .where(and(eq(fiscalReceipts.paymentOrderId, order.id), eq(fiscalReceipts.kind, 'sale')));
  if (existing) return;
  const items = await db
    .select()
    .from(paymentItems)
    .where(eq(paymentItems.paymentOrderId, order.id));
  const document = buildDocument(
    'sale',
    order.id,
    items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      amountCents: item.amountCents,
      vatRatePercent: item.vatRatePercent,
    })),
    order.receiptDelivery === 'paper',
  );
  const [receipt] = await db
    .insert(fiscalReceipts)
    .values({
      paymentOrderId: order.id,
      kind: 'sale',
      delivery: order.receiptDelivery,
      email: order.receiptEmail,
      document: JSON.stringify(document),
    })
    .returning({ id: fiscalReceipts.id });
  await registerIfSimulated(receipt.id);
}

/** The return receipt for a successful refund — delivered like the sale's. */
export async function createReturnReceipt(refundId: string): Promise<void> {
  const [refund] = await db.select().from(paymentRefunds).where(eq(paymentRefunds.id, refundId));
  if (!refund || refund.status !== 'succeeded' || !refund.paymentItemId) return;
  const [item] = await db
    .select()
    .from(paymentItems)
    .where(eq(paymentItems.id, refund.paymentItemId));
  const [order] = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.id, refund.paymentOrderId));
  if (!item || !order) return;
  // Delivered the way the customer chose for the sale; if they never got
  // that far (the sweep hasn't run yet), paper is the safe default.
  const delivery = order.receiptDelivery ?? 'paper';
  const document = buildDocument(
    'return',
    order.id,
    [
      {
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: -item.unitPriceCents,
        amountCents: -refund.amountCents,
        vatRatePercent: item.vatRatePercent,
      },
    ],
    delivery === 'paper',
  );
  const [receipt] = await db
    .insert(fiscalReceipts)
    .values({
      paymentOrderId: order.id,
      refundId,
      kind: 'return',
      delivery,
      email: order.receiptEmail,
      document: JSON.stringify(document),
    })
    .returning({ id: fiscalReceipts.id });
  await registerIfSimulated(receipt.id);
}

async function registerIfSimulated(id: string): Promise<void> {
  if (fiscalMode() !== 'simulator') return;
  const job = await claimFiscalJob(id);
  if (!job) return; // a return waiting for its sale receipt — retried by the sweep
  await completeFiscalJob(id, simulateRegistration());
}

let simulatedReceiptCounter = 0;

function simulateRegistration(): RegisterResult {
  simulatedReceiptCounter += 1;
  const hex = (bytes: number) => randomBytes(bytes).toString('hex').toUpperCase();
  return {
    status: 'registered',
    receiptUid: `O-SIM${hex(14)}`,
    okp: [hex(4), hex(4), hex(4), hex(4), hex(4)].join('-'),
    receiptNumber: String(simulatedReceiptCounter),
    cashRegisterCode: '88800000000000000',
  };
}

const CLAIMABLE = sql`(${fiscalReceipts.claimedAt} IS NULL OR ${fiscalReceipts.claimedAt} < now() - (${AGENT_CLAIM_TIMEOUT_MS} * interval '1 millisecond'))`;
// A return receipt has to reference the sale's, so it waits for it.
const SALE_REGISTERED = sql`(${fiscalReceipts.kind} = 'sale' OR EXISTS (
  SELECT 1 FROM fiscal_receipts sale
  WHERE sale.payment_order_id = ${fiscalReceipts.paymentOrderId}
    AND sale.kind = 'sale'
    AND sale.status IN ('registered', 'registered-offline')))`;

async function toJob(row: typeof fiscalReceipts.$inferSelect): Promise<FiscalJob> {
  let originalReceipt: FiscalJob['originalReceipt'] = null;
  if (row.kind === 'return') {
    const [sale] = await db
      .select({
        receiptUid: fiscalReceipts.receiptUid,
        okp: fiscalReceipts.okp,
        receiptNumber: fiscalReceipts.receiptNumber,
      })
      .from(fiscalReceipts)
      .where(
        and(eq(fiscalReceipts.paymentOrderId, row.paymentOrderId), eq(fiscalReceipts.kind, 'sale')),
      );
    originalReceipt = sale ?? null;
  }
  return { id: row.id, document: JSON.parse(row.document) as ReceiptDocument, originalReceipt };
}

/** Takes one specific receipt for registering, if it's ready to be. */
async function claimFiscalJob(id: string): Promise<FiscalJob | null> {
  const [row] = await db
    .update(fiscalReceipts)
    .set({ claimedAt: new Date(), attempts: sql`${fiscalReceipts.attempts} + 1` })
    .where(
      and(
        eq(fiscalReceipts.id, id),
        eq(fiscalReceipts.status, 'pending'),
        CLAIMABLE,
        SALE_REGISTERED,
      ),
    )
    .returning();
  return row ? toJob(row) : null;
}

/** The agent's poll: the oldest receipt waiting to be registered. */
export async function claimNextFiscalJob(): Promise<FiscalJob | null> {
  const [candidate] = await db
    .select({ id: fiscalReceipts.id })
    .from(fiscalReceipts)
    .where(and(eq(fiscalReceipts.status, 'pending'), CLAIMABLE, SALE_REGISTERED))
    .orderBy(fiscalReceipts.createdAt)
    .limit(1);
  return candidate ? claimFiscalJob(candidate.id) : null;
}

/** The register's answer. A failure is retried (claimable again) up to
 * MAX_ATTEMPTS, then the receipt is marked failed and staff alerted. */
export async function completeFiscalJob(
  id: string,
  result: RegisterResult | { status: 'failed'; reason: string },
): Promise<void> {
  if (result.status === 'failed') {
    const [row] = await db
      .select({ attempts: fiscalReceipts.attempts, paymentOrderId: fiscalReceipts.paymentOrderId })
      .from(fiscalReceipts)
      .where(eq(fiscalReceipts.id, id));
    if (!row) return;
    const giveUp = row.attempts >= MAX_ATTEMPTS;
    await db
      .update(fiscalReceipts)
      .set({ status: giveUp ? 'failed' : 'pending', claimedAt: null, failureReason: result.reason })
      .where(and(eq(fiscalReceipts.id, id), eq(fiscalReceipts.status, 'pending')));
    if (giveUp) {
      void reportIncident({
        source: 'backend',
        code: 'fiscal.receipt-failed',
        severity: 'emergency',
        message: `An eKasa receipt could not be registered after ${MAX_ATTEMPTS} attempts (${result.reason}) — issue it by hand.`,
        context: { fiscalReceiptId: id, paymentOrderId: row.paymentOrderId },
        correlationId: id,
      });
    }
    return;
  }
  const [row] = await db
    .update(fiscalReceipts)
    .set({
      status: result.status,
      receiptUid: result.receiptUid,
      okp: result.okp,
      receiptNumber: result.receiptNumber,
      cashRegisterCode: result.cashRegisterCode,
      registeredAt: new Date(),
      failureReason: null,
    })
    .where(and(eq(fiscalReceipts.id, id), eq(fiscalReceipts.status, 'pending')))
    .returning();
  if (row) await deliver(row);
}

async function deliver(row: typeof fiscalReceipts.$inferSelect): Promise<void> {
  try {
    if (row.delivery === 'email' && row.email) {
      const document = JSON.parse(row.document) as ReceiptDocument;
      await sendReceiptEmail(row.email, receiptUrl(row.id), document.kind, document.totalCents);
    } else if (row.delivery === 'paper' && fiscalMode() === 'simulator') {
      console.log(`[fiscal] simulator — would print receipt ${row.id} on the receipt printer`);
    }
    // QR: the stand shows it (GET /api/payments/:id → receipt.url).
    await db
      .update(fiscalReceipts)
      .set({ deliveredAt: new Date() })
      .where(eq(fiscalReceipts.id, row.id));
  } catch (err) {
    void reportIncident({
      source: 'backend',
      code: 'fiscal.receipt-delivery-failed',
      severity: 'warning',
      message: `A registered receipt could not be delivered by ${row.delivery}: ${err instanceof Error ? err.message : String(err)}`,
      context: { fiscalReceiptId: row.id },
      correlationId: row.id,
    });
  }
}

export interface SaleReceiptView {
  status: string;
  delivery: string;
  url: string | null;
}

/** The sale receipt as the stand shows it: its link once registered. */
export async function getSaleReceiptView(paymentOrderId: string): Promise<SaleReceiptView | null> {
  const [row] = await db
    .select({
      id: fiscalReceipts.id,
      status: fiscalReceipts.status,
      delivery: fiscalReceipts.delivery,
    })
    .from(fiscalReceipts)
    .where(and(eq(fiscalReceipts.paymentOrderId, paymentOrderId), eq(fiscalReceipts.kind, 'sale')));
  if (!row) return null;
  const registered = row.status === 'registered' || row.status === 'registered-offline';
  return {
    status: row.status,
    delivery: row.delivery,
    url: registered ? receiptUrl(row.id) : null,
  };
}

export async function getReceipt(id: string) {
  const [row] = await db.select().from(fiscalReceipts).where(eq(fiscalReceipts.id, id));
  return row ?? null;
}

// Receipts already alerted as stuck — once per receipt per process, so the
// sweep doesn't log a new incident every 30 seconds.
const alertedStuck = new Set<string>();

/** Background duties (server/index.ts): the paper default for a customer
 * who never chose, simulator retries of returns that waited for their sale
 * receipt, and an alert for anything stuck unregistered. */
export async function sweepReceipts(): Promise<void> {
  const unchosen = await db
    .select({ id: paymentOrders.id })
    .from(paymentOrders)
    .where(
      and(
        eq(paymentOrders.channel, 'kiosk-terminal'),
        inArray(paymentOrders.status, ['paid', 'partially-refunded', 'refunded']),
        isNull(paymentOrders.receiptDelivery),
        lt(paymentOrders.paidAt, new Date(Date.now() - RECEIPT_CHOICE_TIMEOUT_MS)),
      ),
    );
  // A delivery chosen but no sale receipt made (the server stopped in
  // between) — issue it now.
  const chosenWithoutReceipt = await db
    .select({ id: paymentOrders.id })
    .from(paymentOrders)
    .where(
      and(
        eq(paymentOrders.channel, 'kiosk-terminal'),
        inArray(paymentOrders.status, ['paid', 'partially-refunded', 'refunded']),
        isNotNull(paymentOrders.receiptDelivery),
        sql`NOT EXISTS (SELECT 1 FROM fiscal_receipts r WHERE r.payment_order_id = ${paymentOrders.id} AND r.kind = 'sale')`,
      ),
    );
  for (const order of chosenWithoutReceipt) await createSaleReceipt(order.id);

  // Likewise a succeeded refund with no return receipt.
  const refundsWithoutReceipt = await db
    .select({ id: paymentRefunds.id })
    .from(paymentRefunds)
    .where(
      and(
        eq(paymentRefunds.status, 'succeeded'),
        sql`NOT EXISTS (SELECT 1 FROM fiscal_receipts r WHERE r.refund_id = ${paymentRefunds.id})`,
      ),
    );
  for (const refund of refundsWithoutReceipt) await createReturnReceipt(refund.id);

  for (const order of unchosen) {
    await db
      .update(paymentOrders)
      .set({ receiptDelivery: 'paper', updatedAt: new Date() })
      .where(and(eq(paymentOrders.id, order.id), isNull(paymentOrders.receiptDelivery)));
    await createSaleReceipt(order.id);
  }

  const pending = await db
    .select({ id: fiscalReceipts.id, createdAt: fiscalReceipts.createdAt })
    .from(fiscalReceipts)
    .where(eq(fiscalReceipts.status, 'pending'));
  for (const row of pending) {
    await registerIfSimulated(row.id);
    if (row.createdAt.getTime() < Date.now() - STUCK_RECEIPT_MS && !alertedStuck.has(row.id)) {
      alertedStuck.add(row.id);
      void reportIncident({
        source: 'backend',
        code: 'fiscal.receipt-delayed',
        severity: 'critical',
        message: `An eKasa receipt has been waiting to be registered for over ${STUCK_RECEIPT_MS / 60_000} minutes — is the pavilion agent / cash register running?`,
        context: { fiscalReceiptId: row.id },
        correlationId: row.id,
      });
    }
  }
}
