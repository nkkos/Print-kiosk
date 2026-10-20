import { House, LogOut, PartyPopper } from 'lucide-react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder } from '../../types/kiosk';
import styles from './FinalisingSessionScreen.module.css';

// Finalising Session screen — see docs/domain/kiosk-session.md:
// "Finalising session's Back action leads to the Welcome Screen — the same
// destination as Home — in case the user wants to print something else."
// Unlike Payment/Print Status, the order has now been delivered, so
// end-session is available again (sessionActive defaults to true) and
// navigation-back/navigation-home both simply return to Welcome *without*
// ending the session (the user may still want to start another service) —
// ending it remains a separate, explicit end-session action.
//
// 2026-10 redesign: a thank-you with the two ways on — finish (the data goes
// at once) or do something else. "Finish" is offered here only while the
// Cart is empty: with unpaid items left the header's end-session keeps its
// confirmation (docs/domain/kiosk-session.md, "Confirmation rule").
interface FinalisingSessionScreenProps {
  onReturnToWelcome: () => void;
  onEndSession: (reason: EndSessionReason) => void;
  cartItems: PrintOrder[];
  /** Opens the order review screen — the footer's btn-cart. */
  onOpenCart: () => void;
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

export function FinalisingSessionScreen({
  onReturnToWelcome,
  onEndSession,
  cartItems,
  onOpenCart,
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
      onOpenCart={onOpenCart}
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
        <span className={styles.badge} aria-hidden="true">
          <PartyPopper size={80} strokeWidth={1.5} />
        </span>
        <h1 className={styles.title}>{t.finalisingSession.title}</h1>
        <p className={styles.message}>{t.finalisingSession.message}</p>
        <div className={styles.actions}>
          {cartItems.length === 0 && (
            <Button
              id="finalising-end-session"
              variant="primary"
              icon={<LogOut size={24} />}
              label={t.kioskLayout.endSession}
              onClick={() => onEndSession('manual')}
            />
          )}
          <Button
            id="finalising-something-else"
            icon={<House size={24} />}
            label={t.finalisingSession.somethingElse}
            onClick={onReturnToWelcome}
          />
        </div>
        <p className={styles.hint}>{t.finalisingSession.hint}</p>
      </div>
    </KioskScreenLayout>
  );
}
