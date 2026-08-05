import { useState } from 'react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { CartPanel } from '../../components/CartPanel/CartPanel';
import { Button } from '../../components/Button/Button';
import { Modal } from '../../components/Modal/Modal';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
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
// Method Selection; Home returns to Welcome, per the universal Home rule.
// Either way, `paymentItems` were only ever a snapshot of the checked Cart
// items (docs/cart-requirements.md) — cancelling never touched `cart`, so
// there's nothing to restore.
//
// Prototype simplification: only the successful payment outcome is
// simulated (a single button) — failure handling is deferred further.
// end-session is hidden throughout (sessionActive=false): the transaction
// is committed from the moment this screen is reached.
interface PaymentStatusScreenProps {
  /** The batch the user chose to pay for (checked in the Cart popup) —
   * shown here read-only, since it's already committed and shouldn't be
   * re-editable mid-payment. */
  paymentItems: PrintOrder[];
  /** Whatever the user left unchecked/didn't select — still shown in this
   * screen's own Cart popup (btn-cart), fully editable there. */
  cartItems: PrintOrder[];
  onQuantityChange: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onPaymentSuccess: () => void;
  onCancelPayment: () => void;
  onReturnHome: () => void;
  onEndSession: () => void;
  onProceedToPayment: (selectedItems: PrintOrder[]) => void;
  /** While true, "Simulate payment success" is disabled — payment is one of
   * the two actions connection loss actually blocks (docs/domain/kiosk-session.md,
   * "Failure and recovery"). */
  isConnectionLost: boolean;
  onSimulateConnectionLost: () => void;
  onSimulateConnectionRestored: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
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
        <Button
          id="payment-simulate-success"
          label="Simulate payment success"
          onClick={onPaymentSuccess}
          disabled={isConnectionLost}
        />
        <Button
          id="payment-cancel"
          label={t.paymentStatus.cancelPayment}
          onClick={() => setPendingAction('cancel')}
        />
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
