import { useState } from 'react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { CartPanel } from '../../components/CartPanel/CartPanel';
import { Button } from '../../components/Button/Button';
import { Modal } from '../../components/Modal/Modal';
import type { PrintOrder } from '../../types/kiosk';
import styles from './PaymentStatusScreen.module.css';

// Payment Status screen — see docs/domain/kiosk-session.md ("Payment
// Order", End Session "Blocked during a committed transaction"). Full-screen
// (not a popup), since the user has committed to paying — distinct from
// Cart, which stays a popup while browsing/adding documents.
//
// navigation-back, navigation-home, and the explicit "Cancel payment" action
// are three different-looking triggers that unify into the same confirmed
// action (docs/domain/kiosk-session.md): all three ask "Are you sure you
// want to cancel this order?" before doing anything. Declining leaves this
// screen untouched. Back and the explicit Cancel both return to Upload
// Method Selection (cart items are untouched throughout — since payment
// only actually clears them on success, "reverting to awaiting payment" is
// a no-op here); Home returns to Welcome, per the universal Home rule.
//
// Prototype simplification: only the successful payment outcome is
// simulated (a single button) — failure handling is deferred further.
// end-session is hidden throughout (sessionActive=false): the transaction
// is committed from the moment this screen is reached.
interface PaymentStatusScreenProps {
  cartItems: PrintOrder[];
  onPaymentSuccess: () => void;
  onCancelPayment: () => void;
  onReturnHome: () => void;
  onEndSession: () => void;
  onProceedToPayment: () => void;
}

type PendingAction = 'back' | 'home' | 'cancel' | null;

export function PaymentStatusScreen({
  cartItems,
  onPaymentSuccess,
  onCancelPayment,
  onReturnHome,
  onEndSession,
  onProceedToPayment,
}: PaymentStatusScreenProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  function handleConfirmCancel() {
    if (pendingAction === 'home') {
      onReturnHome();
    } else {
      onCancelPayment();
    }
    setPendingAction(null);
  }

  return (
    <KioskScreenLayout
      sessionActive={false}
      onBack={() => setPendingAction('back')}
      onHome={() => setPendingAction('home')}
      onEndSession={onEndSession}
      cartItems={cartItems}
      onProceedToPayment={onProceedToPayment}
    >
      <div className={styles.body}>
        <CartPanel items={cartItems} />
        <Button
          id="payment-simulate-success"
          label="Simulate payment success"
          onClick={onPaymentSuccess}
        />
        <Button
          id="payment-cancel"
          label="Cancel payment"
          onClick={() => setPendingAction('cancel')}
        />
      </div>

      {pendingAction && (
        <Modal onClose={() => setPendingAction(null)}>
          <p>Are you sure you want to cancel this order?</p>
          <Button id="payment-cancel-confirm" label="Confirm" onClick={handleConfirmCancel} />
        </Modal>
      )}
    </KioskScreenLayout>
  );
}
