import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  FileText,
  LoaderCircle,
  Mail,
  Nfc,
  QrCode,
  ReceiptText,
  RotateCcw,
} from 'lucide-react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { Modal } from '../../components/Modal/Modal';
import { OrderSteps } from '../../components/OrderSteps/OrderSteps';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder } from '../../types/kiosk';
import {
  cancelPayment,
  chooseReceipt,
  createPayment,
  getPayment,
  simulatePayment,
  type Payment,
  type ReceiptDelivery,
  type SimulatedPaymentOutcome,
} from '../../services/paymentApi';
import { getStandId } from '../../utils/standId';
import { computeItemPrice, formatEuroCents } from '../../utils/pricing';
import { MIN_CARD_PAYMENT_CENTS } from '../../utils/tariff';
import styles from './PaymentStatusScreen.module.css';

// Payment Status screen — see docs/domain/kiosk-session.md ("Payment
// Order", End Session "Blocked during a committed transaction") and
// docs/payments-business-requirements.md ("Kiosk: the customer's journey").
// Step 4 of the print path (2026-10 redesign, docs/design/kiosk-redesign-plan.md):
// what to do now on the left — tap the card, try again, pick the receipt —
// and the order with the amount the terminal charges on the right.
//
// The server prices the selection and starts the sale on this stand's
// terminal (src/services/paymentApi.ts); this screen shows the server's
// total, counts down the 60-second window and polls for the outcome.
// Declined / cancelled on the terminal / timed out / failed: nothing was
// charged, "Try again" starts a new payment for the same items. Paid: the
// customer picks how to get the receipt (QR code is the default after 30 s,
// so nobody is held up), then printing starts.
//
// navigation-back, navigation-home, and the explicit "Cancel payment" action
// unify into the same confirmed action (docs/domain/kiosk-session.md): all
// three ask "Are you sure you want to cancel this order?" first. While the
// terminal waits for a card, confirming aborts the sale — and if the card
// was accepted a moment earlier the payment stands and the receipt step
// follows instead. Once paid, Back/Home disappear: the transaction is done.
//
// end-session and the inactivity timeout stay suspended while a payment is
// open or paid; once an attempt has ended unpaid nothing is committed any
// more, so they come back (a customer who walks away from a declined card
// doesn't leave the stand stuck).

const OPEN_STATUSES: Payment['status'][] = ['awaiting-card', 'unknown'];
const UNPAID_FINAL: Payment['status'][] = ['declined', 'cancelled', 'timed-out', 'failed'];
const POLL_INTERVAL_MS = 1500;
const RECEIPT_DEFAULT_AFTER_MS = 30_000;
// The terminal's window for a card (server/paymentStore.ts, PAYMENT_WINDOW_MS) — the
// countdown bar's full length.
const PAYMENT_WINDOW_SECONDS = 60;

interface PaymentStatusScreenProps {
  /** The batch the user chose to pay for (ticked on the order review screen) —
   * shown here read-only, since it's already committed and shouldn't be
   * re-editable mid-payment. */
  paymentItems: PrintOrder[];
  sessionId: string | null;
  /** The whole Cart, unpaid items included — the footer's count and the
   * End Session rule. */
  cartItems: PrintOrder[];
  /** Called once paid (and the receipt chosen) with the batch, each item now
   * carrying its server `paymentItemId` — or straight away with the batch
   * unchanged when the server says nothing needs paying. */
  onPaymentSuccess: (paidItems: PrintOrder[], paymentId: string | null) => void;
  onCancelPayment: () => void;
  onReturnHome: () => void;
  onEndSession: (reason: EndSessionReason) => void;
  /** While true, starting/simulating a payment is disabled — payment is one
   * of the two actions connection loss actually blocks
   * (docs/domain/kiosk-session.md, "Failure and recovery"). */
  isConnectionLost: boolean;
  onSimulateConnectionLost: () => void;
  onSimulateConnectionRestored: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  accountId: string | null;
  /** Navigates to the Personal Account screen (docs/personal-account-requirements.md)
   * — used by the footer's btn-account. */
  onGoToPersonalAccount: () => void;
  hasPendingPaidOrders: boolean;
  onDismissPaidOrdersPrompt: () => void;
  onGoToPaidOrders: () => void;
  onLanguageChange: (language: Language) => void;
}

type PendingAction = 'back' | 'home' | 'cancel' | null;

export function PaymentStatusScreen({
  paymentItems,
  sessionId,
  cartItems,
  onPaymentSuccess,
  onCancelPayment,
  onReturnHome,
  onEndSession,
  isConnectionLost,
  onSimulateConnectionLost,
  onSimulateConnectionRestored,
  onLogin,
  accountId,
  onGoToPersonalAccount,
  hasPendingPaidOrders,
  onDismissPaidOrdersPrompt,
  onGoToPaidOrders,
  onLanguageChange,
}: PaymentStatusScreenProps) {
  const t = useTranslation();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [attempt, setAttempt] = useState(0);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [startFailed, setStartFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [receiptMode, setReceiptMode] = useState<'choose' | 'email'>('choose');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [finished, setFinished] = useState(false);

  // Latest callbacks/items without re-running the effects below — a payment
  // must be started exactly once per attempt (StrictMode's double effect
  // run included), so `startedAttempt` guards it.
  const latest = useRef({ paymentItems, sessionId, onPaymentSuccess });
  useEffect(() => {
    latest.current = { paymentItems, sessionId, onPaymentSuccess };
  });
  const startedAttempt = useRef(-1);

  useEffect(() => {
    if (startedAttempt.current === attempt) return;
    startedAttempt.current = attempt;
    const { paymentItems: items, sessionId: session } = latest.current;
    createPayment(session, getStandId(), items)
      .then((created) => {
        if (created === null) {
          // Everything was paid in advance — nothing to charge.
          setFinished(true);
          latest.current.onPaymentSuccess(items, null);
        } else {
          setPayment(created);
        }
      })
      .catch(() => setStartFailed(true));
  }, [attempt]);

  const isOpen = payment !== null && OPEN_STATUSES.includes(payment.status);
  const isPaid = payment?.status === 'paid';
  const isUnpaidFinal = payment !== null && UNPAID_FINAL.includes(payment.status);

  // Polls the server (which asks the terminal) and ticks the countdown.
  useEffect(() => {
    if (!isOpen || !payment) return;
    const id = payment.id;
    const pollId = setInterval(() => {
      getPayment(id)
        .then(setPayment)
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    const tickId = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(pollId);
      clearInterval(tickId);
    };
  }, [isOpen, payment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function finish(paid: Payment) {
    if (finished) return;
    setFinished(true);
    const lineFor = new Map(paid.items.map((line) => [line.cartItemId, line.id]));
    latest.current.onPaymentSuccess(
      latest.current.paymentItems.map((item) => ({
        ...item,
        paymentItemId: lineFor.get(item.id),
      })),
      paid.id,
    );
  }

  function handleReceipt(via: ReceiptDelivery, address?: string) {
    if (!payment || finished) return;
    const paid = payment;
    // The receipt choice never holds the customer up: a failed request
    // still moves on to printing (the sale is registered either way).
    chooseReceipt(paid.id, via, address)
      .catch(() => paid)
      .then(() => finish(paid));
  }

  // QR code is the default if the customer doesn't choose
  // (docs/payments-business-requirements.md, "Receipts").
  useEffect(() => {
    if (!isPaid || finished) return;
    const id = setTimeout(() => handleReceipt('qr'), RECEIPT_DEFAULT_AFTER_MS);
    return () => clearTimeout(id);
  }); // re-armed each render on purpose: any interaction re-renders, restarting the wait

  function handleEmailSubmit() {
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setEmailError(true);
      return;
    }
    handleReceipt('email', address);
  }

  function handleTryAgain() {
    setPayment(null);
    setStartFailed(false);
    setAttempt((current) => current + 1);
  }

  async function handleSimulate(outcome: SimulatedPaymentOutcome) {
    if (!payment) return;
    try {
      setPayment(await simulatePayment(payment.id, outcome));
    } catch {
      // Already settled — the next poll shows the real state.
    }
  }

  async function handleConfirmCancel() {
    const action = pendingAction;
    setPendingAction(null);
    if (payment && isOpen) {
      // The terminal's answer decides: a card accepted just before the abort
      // means the payment stands.
      try {
        const result = await cancelPayment(payment.id);
        setPayment(result);
        if (result.status === 'paid') return;
      } catch {
        return;
      }
    }
    if (action === 'home') {
      onReturnHome();
    } else {
      onCancelPayment();
    }
  }

  const secondsLeft =
    payment?.expiresAt != null
      ? Math.max(0, Math.round((new Date(payment.expiresAt).getTime() - now) / 1000))
      : null;
  const unpaidMessage =
    payment?.status === 'declined'
      ? t.paymentStatus.declined
      : payment?.status === 'cancelled'
        ? t.paymentStatus.cancelled
        : payment?.status === 'timed-out'
          ? t.paymentStatus.timedOut
          : t.paymentStatus.failed;
  const isSimulator = payment?.provider === 'simulator';
  const canLeave = !isPaid;

  // The order as the server priced it once the payment exists (its lines
  // and total are what the terminal charges); our own prices until then.
  const lineFor = new Map(payment?.items.map((line) => [line.cartItemId, line]) ?? []);
  const lines = paymentItems.map((item) => ({
    item,
    cents: lineFor.get(item.id)?.amountCents ?? Math.round(computeItemPrice(item) * 100),
  }));
  const linesCents = lines.reduce((sum, line) => sum + line.cents, 0);
  const totalCents = payment?.amountCents ?? linesCents;
  // Viva's card minimum (src/utils/tariff.ts): the server tops a smaller
  // order up — said here so the higher amount isn't a surprise.
  const toppedUp = totalCents > linesCents;
  const progress = secondsLeft !== null ? Math.min(1, secondsLeft / PAYMENT_WINDOW_SECONDS) : 1;

  return (
    <KioskScreenLayout
      sessionActive={isUnpaidFinal || startFailed}
      onBack={canLeave ? () => setPendingAction('back') : undefined}
      onHome={canLeave ? () => setPendingAction('home') : undefined}
      onEndSession={onEndSession}
      cartItems={cartItems}
      isConnectionLost={isConnectionLost}
      onSimulateConnectionLost={onSimulateConnectionLost}
      onSimulateConnectionRestored={onSimulateConnectionRestored}
      onLogin={onLogin}
      accountId={accountId}
      onGoToPersonalAccount={onGoToPersonalAccount}
      hasPendingPaidOrders={hasPendingPaidOrders}
      onDismissPaidOrdersPrompt={onDismissPaidOrdersPrompt}
      onGoToPaidOrders={onGoToPaidOrders}
      onLanguageChange={onLanguageChange}
    >
      <div className={styles.top}>
        <h1 className={styles.title}>{t.paymentStatus.title}</h1>
        <OrderSteps current="payment" />
      </div>

      <div className={styles.columns}>
        <section className={styles.stage} id="payment-stage">
          {!payment && !startFailed && (
            <>
              <span className={`${styles.badge} ${styles.badgeNeutral}`} aria-hidden="true">
                <LoaderCircle className={styles.spin} size={64} />
              </span>
              <h2 className={styles.message}>{t.paymentStatus.starting}</h2>
            </>
          )}

          {isOpen && (
            <>
              <span className={`${styles.badge} ${styles.badgeAccent}`} aria-hidden="true">
                <span className={styles.pulse} />
                <Nfc size={72} strokeWidth={1.75} />
              </span>
              <h2 className={styles.message}>{t.paymentStatus.tapCard}</h2>
              <span className={styles.amount} id="payment-amount">
                {formatEuroCents(totalCents)}
              </span>
              {secondsLeft !== null && (
                <div className={styles.countdown}>
                  <span className={styles.countdownTrack}>
                    <span
                      className={styles.countdownFill}
                      style={{ transform: `scaleX(${progress})` }}
                    />
                  </span>
                  <span className={styles.countdownText}>
                    {t.paymentStatus.secondsLeft(secondsLeft)}
                  </span>
                </div>
              )}
            </>
          )}

          {(startFailed || isUnpaidFinal) && (
            <>
              <span className={`${styles.badge} ${styles.badgeWarning}`} aria-hidden="true">
                <CircleAlert size={72} strokeWidth={1.75} />
              </span>
              <h2 className={styles.message} role="status">
                {startFailed ? t.paymentStatus.startFailed : unpaidMessage}
              </h2>
              <Button
                id="payment-try-again"
                variant="primary"
                icon={<RotateCcw size={24} />}
                label={t.paymentStatus.tryAgain}
                onClick={handleTryAgain}
                disabled={isConnectionLost}
              />
            </>
          )}

          {isPaid && (
            <>
              <span className={`${styles.badge} ${styles.badgeSuccess}`} aria-hidden="true">
                <CircleCheck size={72} strokeWidth={1.75} />
              </span>
              <h2 className={styles.message}>{t.paymentStatus.paid}</h2>
              <p className={styles.question}>{t.paymentStatus.receiptQuestion}</p>
              {receiptMode === 'choose' ? (
                <div className={styles.receiptOptions}>
                  <ReceiptOption
                    id="payment-receipt-qr"
                    icon={<QrCode size={44} strokeWidth={1.75} />}
                    label={t.paymentStatus.receiptQr}
                    onClick={() => handleReceipt('qr')}
                    disabled={finished}
                  />
                  <ReceiptOption
                    id="payment-receipt-email"
                    icon={<Mail size={44} strokeWidth={1.75} />}
                    label={t.paymentStatus.receiptEmail}
                    onClick={() => setReceiptMode('email')}
                    disabled={finished}
                  />
                  <ReceiptOption
                    id="payment-receipt-paper"
                    icon={<ReceiptText size={44} strokeWidth={1.75} />}
                    label={t.paymentStatus.receiptPaper}
                    onClick={() => handleReceipt('paper')}
                    disabled={finished}
                  />
                </div>
              ) : (
                <div className={styles.emailForm}>
                  <label className={styles.emailField}>
                    {t.paymentStatus.emailLabel}
                    <input
                      id="payment-receipt-email-input"
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setEmailError(false);
                      }}
                    />
                  </label>
                  <Button
                    id="payment-receipt-email-send"
                    variant="primary"
                    label={t.paymentStatus.sendReceipt}
                    onClick={handleEmailSubmit}
                    disabled={finished}
                  />
                  <Button
                    id="payment-receipt-email-back"
                    variant="ghost"
                    icon={<ArrowLeft size={22} />}
                    label={t.common.back}
                    onClick={() => setReceiptMode('choose')}
                    disabled={finished}
                  />
                  {emailError && (
                    <p className={styles.problem} role="alert">
                      {t.paymentStatus.invalidEmail}
                    </p>
                  )}
                </div>
              )}
              <p className={styles.hint}>
                {t.paymentStatus.paidHint}. {t.paymentStatus.receiptDefault}.
              </p>
              <p className={styles.hint}>{t.paymentStatus.receiptConsent}</p>
            </>
          )}

          {canLeave && (payment !== null || startFailed) && (
            <Button
              id="payment-cancel"
              label={t.paymentStatus.cancelPayment}
              onClick={() => setPendingAction('cancel')}
            />
          )}

          {isOpen && isSimulator && (
            // The simulated terminal (server/paymentTerminal.ts) until the
            // Viva client lands — scaffolding, shown only for that provider.
            <div className={styles.simulate} data-dev-only>
              <span className={styles.simulateLabel}>test</span>
              <Button
                id="payment-simulate-success"
                variant="ghost"
                label="Simulate payment success"
                onClick={() => handleSimulate('paid')}
                disabled={isConnectionLost}
              />
              <Button
                id="payment-simulate-declined"
                variant="ghost"
                label="Simulate card declined"
                onClick={() => handleSimulate('declined')}
                disabled={isConnectionLost}
              />
              <Button
                id="payment-simulate-cancelled"
                variant="ghost"
                label="Simulate cancel on terminal"
                onClick={() => handleSimulate('cancelled-on-terminal')}
                disabled={isConnectionLost}
              />
            </div>
          )}
        </section>

        <aside className={styles.order}>
          <h2 className={styles.orderTitle}>{t.paymentStatus.orderTitle}</h2>
          <ul className={styles.orderList}>
            {lines.map(({ item, cents }) => (
              <li key={item.id} className={styles.orderLine}>
                <span className={styles.orderIcon} aria-hidden="true">
                  <FileText size={24} />
                </span>
                <span className={styles.orderText}>
                  <span className={styles.orderName}>{item.fileName}</span>
                  <span className={styles.orderMeta}>
                    {item.paperSize} ·{' '}
                    {item.color === 'color' ? t.common.colorColor : t.common.colorBw} ·{' '}
                    {t.cart.qty(item.quantity)}
                  </span>
                </span>
                <span className={styles.orderPrice}>{formatEuroCents(cents)}</span>
              </li>
            ))}
          </ul>
          <div className={styles.orderTotal}>
            <span>{t.paymentStatus.amountLabel}</span>
            <span className={styles.orderAmount}>{formatEuroCents(totalCents)}</span>
          </div>
          {toppedUp && (
            <p className={styles.hint} id="payment-minimum-charge">
              {t.cart.minimumCharge(formatEuroCents(MIN_CARD_PAYMENT_CENTS))}
            </p>
          )}
        </aside>
      </div>

      {pendingAction && (
        <Modal onClose={() => setPendingAction(null)}>
          <p className={styles.confirmText}>{t.paymentStatus.cancelConfirmMessage}</p>
          <Button
            id="payment-cancel-confirm"
            variant="primary"
            label={t.common.confirm}
            onClick={handleConfirmCancel}
          />
        </Modal>
      )}
    </KioskScreenLayout>
  );
}

function ReceiptOption({
  id,
  icon,
  label,
  onClick,
  disabled,
}: {
  id: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      id={id}
      className={styles.receiptOption}
      onClick={onClick}
      disabled={disabled}
    >
      <span className={styles.receiptIcon} aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  );
}
