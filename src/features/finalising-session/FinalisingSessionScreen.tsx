import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { PrintOrder } from '../../types/kiosk';
import styles from './FinalisingSessionScreen.module.css';

// Finalising Session screen — see docs/domain/kiosk-session.md:
// "Finalising session's Back action leads to the Welcome Screen — the same
// destination as Home — in case the user wants to print something else."
// Unlike Payment/Print Status, the order has now been delivered, so
// end-session is available again (sessionActive defaults to true) and
// navigation-back/navigation-home both simply return to Welcome *without*
// ending the session (the user may still want to start another service) —
// ending it remains a separate, explicit end-session action.
interface FinalisingSessionScreenProps {
  onReturnToWelcome: () => void;
  onEndSession: () => void;
  cartItems: PrintOrder[];
  onQuantityChange: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onProceedToPayment: (selectedItems: PrintOrder[]) => void;
  isConnectionLost: boolean;
  onSimulateConnectionLost: () => void;
  onSimulateConnectionRestored: () => void;
  onLogin: (username: string) => void;
  accountId: string | null;
  /** Navigates to the Personal Account screen (docs/personal-account-requirements.md)
   * — used by the footer's btn-account. */
  onGoToPersonalAccount: () => void;
  hasPendingPaidOrders: boolean;
  onDismissPaidOrdersPrompt: () => void;
  onGoToPaidOrders: () => void;
  onLanguageChange: (language: Language) => void;
}

export function FinalisingSessionScreen({
  onReturnToWelcome,
  onEndSession,
  cartItems,
  onQuantityChange,
  onRemoveItem,
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
}: FinalisingSessionScreenProps) {
  const t = useTranslation();
  return (
    <KioskScreenLayout
      onEndSession={onEndSession}
      onBack={onReturnToWelcome}
      onHome={onReturnToWelcome}
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
        <p className={styles.message}>{t.finalisingSession.message}</p>
      </div>
    </KioskScreenLayout>
  );
}
