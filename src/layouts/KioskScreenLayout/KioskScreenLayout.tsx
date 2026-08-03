import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BrandMark } from '../../components/BrandMark/BrandMark';
import { Button } from '../../components/Button/Button';
import { PersistentActionBar } from '../../components/PersistentActionBar/PersistentActionBar';
import { Modal } from '../../components/Modal/Modal';
import { CartPanel } from '../../components/CartPanel/CartPanel';
import { Notification } from '../../components/Notification/Notification';
import type { PrintOrder } from '../../types/kiosk';
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
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

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
  onEndSession: () => void;
  /** Renders navigation-back when provided; omitted on WelcomeScreen. */
  onBack?: () => void;
  /** Renders navigation-home when provided; omitted on WelcomeScreen. */
  onHome?: () => void;
  /** Current Cart contents, shown in the btn-cart popup. */
  cartItems: PrintOrder[];
  /** Navigates to the Payment Status screen. Offered from the Cart popup
   * whenever it has items (docs/domain/kiosk-session.md, "Cart"). */
  onProceedToPayment: () => void;
  /** Opens the Cart popup as soon as this screen mounts — used right after
   * "Add to cart" so the user sees what was just added, instead of
   * silently landing back on Upload Method Selection. The user closes it
   * themselves (Modal's Close) to continue. Defaults to false. */
  initialCartOpen?: boolean;
  children: ReactNode;
}

export function KioskScreenLayout({
  sessionActive = true,
  onEndSession,
  onBack,
  onHome,
  cartItems,
  onProceedToPayment,
  initialCartOpen = false,
  children,
}: KioskScreenLayoutProps) {
  const [isCartOpen, setIsCartOpen] = useState(initialCartOpen);
  const [isEndConfirmOpen, setIsEndConfirmOpen] = useState(false);
  // Stands in for real network-loss detection, which doesn't exist in this
  // prototype (docs/domain/kiosk-session.md: "connection lost" reuses the
  // Notification popup pattern, closable, does not restore connectivity
  // itself, footer/operator-call remain accessible). Manually triggered here
  // so the pattern is demonstrable, the same way Payment/Print Status use a
  // "Simulate ..." button rather than a real backend outcome.
  const [isConnectionLost, setIsConnectionLost] = useState(false);
  const [isIdleWarningOpen, setIsIdleWarningOpen] = useState(false);

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
        endTimeoutId = setTimeout(onEndSession, IDLE_END_DELAY_MS);
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
      onEndSession();
    } else {
      setIsCartOpen(false);
      setIsEndConfirmOpen(true);
    }
  }

  function handleConfirmEndSession() {
    setIsEndConfirmOpen(false);
    onEndSession();
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <BrandMark />
        <div className={styles.headerActions}>
          <Button
            id="simulate-connection-lost"
            label="Simulate connection lost"
            onClick={() => setIsConnectionLost(true)}
          />
          {sessionActive && (
            <Button
              id="end-session"
              label="Finish and clear data"
              onClick={handleEndSessionClick}
            />
          )}
        </div>
      </header>

      {(onBack || onHome) && (
        <div className={styles.navRow}>
          {onBack && <Button id="navigation-back" label="Back" onClick={onBack} />}
          {onHome && <Button id="navigation-home" label="Home" onClick={onHome} />}
        </div>
      )}

      <main className={styles.content}>
        {children}

        {isCartOpen && (
          <Modal onClose={() => setIsCartOpen(false)}>
            <CartPanel items={cartItems} />
            {cartItems.length > 0 && (
              <Button
                id="cart-proceed-to-payment"
                label="Proceed to payment"
                onClick={onProceedToPayment}
              />
            )}
          </Modal>
        )}

        {isEndConfirmOpen && (
          <Modal onClose={() => setIsEndConfirmOpen(false)}>
            <p>End this session and clear all your data?</p>
            <Button id="end-session-confirm" label="Confirm" onClick={handleConfirmEndSession} />
          </Modal>
        )}

        {isConnectionLost && (
          <Modal onClose={() => setIsConnectionLost(false)}>
            <Notification
              title="Connection lost"
              message="The kiosk has lost its connection. Some features may be unavailable until it's restored."
              variant="warning"
            />
          </Modal>
        )}

        {isIdleWarningOpen && (
          <Modal onClose={() => setIsIdleWarningOpen(false)}>
            <Notification
              title="Still there?"
              message="This session will end in 1 minute due to inactivity. Tap anywhere to continue."
              variant="warning"
            />
          </Modal>
        )}
      </main>

      <footer className={styles.footer}>
        <PersistentActionBar onCartActivate={handleCartActivate} />
      </footer>
    </div>
  );
}
