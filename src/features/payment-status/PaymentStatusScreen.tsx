import { useEffect, useRef, useState } from 'react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { CartPanel } from '../../components/CartPanel/CartPanel';
import { Button } from '../../components/Button/Button';
import { Modal } from '../../components/Modal/Modal';
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
import { formatEuroCents } from '../../utils/pricing';
import styles from './PaymentStatusScreen.module.css';

// Payment Status screen — see docs/domain/kiosk-session.md ("Payment
// Order", End Session "Blocked during a committed transaction") and
// docs/payments-business-requirements.md ("Kiosk: the customer's journey").
// Full-screen (not a popup), since the user has committed to paying —
// distinct from Cart, which stays a popup while browsing/adding documents.
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

interface PaymentStatusScreenProps {
  /** The batch the user chose to pay for (checked in the Cart popup) —
   * shown here read-only, since it's already committed and shouldn't be
   * re-editable mid-payment. */
  paymentItems: PrintOrder[];
  sessionId: string | null;
  /** Whatever the user left unchecked/didn't select — still shown in this
   * screen's own Cart popup (btn-cart), fully editable there. */
  cartItems: PrintOrder[];
  onQuantityChange: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  /** Called once paid (and the receipt chosen) with the batch, each item now
   * carrying its server `paymentItemId` — or straight away with the batch
   * unchanged when the server says nothing needs paying. */
  onPaymentSuccess: (paidItems: PrintOrder[], paymentId: string | null) => void;
  onCancelPayment: () => void;
  onReturnHome: () => void;
  onEndSession: (reason: EndSessionReason) => void;
  onProceedToPayment: (selectedItems: PrintOrder[]) => void;
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
  onQuantityChange,
  onRemoveItem,
  onPaymentSuccess,
  onCancelPayment,
  onReturnHome,
  onEndSession,
  onProceedToPayment,
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

  return (
    <KioskScreenLayout
      sessionActive={isUnpaidFinal || startFailed}
      onBack={canLeave ? () => setPendingAction('back') : undefined}
      onHome={canLeave ? () => setPendingAction('home') : undefined}
      onEndSession={onEndSession}
      cartItems={cartItems}
      onQuantityChange={onQuantityChange}
      onRemoveItem={onRemoveItem}
      onProceedToPayment={onProceedToPayment}
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
      <div className={styles.body}>
        <CartPanel items={paymentItems} />

        {payment && (
          <p className={styles.amount}>
            {t.paymentStatus.toPay(formatEuroCents(payment.amountCents))}
          </p>
        )}

        {!payment && !startFailed && <p>{t.paymentStatus.starting}</p>}

        {startFailed && (
          <>
            <p className={styles.problem}>{t.paymentStatus.startFailed}</p>
            <Button
              id="payment-try-again"
              label={t.paymentStatus.tryAgain}
              onClick={handleTryAgain}
              disabled={isConnectionLost}
            />
          </>
        )}

        {isOpen && (
          <>
            <p className={styles.instruction}>{t.paymentStatus.tapCard}</p>
            {secondsLeft !== null && (
              <p className={styles.countdown}>{t.paymentStatus.secondsLeft(secondsLeft)}</p>
            )}
            {isSimulator && (
              <div className={styles.simulate}>
                <Button
                  id="payment-simulate-success"
                  label="Simulate payment success"
                  onClick={() => handleSimulate('paid')}
                  disabled={isConnectionLost}
                />
                <Button
                  id="payment-simulate-declined"
                  label="Simulate card declined"
                  onClick={() => handleSimulate('declined')}
                  disabled={isConnectionLost}
                />
                <Button
                  id="payment-simulate-cancelled"
                  label="Simulate cancel on terminal"
                  onClick={() => handleSimulate('cancelled-on-terminal')}
                  disabled={isConnectionLost}
                />
              </div>
            )}
          </>
        )}

        {isUnpaidFinal && (
          <>
            <p className={styles.problem}>{unpaidMessage}</p>
            <Button
              id="payment-try-again"
              label={t.paymentStatus.tryAgain}
              onClick={handleTryAgain}
              disabled={isConnectionLost}
            />
          </>
        )}

        {isPaid && (
          <>
            <p className={styles.success}>{t.paymentStatus.paid}</p>
            <p>{t.paymentStatus.receiptQuestion}</p>
            {receiptMode === 'choose' ? (
              <div className={styles.receiptOptions}>
                <Button
                  id="payment-receipt-qr"
                  label={t.paymentStatus.receiptQr}
                  onClick={() => handleReceipt('qr')}
                  disabled={finished}
                />
                <Button
                  id="payment-receipt-email"
                  label={t.paymentStatus.receiptEmail}
                  onClick={() => setReceiptMode('email')}
                  disabled={finished}
                />
                <Button
                  id="payment-receipt-paper"
                  label={t.paymentStatus.receiptPaper}
                  onClick={() => handleReceipt('paper')}
                  disabled={finished}
                />
              </div>
            ) : (
              <div className={styles.receiptOptions}>
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
                {emailError && <p className={styles.problem}>{t.paymentStatus.invalidEmail}</p>}
                <Button
                  id="payment-receipt-email-send"
                  label={t.paymentStatus.sendReceipt}
                  onClick={handleEmailSubmit}
                  disabled={finished}
                />
              </div>
            )}
            <p className={styles.hint}>{t.paymentStatus.receiptConsent}</p>
          </>
        )}

        {canLeave && (
          <Button
            id="payment-cancel"
            label={t.paymentStatus.cancelPayment}
            onClick={() => setPendingAction('cancel')}
          />
        )}
      </div>

      {pendingAction && (
        <Modal onClose={() => setPendingAction(null)}>
          <p>{t.paymentStatus.cancelConfirmMessage}</p>
          <Button
            id="payment-cancel-confirm"
            label={t.common.confirm}
            onClick={handleConfirmCancel}
          />
        </Modal>
      )}
    </KioskScreenLayout>
  );
}
