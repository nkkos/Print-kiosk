import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { PrintOrder } from '../../types/kiosk';
import styles from './PrintStatusScreen.module.css';

// Print Status screen — see docs/domain/kiosk-session.md: "Print Status has
// no Back action (or it is disabled) — this screen is fully
// system-controlled; the persistent footer ... remains accessible
// regardless." No navigation-back/navigation-home here at all, and
// end-session stays hidden (sessionActive=false) — the transaction is still
// committed until the order is delivered.
//
// Prototype simplification: only the successful outcome is simulated (a
// single button) — failure handling is deferred to the polish step.
interface PrintStatusScreenProps {
  cartItems: PrintOrder[];
  onQuantityChange: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onPrintComplete: () => void;
  onEndSession: () => void;
  onProceedToPayment: (selectedItems: PrintOrder[]) => void;
  /** While true, "Simulate print complete" is disabled — printing is one of
   * the two actions connection loss actually blocks (docs/domain/kiosk-session.md,
   * "Failure and recovery"). */
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

export function PrintStatusScreen({
  cartItems,
  onQuantityChange,
  onRemoveItem,
  onPrintComplete,
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
}: PrintStatusScreenProps) {
  const t = useTranslation();
  return (
    <KioskScreenLayout
      sessionActive={false}
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
        <p className={styles.message}>{t.printStatus.printingMessage}</p>
        <Button
          id="print-simulate-complete"
          label="Simulate print complete"
          onClick={onPrintComplete}
          disabled={isConnectionLost}
        />
      </div>
    </KioskScreenLayout>
  );
}
