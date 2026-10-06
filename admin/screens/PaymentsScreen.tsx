import { useCallback, useEffect, useState } from 'react';
import {
  getReconciliation,
  listPayments,
  refundPaymentItems,
  type AdminPayment,
  type Reconciliation,
  type StaffRefundResult,
} from '../services/adminApi';
import type { AdminSession } from '../adminSession';

interface PaymentsScreenProps {
  session: AdminSession;
}

const STATUS_LABEL: Record<string, string> = {
  'awaiting-card': 'Ждёт карту',
  'awaiting-payment': 'Ждёт оплату',
  unknown: 'Выясняется',
  paid: 'Оплачено',
  'partially-refunded': 'Частично возвращено',
  refunded: 'Возвращено',
  declined: 'Отказ банка',
  cancelled: 'Отменено',
  'timed-out': 'Время вышло',
  failed: 'Ошибка',
};

// Same small colored labels as the other admin screens (admin.css's .sev-*).
const STATUS_SEV: Record<string, string> = {
  'awaiting-card': 'info',
  'awaiting-payment': 'info',
  unknown: 'warning',
  paid: 'ok',
  'partially-refunded': 'warning',
  refunded: 'neutral',
  declined: 'neutral',
  cancelled: 'neutral',
  'timed-out': 'neutral',
  failed: 'critical',
};

const RECEIPT_LABEL: Record<string, string> = {
  pending: 'ждёт регистрации',
  registered: 'выдан',
  'registered-offline': 'выдан офлайн',
  failed: 'ошибка',
};

const DELIVERY_LABEL: Record<string, string> = { qr: 'QR', email: 'e-mail', paper: 'бумага' };

function euro(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava' }).format(new Date());
}

// Payments screen — kiosk card payments by day, with the daily
// reconciliation (our records ↔ Viva ↔ eKasa receipts) on top and a manual
// refund per payment (docs/payments-business-requirements.md, "Staff and
// admin panel"). The refund button is senior-only (confirmed 2026-10-06);
// operators see the same data without it. Not part of the original
// docs/screens/admin-panel-spec.md mockup, which predates real payments.
export function PaymentsScreen({ session }: PaymentsScreenProps) {
  const [day, setDay] = useState(today);
  const [payments, setPayments] = useState<AdminPayment[] | null>(null);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<AdminPayment | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [refundResults, setRefundResults] = useState<StaffRefundResult[] | null>(null);
  const isSenior = session.role === 'senior';

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      listPayments(session.sessionToken, day),
      getReconciliation(session.sessionToken, day),
    ])
      .then(([list, rec]) => {
        setPayments(list.payments);
        setReconciliation(rec);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [session.sessionToken, day]);

  useEffect(() => {
    setPayments(null);
    setReconciliation(null);
    load();
  }, [load]);

  function openRefund(payment: AdminPayment) {
    setRefundTarget(payment);
    setRefundResults(null);
    setSelectedItems(
      new Set(payment.items.filter((item) => item.refundedCents === 0).map((item) => item.id)),
    );
  }

  async function confirmRefund() {
    if (!refundTarget || selectedItems.size === 0) return;
    setSubmitting(true);
    try {
      const { results } = await refundPaymentItems(session.sessionToken, refundTarget.id, [
        ...selectedItems,
      ]);
      setRefundResults(results);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refund failed');
      setRefundTarget(null);
    } finally {
      setSubmitting(false);
    }
  }

  const refundable = (payment: AdminPayment) =>
    (payment.status === 'paid' || payment.status === 'partially-refunded') &&
    payment.items.some((item) => item.refundedCents === 0);
  const selectedTotal =
    refundTarget?.items
      .filter((item) => selectedItems.has(item.id))
      .reduce((sum, item) => sum + item.amountCents, 0) ?? 0;

  return (
    <section className="view" id="view-payments">
      <div className="view-header">
        <div>
          <h1 className="view-title">Оплаты</h1>
          <p className="view-sub">
            Оплаты картой на стойках и онлайн (портал, магазин), сверка с Viva и чеками eKasa
          </p>
        </div>
        <label className="payments-day">
          День{' '}
          <input
            type="date"
            id="payments-day"
            value={day}
            max={today()}
            onChange={(event) => event.target.value && setDay(event.target.value)}
          />
        </label>
      </div>

      {error && <p className="login-error">{error}</p>}

      {reconciliation && (
        <div className="reconciliation" id="payments-reconciliation">
          <div className="reconciliation-totals">
            <div>
              <span className="equip-metric">У нас</span>
              <b>{euro(reconciliation.ours.salesCents)}</b>
              <span className="equip-metric">
                {reconciliation.ours.count} опл. · возвраты {euro(reconciliation.ours.refundsCents)}
              </span>
            </div>
            <div>
              <span className="equip-metric">Viva</span>
              {reconciliation.viva ? (
                <>
                  <b>{euro(reconciliation.viva.salesCents)}</b>
                  <span className="equip-metric">
                    {reconciliation.viva.count} опл. · возвраты{' '}
                    {euro(reconciliation.viva.refundsCents)}
                  </span>
                </>
              ) : (
                <span className="equip-metric">
                  {reconciliation.vivaError
                    ? `ошибка: ${reconciliation.vivaError}`
                    : 'не подключена'}
                </span>
              )}
            </div>
            <div>
              <span className="equip-metric">Чеки eKasa</span>
              <b>{euro(reconciliation.receipts.salesCents)}</b>
              <span className="equip-metric">
                {reconciliation.receipts.count} чек. · возвраты{' '}
                {euro(reconciliation.receipts.returnsCents)}
              </span>
            </div>
            <span
              className={`sev sev-${reconciliation.issues.length > 0 || reconciliation.vivaError ? 'critical' : 'ok'}`}
              id="payments-reconciliation-status"
            >
              {reconciliation.issues.length > 0
                ? `Расхождений: ${reconciliation.issues.length}`
                : reconciliation.vivaError
                  ? 'Viva недоступна'
                  : 'Всё сходится'}
            </span>
          </div>
          {reconciliation.issues.length > 0 && (
            <ul className="reconciliation-issues">
              {reconciliation.issues.map((issue, index) => (
                <li key={index}>
                  {issue.detail}
                  {issue.paymentOrderId && (
                    <span className="equip-metric"> · {issue.paymentOrderId.slice(0, 8)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <table className="alerts-table" id="payments-list">
        <thead>
          <tr>
            <th>Время</th>
            <th>Где</th>
            <th>Сумма</th>
            <th>Статус</th>
            <th>Чек</th>
            <th>Терминал</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {payments === null ? (
            <tr>
              <td colSpan={7} className="empty-note">
                Загрузка…
              </td>
            </tr>
          ) : payments.length === 0 ? (
            <tr>
              <td colSpan={7} className="empty-note">
                За этот день оплат нет
              </td>
            </tr>
          ) : (
            payments.flatMap((payment) => {
              const sale = payment.receipt.find((receipt) => receipt.kind === 'sale');
              const rows = [
                <tr key={payment.id} id={`payment-${payment.id}`}>
                  <td>{formatTime(payment.paidAt ?? payment.createdAt)}</td>
                  <td>
                    {payment.channel === 'online-checkout' ? 'Онлайн' : (payment.standId ?? '—')}
                  </td>
                  <td className="payments-amount">
                    {euro(payment.amountCents)}
                    {payment.refundedCents > 0 && (
                      <span className="equip-metric"> · −{euro(payment.refundedCents)}</span>
                    )}
                  </td>
                  <td>
                    <span className={`sev sev-${STATUS_SEV[payment.status] ?? 'neutral'}`}>
                      {STATUS_LABEL[payment.status] ?? payment.status}
                    </span>
                  </td>
                  <td>
                    {sale
                      ? `${DELIVERY_LABEL[sale.delivery] ?? sale.delivery}, ${RECEIPT_LABEL[sale.status] ?? sale.status}`
                      : '—'}
                  </td>
                  <td className="equip-metric">
                    {payment.provider === 'simulator' ? 'симулятор' : (payment.provider ?? '—')}
                  </td>
                  <td className="payments-actions">
                    <button
                      type="button"
                      className="btn"
                      id={`payment-details-${payment.id}`}
                      onClick={() => setExpanded(expanded === payment.id ? null : payment.id)}
                    >
                      {expanded === payment.id ? 'Скрыть' : 'Подробнее'}
                    </button>
                    {isSenior && refundable(payment) && (
                      <button
                        type="button"
                        className="btn"
                        id={`payment-refund-${payment.id}`}
                        onClick={() => openRefund(payment)}
                      >
                        Вернуть деньги
                      </button>
                    )}
                  </td>
                </tr>,
              ];
              if (expanded === payment.id) {
                rows.push(
                  <tr key={`${payment.id}-details`} className="payments-details">
                    <td colSpan={7}>
                      <ul>
                        {payment.items.map((item) => (
                          <li key={item.id}>
                            {item.description} × {item.quantity} — {euro(item.amountCents)}
                            {item.refundedCents > 0 && ' (возвращено)'}
                          </li>
                        ))}
                      </ul>
                      {payment.refunds.length > 0 && (
                        <ul>
                          {payment.refunds.map((refund, index) => (
                            <li key={index}>
                              Возврат {euro(refund.amountCents)} ·{' '}
                              {refund.reason === 'staff' ? 'вручную' : 'сбой печати'} ·{' '}
                              {refund.status === 'succeeded'
                                ? 'прошёл'
                                : refund.status === 'failed'
                                  ? `не прошёл (${refund.failureReason})`
                                  : 'в процессе'}{' '}
                              · {formatTime(refund.createdAt)}
                            </li>
                          ))}
                        </ul>
                      )}
                      <span className="equip-metric">
                        Платёж {payment.id}
                        {payment.providerTransactionId &&
                          ` · транзакция Viva ${payment.providerTransactionId}`}
                        {payment.failureReason && ` · ${payment.failureReason}`}
                      </span>
                    </td>
                  </tr>,
                );
              }
              return rows;
            })
          )}
        </tbody>
      </table>

      {refundTarget && (
        <div className="modal-overlay">
          <div className="modal-card" id="payment-refund-modal" role="dialog" aria-modal>
            <h2>Вернуть деньги клиенту</h2>
            {refundResults ? (
              <>
                <ul className="refund-results">
                  {refundResults.map((result) => (
                    <li key={result.paymentItemId}>
                      {result.status === 'succeeded'
                        ? `Возвращено ${euro(result.amountCents)}`
                        : result.status === 'failed'
                          ? `Не прошёл: ${result.reason}`
                          : 'Уже возвращено ранее'}
                    </li>
                  ))}
                </ul>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    id="payment-refund-close"
                    onClick={() => setRefundTarget(null)}
                  >
                    Закрыть
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="session-warning">
                  {refundTarget.channel === 'online-checkout'
                    ? 'Деньги вернутся на карту клиента. Возвращённый заказ печати больше нельзя будет напечатать на киоске, заказ магазина закроется. Отменить возврат нельзя.'
                    : 'Деньги вернутся на карту клиента, будет выдан чек возврата. Отменить возврат нельзя.'}
                </p>
                <ul className="refund-items">
                  {refundTarget.items.map((item) => (
                    <li key={item.id}>
                      <label>
                        <input
                          type="checkbox"
                          id={`payment-refund-item-${item.id}`}
                          disabled={item.refundedCents > 0}
                          checked={selectedItems.has(item.id)}
                          onChange={(event) =>
                            setSelectedItems((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(item.id);
                              else next.delete(item.id);
                              return next;
                            })
                          }
                        />{' '}
                        {item.description} × {item.quantity} — {euro(item.amountCents)}
                        {item.refundedCents > 0 && ' (уже возвращено)'}
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn"
                    id="payment-refund-cancel"
                    onClick={() => setRefundTarget(null)}
                    disabled={submitting}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    id="payment-refund-submit"
                    onClick={confirmRefund}
                    disabled={submitting || selectedItems.size === 0}
                  >
                    {submitting ? 'Выполняется…' : `Вернуть ${euro(selectedTotal)}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
