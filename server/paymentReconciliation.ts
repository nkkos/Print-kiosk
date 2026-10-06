import { and, desc, eq, gte, inArray, isNotNull, like, lt, or } from 'drizzle-orm';
import { db } from './db/client.js';
import {
  fiscalReceipts,
  incidents,
  paymentItems,
  paymentOrders,
  paymentRefunds,
} from './db/schema.js';
import { reportIncident } from './incidentStore.js';
import { listVivaTransactions, type VivaTransaction } from './vivaTerminal.js';

// Payments in the admin panel and the daily reconciliation
// (docs/payments-business-requirements.md, "Staff and admin panel"):
// kiosk payments vs Viva's transactions vs eKasa receipts, one calendar day
// at a time in the pavilion's time zone. Runs every night for the day before
// (server/index.ts) and on demand from the admin panel.

const TIME_ZONE = 'Europe/Bratislava';
const PAID_STATUSES = ['paid', 'partially-refunded', 'refunded'];
const REGISTERED = ['registered', 'registered-offline'];
// Kiosk terminal payments, and online checkouts (only real ones carry their
// payload — older simulated portal rows don't).
const CARD_PAYMENTS = or(
  eq(paymentOrders.channel, 'kiosk-terminal'),
  isNotNull(paymentOrders.checkoutPayload),
);

/** The pavilion's calendar day as a UTC range, e.g. "2026-10-05". */
export function dayRange(day: string): { start: Date; end: Date } {
  const offsetAt = (utc: Date) => {
    const name = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      timeZoneName: 'longOffset',
    })
      .formatToParts(utc)
      .find((part) => part.type === 'timeZoneName')?.value;
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? '');
    return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
  };
  const midnight = (date: string) => {
    const naive = new Date(`${date}T00:00:00Z`);
    return new Date(naive.getTime() - offsetAt(naive) * 60_000);
  };
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: midnight(day), end: midnight(next.toISOString().slice(0, 10)) };
}

/** Today in the pavilion's time zone, shifted by `deltaDays`. */
export function pavilionDay(deltaDays = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

export interface AdminPaymentRow {
  id: string;
  paidAt: string | null;
  createdAt: string;
  /** 'kiosk-terminal' | 'online-checkout' */
  channel: string;
  standId: string | null;
  provider: string | null;
  status: string;
  amountCents: number;
  refundedCents: number;
  failureReason: string | null;
  providerTransactionId: string | null;
  receipt: { kind: string; status: string; delivery: string }[];
  items: {
    id: string;
    description: string;
    quantity: number;
    amountCents: number;
    refundedCents: number;
  }[];
  refunds: {
    amountCents: number;
    status: string;
    reason: string;
    createdBy: string;
    failureReason: string | null;
    createdAt: string;
  }[];
}

/** Every kiosk card payment started on the day, newest first, with its
 * lines, refunds and receipts. */
export async function listPaymentsForDay(day: string): Promise<AdminPaymentRow[]> {
  const { start, end } = dayRange(day);
  const orders = await db
    .select()
    .from(paymentOrders)
    .where(
      and(CARD_PAYMENTS, gte(paymentOrders.createdAt, start), lt(paymentOrders.createdAt, end)),
    )
    .orderBy(desc(paymentOrders.createdAt));
  if (orders.length === 0) return [];
  const ids = orders.map((order) => order.id);
  const [items, refunds, receipts] = await Promise.all([
    db.select().from(paymentItems).where(inArray(paymentItems.paymentOrderId, ids)),
    db.select().from(paymentRefunds).where(inArray(paymentRefunds.paymentOrderId, ids)),
    db.select().from(fiscalReceipts).where(inArray(fiscalReceipts.paymentOrderId, ids)),
  ]);
  return orders.map((order) => {
    const lines = items.filter((item) => item.paymentOrderId === order.id);
    return {
      id: order.id,
      paidAt: order.paidAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      channel: order.channel,
      standId: order.standId,
      provider: order.provider,
      status: order.status,
      amountCents: order.amountCents,
      refundedCents: lines.reduce((sum, line) => sum + line.refundedCents, 0),
      failureReason: order.failureReason,
      providerTransactionId: order.providerTransactionId,
      receipt: receipts
        .filter((receipt) => receipt.paymentOrderId === order.id)
        .map((receipt) => ({
          kind: receipt.kind,
          status: receipt.status,
          delivery: receipt.delivery,
        })),
      items: lines.map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity,
        amountCents: line.amountCents,
        refundedCents: line.refundedCents,
      })),
      refunds: refunds
        .filter((refund) => refund.paymentOrderId === order.id)
        .map((refund) => ({
          amountCents: refund.amountCents,
          status: refund.status,
          reason: refund.reason,
          createdBy: refund.createdBy,
          failureReason: refund.failureReason,
          createdAt: refund.createdAt.toISOString(),
        })),
    };
  });
}

export interface ReconciliationIssue {
  kind:
    | 'missing-at-viva'
    | 'amount-mismatch'
    | 'unknown-at-viva'
    | 'refund-missing-at-viva'
    | 'refund-unknown-at-viva'
    | 'receipt-missing'
    | 'receipt-not-registered'
    | 'return-receipt-missing';
  paymentOrderId: string | null;
  detail: string;
}

export interface Reconciliation {
  day: string;
  ours: { salesCents: number; refundsCents: number; count: number };
  viva: { salesCents: number; refundsCents: number; count: number } | null;
  receipts: { salesCents: number; returnsCents: number; count: number };
  issues: ReconciliationIssue[];
  vivaError: string | null;
}

function euro(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

/** Compares one day: our paid payments and succeeded refunds against Viva's
 * transactions (only payments taken on a real Viva terminal) and against the
 * eKasa receipts issued for them. */
export async function reconcileDay(day: string): Promise<Reconciliation> {
  const { start, end } = dayRange(day);
  const issues: ReconciliationIssue[] = [];

  const paid = await db
    .select()
    .from(paymentOrders)
    .where(
      and(
        CARD_PAYMENTS,
        inArray(paymentOrders.status, PAID_STATUSES),
        gte(paymentOrders.paidAt, start),
        lt(paymentOrders.paidAt, end),
      ),
    );
  const refunds = await db
    .select()
    .from(paymentRefunds)
    .where(
      and(
        eq(paymentRefunds.status, 'succeeded'),
        isNotNull(paymentRefunds.completedAt),
        gte(paymentRefunds.completedAt, start),
        lt(paymentRefunds.completedAt, end),
      ),
    );
  const receiptRows = await db
    .select()
    .from(fiscalReceipts)
    .where(
      inArray(fiscalReceipts.paymentOrderId, [
        ...new Set([...paid.map((order) => order.id), ...refunds.map((r) => r.paymentOrderId)]),
        '00000000-0000-0000-0000-000000000000',
      ]),
    );

  // A refund may belong to a payment from an earlier day — its channel and
  // provider are the payment's.
  const refundOrders = refunds.length
    ? await db
        .select({
          id: paymentOrders.id,
          provider: paymentOrders.provider,
          channel: paymentOrders.channel,
        })
        .from(paymentOrders)
        .where(inArray(paymentOrders.id, [...new Set(refunds.map((r) => r.paymentOrderId))]))
    : [];
  const orderOf = new Map(refundOrders.map((order) => [order.id, order]));

  // eKasa (kiosk sales only — online payments carry no receipts): every paid
  // sale has a registered sale receipt, every refund a return receipt.
  for (const order of paid.filter((o) => o.channel === 'kiosk-terminal')) {
    const sale = receiptRows.find((r) => r.paymentOrderId === order.id && r.kind === 'sale');
    if (!sale) {
      issues.push({
        kind: 'receipt-missing',
        paymentOrderId: order.id,
        detail: `Оплата ${euro(order.amountCents)} без чека eKasa`,
      });
    } else if (!REGISTERED.includes(sale.status)) {
      issues.push({
        kind: 'receipt-not-registered',
        paymentOrderId: order.id,
        detail: `Чек eKasa на ${euro(order.amountCents)} не выдан (${sale.status})`,
      });
    }
  }
  for (const refund of refunds.filter(
    (r) => orderOf.get(r.paymentOrderId)?.channel === 'kiosk-terminal',
  )) {
    const ret = receiptRows.find((r) => r.refundId === refund.id && r.kind === 'return');
    if (!ret || !REGISTERED.includes(ret.status)) {
      issues.push({
        kind: 'return-receipt-missing',
        paymentOrderId: refund.paymentOrderId,
        detail: `Возврат ${euro(refund.amountCents)} без выданного чека возврата${ret ? ` (${ret.status})` : ''}`,
      });
    }
  }

  // Viva: Viva dates transactions in its own time zone, so the neighbouring
  // days are fetched too and filtered to the pavilion's day.
  let viva: Reconciliation['viva'] = null;
  let vivaError: string | null = null;
  const vivaPaid = paid.filter((order) => order.provider === 'viva');
  const vivaOrderIds = new Set(
    refundOrders.filter((order) => order.provider === 'viva').map((order) => order.id),
  );
  const vivaRefunds = refunds.filter((refund) => vivaOrderIds.has(refund.paymentOrderId));
  try {
    const neighbours = [-1, 0, 1].map((delta) => {
      const date = new Date(`${day}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + delta);
      return date.toISOString().slice(0, 10);
    });
    const lists = await Promise.all(neighbours.map((date) => listVivaTransactions(date)));
    if (lists.every((list) => list !== null)) {
      const all = new Map<string, VivaTransaction>();
      for (const list of lists) for (const t of list!) all.set(t.transactionId, t);
      const onDay = [...all.values()].filter((t) => t.createdAt >= start && t.createdAt < end);
      const sales = onDay.filter((t) => t.amountCents > 0 && t.statusId !== 'E');
      const vivaRefundTxs = onDay.filter((t) => t.amountCents < 0 && t.statusId !== 'E');
      viva = {
        salesCents: sales.reduce((sum, t) => sum + t.amountCents, 0),
        refundsCents: -vivaRefundTxs.reduce((sum, t) => sum + t.amountCents, 0),
        count: sales.length,
      };
      for (const order of vivaPaid) {
        const t = order.providerTransactionId ? all.get(order.providerTransactionId) : undefined;
        if (!t) {
          issues.push({
            kind: 'missing-at-viva',
            paymentOrderId: order.id,
            detail: `У нас оплата ${euro(order.amountCents)}, а у Viva такой транзакции нет`,
          });
        } else if (t.amountCents !== order.amountCents) {
          issues.push({
            kind: 'amount-mismatch',
            paymentOrderId: order.id,
            detail: `У нас ${euro(order.amountCents)}, у Viva ${euro(t.amountCents)}`,
          });
        }
      }
      const ourTransactionIds = new Set(paid.map((order) => order.providerTransactionId));
      for (const t of sales) {
        if (!ourTransactionIds.has(t.transactionId)) {
          issues.push({
            kind: 'unknown-at-viva',
            paymentOrderId: t.merchantReference,
            detail: `Viva списала ${euro(t.amountCents)} (транзакция ${t.transactionId}), а оплаченного платежа у нас нет — клиент мог заплатить и ничего не получить`,
          });
        }
      }
      const ourRefundIds = new Set(refunds.map((refund) => refund.providerRefundId));
      for (const refund of vivaRefunds) {
        if (!refund.providerRefundId || !all.has(refund.providerRefundId)) {
          issues.push({
            kind: 'refund-missing-at-viva',
            paymentOrderId: refund.paymentOrderId,
            detail: `Возврат ${euro(refund.amountCents)} есть у нас, но не найден у Viva`,
          });
        }
      }
      for (const t of vivaRefundTxs) {
        if (!ourRefundIds.has(t.transactionId)) {
          issues.push({
            kind: 'refund-unknown-at-viva',
            paymentOrderId: null,
            detail: `Viva вернула ${euro(-t.amountCents)} (транзакция ${t.transactionId}), у нас этого возврата нет — сделан в дашборде Viva?`,
          });
        }
      }
    }
  } catch (err) {
    vivaError = err instanceof Error ? err.message : String(err);
  }

  const saleReceipts = receiptRows.filter(
    (r) =>
      r.kind === 'sale' &&
      REGISTERED.includes(r.status) &&
      paid.some((order) => order.id === r.paymentOrderId),
  );
  const returnReceipts = receiptRows.filter(
    (r) =>
      r.kind === 'return' &&
      REGISTERED.includes(r.status) &&
      refunds.some((refund) => refund.id === r.refundId),
  );
  const totalOf = (rows: typeof receiptRows) =>
    rows.reduce(
      (sum, r) => sum + Math.abs((JSON.parse(r.document) as { totalCents: number }).totalCents),
      0,
    );
  return {
    day,
    ours: {
      salesCents: paid.reduce((sum, order) => sum + order.amountCents, 0),
      refundsCents: refunds.reduce((sum, refund) => sum + refund.amountCents, 0),
      count: paid.length,
    },
    viva,
    receipts: {
      salesCents: totalOf(saleReceipts),
      returnsCents: totalOf(returnReceipts),
      count: saleReceipts.length,
    },
    issues,
    vivaError,
  };
}

const NIGHTLY_HOUR = 3;
let lastNightlyDay: string | null = null;

/** Called every few minutes (server/index.ts): once a day after 03:00 in the
 * pavilion, reconciles the day before and alerts on any mismatch — once per
 * day, also across restarts (an existing alert for the day is respected). */
export async function runNightlyReconciliation(): Promise<void> {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE,
      hour: '2-digit',
      hour12: false,
    }).format(new Date()),
  );
  const yesterday = pavilionDay(-1);
  if (hour < NIGHTLY_HOUR || lastNightlyDay === yesterday) return;
  lastNightlyDay = yesterday;
  const result = await reconcileDay(yesterday);
  if (result.issues.length === 0 && !result.vivaError) return;
  const [already] = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(
      and(
        eq(incidents.code, 'payment.reconciliation-mismatch'),
        like(incidents.context, `%"day":"${yesterday}"%`),
      ),
    )
    .limit(1);
  if (already) return;
  void reportIncident({
    source: 'payment-terminal',
    code: 'payment.reconciliation-mismatch',
    severity: 'critical',
    message: result.vivaError
      ? `Reconciliation for ${yesterday} could not reach Viva (${result.vivaError}) — check it in the admin panel.`
      : `Reconciliation for ${yesterday} found ${result.issues.length} mismatch(es): ${result.issues
          .slice(0, 3)
          .map((issue) => issue.detail)
          .join('; ')} — see Payments in the admin panel.`,
    context: { day: yesterday, issues: result.issues.length },
  });
}
