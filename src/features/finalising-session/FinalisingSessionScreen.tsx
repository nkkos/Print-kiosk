import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
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
  onProceedToPayment: () => void;
}

export function FinalisingSessionScreen({
  onReturnToWelcome,
  onEndSession,
  cartItems,
  onProceedToPayment,
}: FinalisingSessionScreenProps) {
  return (
    <KioskScreenLayout
      onEndSession={onEndSession}
      onBack={onReturnToWelcome}
      onHome={onReturnToWelcome}
      cartItems={cartItems}
      onProceedToPayment={onProceedToPayment}
    >
      <div className={styles.body}>
        <p className={styles.message}>Your documents have been printed. Thank you!</p>
      </div>
    </KioskScreenLayout>
  );
}
