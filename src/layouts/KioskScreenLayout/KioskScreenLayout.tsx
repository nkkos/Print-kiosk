import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BrandMark } from '../../components/BrandMark/BrandMark';
import { Button } from '../../components/Button/Button';
import { PersistentActionBar } from '../../components/PersistentActionBar/PersistentActionBar';
import { Modal } from '../../components/Modal/Modal';
import { CartPanel } from '../../components/CartPanel/CartPanel';
import { Notification } from '../../components/Notification/Notification';
import { LoginPanel } from '../../components/LoginPanel/LoginPanel';
import { useTranslation, LANGUAGE_NAMES } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder } from '../../types/kiosk';
import styles from './KioskScreenLayout.module.css';

// Automatic timeout (docs/domain/kiosk-session.md, "Automatic timeout"):
// after 5 minutes of inactivity, show a 1-minute warning; if inactivity
// continues, end the session the same way manual End Session does. "System
// activity" (e.g., a background print/scan job) isn't modeled separately in
// this prototype — every reset here comes from a real input event, the
// closest available proxy. Operator-call pausing is flagged as an open item
// in the domain doc and is not implemented.
const IDLE_WARNING_DELAY_MS = 5 * 60 * 1000;
const IDLE_END_DELAY_MS = 60 * 1000;
// Exported so App.tsx's session-activity heartbeat (docs/data-privacy-requirements.md
// follow-up) can listen for the same real-activity signal, instead of
// duplicating this list.
export const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

// Connection lost (docs/domain/kiosk-session.md, "Failure and recovery";
// docs/screens/upload-method-selection-spec.md, "Connectivity lost"): while
// lost, the notification reappears every 30s even if the user dismisses it,
// since dismissing it never restores connectivity — only the (simulated)
// underlying condition changing does.
const CONNECTION_LOST_REMINDER_INTERVAL_MS = 30 * 1000;

// Shared shell for every in-flow screen: header (BrandMark + conditional
// end-session), an optional Back/Home row, the persistent footer, and the
// Cart popup (btn-cart) — see docs/screens/welcome-screen-spec.md and
// docs/domain/kiosk-session.md. Extracted once a third screen needed the
// same header/footer composition as WelcomeScreen and
// UploadMethodSelectionScreen (see
// docs/implementation/project-architecture.md, Section 9 — extract shared
// layout once duplication is real, not speculative). Cart's open/closed
// state lives here (not in App.tsx) since it's purely this shell's own
// popup-visibility concern, not Kiosk Session domain state.
interface KioskScreenLayoutProps {
  /** Whether a Kiosk Session is active — controls end-session's visibility.
   * Defaults to true: every screen reached after service-print already has
   * an active session (docs/domain/kiosk-session.md). WelcomeScreen is the
   * only screen that passes this explicitly, since it's reachable both with
   * and without a session. */
  sessionActive?: boolean;
  onEndSession: (reason: EndSessionReason) => void;
  /** Renders navigation-back when provided; omitted on WelcomeScreen. */
  onBack?: () => void;
  /** Renders navigation-home when provided; omitted on WelcomeScreen. */
  onHome?: () => void;
  /** Current Cart contents, shown in the btn-cart popup. */
  cartItems: PrintOrder[];
  /** Adjusts a Cart item's quantity (docs/cart-requirements.md). */
  onQuantityChange: (id: string, quantity: number) => void;
  /** Removes a Cart item entirely, immediately (docs/cart-requirements.md). */
  onRemoveItem: (id: string) => void;
  /** Navigates to the Payment Status screen with the currently-checked
   * subset of Cart items (docs/cart-requirements.md, "Selection for
   * payment"). Offered from the Cart popup whenever it has items. */
  onProceedToPayment: (selectedItems: PrintOrder[]) => void;
  /** Opens the Cart popup as soon as this screen mounts — used right after
   * "Add to cart" so the user sees what was just added, instead of
   * silently landing back on Upload Method Selection. The user closes it
   * themselves (Modal's Close) to continue. Defaults to false. */
  initialCartOpen?: boolean;
  /** Whether the (simulated) connection is currently lost — lifted to
   * App.tsx rather than owned here, since it must persist across screen
   * navigation and actually blocks Payment/Print actions on those screens,
   * not just show a popup on whichever screen triggered it. */
  isConnectionLost: boolean;
  onSimulateConnectionLost: () => void;
  onSimulateConnectionRestored: () => void;
  /** Logs the Kiosk Session into an account (docs/personal-account-requirements.md,
   * "Kiosk-side login") — offered from the footer's btn-account, available
   * on every screen via this shared shell. */
  onLogin: (email: string, password: string) => Promise<void>;
  /** Current account, if logged in — null when anonymous. Determines
   * whether btn-account opens the login form or navigates straight to the
   * Personal Account screen, and drives the footer's logged-in marker. */
  accountId: string | null;
  /** Navigates to the Personal Account screen (docs/personal-account-requirements.md)
   * — btn-account goes here directly when already logged in, or right after
   * a successful login from btn-account's own popup, same as the Personal
   * account OptionCard on Upload Method Selection. */
  onGoToPersonalAccount: () => void;
  /** True right after a successful login when the account has at least one
   * order paid in advance and awaiting print (docs/personal-account-requirements.md,
   * "Paid orders awaiting print") — triggers a one-time popup from whichever
   * screen the login happened on. Stays true (and the popup keeps
   * reappearing across screen navigation, same pattern as connection-lost)
   * until dismissed. */
  hasPendingPaidOrders: boolean;
  onDismissPaidOrdersPrompt: () => void;
  /** Navigates straight to the Personal Account screen's My orders section
   * — the popup's primary action. */
  onGoToPaidOrders: () => void;
  /** Changes the interface language (docs/i18n-requirements.md) — offered
   * from the footer's language-switch, available on every screen via this
   * shared shell. Ownership of the current language stays in App.tsx (reset
   * every session, same as accountId); this is just the write side. */
  onLanguageChange: (language: Language) => void;
  children: ReactNode;
}

export function KioskScreenLayout({
  sessionActive = true,
  onEndSession,
  onBack,
  onHome,
  cartItems,
  onQuantityChange,
  onRemoveItem,
  onProceedToPayment,
  initialCartOpen = false,
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
  children,
}: KioskScreenLayoutProps) {
  const t = useTranslation();
  const [isCartOpen, setIsCartOpen] = useState(initialCartOpen);
  const [isEndConfirmOpen, setIsEndConfirmOpen] = useState(false);
  const [isConnectionNotificationVisible, setIsConnectionNotificationVisible] = useState(false);
  const [isIdleWarningOpen, setIsIdleWarningOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);

  // Shows immediately when connection is lost, then keeps reappearing every
  // 30s regardless of dismissal, for as long as it stays lost.
  useEffect(() => {
    if (!isConnectionLost) {
      setIsConnectionNotificationVisible(false);
      return;
    }

    setIsConnectionNotificationVisible(true);
    const intervalId = setInterval(() => {
      setIsConnectionNotificationVisible(true);
    }, CONNECTION_LOST_REMINDER_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isConnectionLost]);

  // Applies whenever sessionActive is true — matches the confirmed "every
  // screen, including Welcome Screen when it has an active session" rule,
  // and is naturally suspended on Payment/Print Status (which pass
  // sessionActive={false} while the system itself is busy).
  useEffect(() => {
    if (!sessionActive) {
      setIsIdleWarningOpen(false);
      return;
    }

    let warningTimeoutId: ReturnType<typeof setTimeout>;
    let endTimeoutId: ReturnType<typeof setTimeout>;

    function scheduleWarning() {
      warningTimeoutId = setTimeout(() => {
        setIsIdleWarningOpen(true);
        endTimeoutId = setTimeout(() => onEndSession('timeout'), IDLE_END_DELAY_MS);
      }, IDLE_WARNING_DELAY_MS);
    }

    function handleActivity() {
      setIsIdleWarningOpen(false);
      clearTimeout(warningTimeoutId);
      clearTimeout(endTimeoutId);
      scheduleWarning();
    }

    scheduleWarning();
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, handleActivity));

    return () => {
      clearTimeout(warningTimeoutId);
      clearTimeout(endTimeoutId);
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
    };
  }, [sessionActive, onEndSession]);

  function handleCartActivate() {
    setIsEndConfirmOpen(false);
    setIsCartOpen(true);
  }

  // Confirmation rule (docs/domain/kiosk-session.md): a genuinely empty
  // session ends immediately with no dialog; a non-empty one always shows
  // the same generic confirmation first.
  function handleEndSessionClick() {
    if (cartItems.length === 0) {
      onEndSession('manual');
    } else {
      setIsCartOpen(false);
      setIsEndConfirmOpen(true);
    }
  }

  function handleConfirmEndSession() {
    setIsEndConfirmOpen(false);
    onEndSession('manual');
  }

  // Only closes the popup and navigates on success — if onLogin rejects, the
  // error propagates back up to LoginPanel's own catch (it stays open and
  // shows the error, same as before).
  async function handleLoginSuccess(email: string, password: string) {
    await onLogin(email, password);
    setIsLoginOpen(false);
    onGoToPersonalAccount();
  }

  // Mirrors the Personal account OptionCard on Upload Method Selection
  // (docs/personal-account-requirements.md): navigate straight there if
  // already logged in, otherwise ask for credentials first.
  function handleAccountActivate() {
    if (accountId) {
      onGoToPersonalAccount();
    } else {
      setIsLoginOpen(true);
    }
  }

  function handleLanguageSelect(language: Language) {
    setIsLanguageOpen(false);
    onLanguageChange(language);
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <BrandMark />
        <div className={styles.headerActions}>
          {isConnectionLost ? (
            <Button
              id="simulate-connection-restored"
              label="Simulate connection restored"
              onClick={onSimulateConnectionRestored}
            />
          ) : (
            <Button
              id="simulate-connection-lost"
              label="Simulate connection lost"
              onClick={onSimulateConnectionLost}
            />
          )}
          {sessionActive && (
            <Button
              id="end-session"
              label={t.kioskLayout.endSession}
              onClick={handleEndSessionClick}
            />
          )}
        </div>
      </header>

      {(onBack || onHome) && (
        <div className={styles.navRow}>
          {onBack && <Button id="navigation-back" label={t.common.back} onClick={onBack} />}
          {onHome && <Button id="navigation-home" label={t.common.home} onClick={onHome} />}
        </div>
      )}

      <main className={styles.content}>
        {children}

        {isCartOpen && (
          <Modal onClose={() => setIsCartOpen(false)}>
            <CartPanel
              items={cartItems}
              onQuantityChange={onQuantityChange}
              onRemove={onRemoveItem}
              onProceedToPayment={onProceedToPayment}
            />
          </Modal>
        )}

        {isEndConfirmOpen && (
          <Modal onClose={() => setIsEndConfirmOpen(false)}>
            <p>{t.kioskLayout.endSessionConfirmMessage}</p>
            <Button
              id="end-session-confirm"
              label={t.common.confirm}
              onClick={handleConfirmEndSession}
            />
          </Modal>
        )}

        {isConnectionNotificationVisible && (
          <Modal onClose={() => setIsConnectionNotificationVisible(false)}>
            <Notification
              title={t.kioskLayout.connectionLostTitle}
              message={t.kioskLayout.connectionLostMessage}
              variant="warning"
            />
          </Modal>
        )}

        {isIdleWarningOpen && (
          <Modal onClose={() => setIsIdleWarningOpen(false)}>
            <Notification
              title={t.kioskLayout.idleWarningTitle}
              message={t.kioskLayout.idleWarningMessage}
              variant="warning"
            />
          </Modal>
        )}

        {isLoginOpen && (
          <Modal onClose={() => setIsLoginOpen(false)}>
            <LoginPanel onLogin={handleLoginSuccess} />
          </Modal>
        )}

        {hasPendingPaidOrders && (
          <Modal onClose={onDismissPaidOrdersPrompt}>
            <p>{t.kioskLayout.paidOrdersPromptMessage}</p>
            <Button
              id="paid-orders-prompt-go-to-orders"
              label={t.kioskLayout.goToMyOrders}
              onClick={onGoToPaidOrders}
            />
            <Button
              id="paid-orders-prompt-close"
              label={t.common.close}
              onClick={onDismissPaidOrdersPrompt}
            />
          </Modal>
        )}

        {isLanguageOpen && (
          <Modal onClose={() => setIsLanguageOpen(false)}>
            <h2>{t.kioskLayout.selectLanguage}</h2>
            {(Object.keys(LANGUAGE_NAMES) as Language[]).map((language) => (
              <Button
                key={language}
                id={`language-option-${language}`}
                label={LANGUAGE_NAMES[language]}
                onClick={() => handleLanguageSelect(language)}
              />
            ))}
          </Modal>
        )}
      </main>

      <footer className={styles.footer}>
        <PersistentActionBar
          onCartActivate={handleCartActivate}
          cartHasItems={cartItems.length > 0}
          onAccountActivate={handleAccountActivate}
          accountLoggedIn={accountId !== null}
          onLanguageActivate={() => setIsLanguageOpen(true)}
        />
      </footer>
    </div>
  );
}
