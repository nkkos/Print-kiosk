import { useState } from 'react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { ServiceCard } from '../../components/ServiceCard/ServiceCard';
import { Button } from '../../components/Button/Button';
import { Modal } from '../../components/Modal/Modal';
import { Notification } from '../../components/Notification/Notification';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder } from '../../types/kiosk';
import styles from './WelcomeScreen.module.css';

// Placeholder composition only — see docs/screens/welcome-screen-spec.md,
// docs/domain/kiosk-session.md, and
// docs/implementation/project-architecture.md, Section 6.
//
// TODO (deferred to the behavior-implementation phase):
// - overlay open/close state driving Modal visibility (Language/Help/Tariffs/Account)
// - idle / idle-wake behavior
// - PersistentActionBar's items are plain text placeholders; swap for
//   IconButton once an icon set is approved, and wire overlay-trigger callbacks
//
// PromoAction is intentionally not rendered here — per docs/domain/kiosk-session.md,
// it is no longer a header element; if a promotion is ever active, it will be
// presented as a popup at session start instead.

interface WelcomeScreenProps {
  /** Navigates to the Upload Method Selection Screen (see
   * docs/screens/upload-method-selection-spec.md). Creates a Kiosk Session
   * first if none exists yet (Trigger A, docs/domain/kiosk-session.md). */
  onPrintActivate: () => void;
  /** Whether a Kiosk Session is currently active (logged in, or anonymous
   * after returning via Back) — controls end-session's visibility. */
  sessionActive: boolean;
  /** Ends the active Kiosk Session and returns to this screen's neutral state. */
  onEndSession: (reason: EndSessionReason) => void;
  /** Current Cart contents, shown in the btn-cart popup. */
  cartItems: PrintOrder[];
  /** Adjusts a Cart item's quantity (docs/cart-requirements.md). */
  onQuantityChange: (id: string, quantity: number) => void;
  /** Removes a Cart item entirely (docs/cart-requirements.md). */
  onRemoveItem: (id: string) => void;
  /** Navigates to the Payment Status screen with the checked Cart items. */
  onProceedToPayment: (selectedItems: PrintOrder[]) => void;
  isConnectionLost: boolean;
  onSimulateConnectionLost: () => void;
  onSimulateConnectionRestored: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  accountId: string | null;
  /** Navigates to the Personal Account screen (docs/personal-account-requirements.md)
   * — used by the footer's btn-account. */
  onGoToPersonalAccount: () => void;
  /** True right after login when the account has a paid order awaiting
   * print — drives the footer login's one-time prompt popup (docs/personal-account-requirements.md,
   * "Paid orders awaiting print"). */
  hasPendingPaidOrders: boolean;
  onDismissPaidOrdersPrompt: () => void;
  onGoToPaidOrders: () => void;
  onLanguageChange: (language: Language) => void;
}

export function WelcomeScreen({
  onPrintActivate,
  sessionActive,
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
}: WelcomeScreenProps) {
  const t = useTranslation();
  // Stands in for a real hardware-agent check at startup, which doesn't
  // exist in this prototype (docs/screens/welcome-screen-spec.md, "Hardware
  // unavailable" — notification-service-unavailable). Manually triggered so
  // the pattern is demonstrable. Closing the notification only hides the
  // popup — service-print stays `unavailable` until the (simulated)
  // underlying condition changes, matching "dismissing it does not restore
  // service availability".
  const [isHardwareUnavailable, setIsHardwareUnavailable] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  function handleSimulateHardwareUnavailable() {
    setIsHardwareUnavailable(true);
    setIsNotificationOpen(true);
  }

  return (
    <KioskScreenLayout
      sessionActive={sessionActive}
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
      <div className={styles.services}>
        <ServiceCard
          serviceId="print"
          title={t.welcome.print}
          status={isHardwareUnavailable ? 'unavailable' : 'available'}
          onActivate={onPrintActivate}
        />
        <ServiceCard serviceId="scan" title={t.welcome.scan} status="coming-soon" />
        <ServiceCard serviceId="copy" title={t.welcome.copy} status="coming-soon" />
      </div>

      {isHardwareUnavailable ? (
        <Button
          id="simulate-hardware-restored"
          label="Simulate hardware restored"
          onClick={() => setIsHardwareUnavailable(false)}
        />
      ) : (
        <Button
          id="simulate-hardware-unavailable"
          label="Simulate hardware unavailable"
          onClick={handleSimulateHardwareUnavailable}
        />
      )}

      {isNotificationOpen && (
        <Modal onClose={() => setIsNotificationOpen(false)}>
          <Notification
            id="notification-service-unavailable"
            title={t.welcome.serviceUnavailableTitle}
            message={t.welcome.serviceUnavailableMessage}
            variant="error"
          />
        </Modal>
      )}

      {/* TODO: render <Modal /> here as the shared shell for the temporary
          Language/Help/Tariffs/Login panels once overlay state exists — see
          docs/screens/welcome-screen-spec.md, Navigation. Not rendered
          while no overlay is open. */}
    </KioskScreenLayout>
  );
}
