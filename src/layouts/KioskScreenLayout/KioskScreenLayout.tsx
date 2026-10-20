import { useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, House, LogOut, ShieldCheck } from 'lucide-react';
import { LanguageContext } from '../../i18n/context';
import { HelpPanel, LanguagePanel, PrivacyPanel, TariffsPanel } from './InfoPanels';
import { BrandMark } from '../../components/BrandMark/BrandMark';
import { DevOnly } from '../../components/DevOnly/DevOnly';
import { Button } from '../../components/Button/Button';
import { PersistentActionBar } from '../../components/PersistentActionBar/PersistentActionBar';
import { Modal } from '../../components/Modal/Modal';
import { Notification } from '../../components/Notification/Notification';
import { LoginPanel } from '../../components/LoginPanel/LoginPanel';
import { useRegisterQrImageUrl } from '../../components/LoginPanel/useRegisterQrImageUrl';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder } from '../../types/kiosk';
import { usePavilionHours, formatPavilionTime } from './usePavilionHours';
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
// end-session), an optional Back/Home row, the persistent footer and the
// cross-cutting popups — see docs/screens/welcome-screen-spec.md and
// docs/domain/kiosk-session.md. Extracted once a third screen needed the
// same header/footer composition as WelcomeScreen and
// UploadMethodSelectionScreen (see
// docs/implementation/project-architecture.md, Section 9 — extract shared
// layout once duplication is real, not speculative). Popup open/closed
// state lives here (not in App.tsx) since it's purely this shell's own
// visibility concern, not Kiosk Session domain state.
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
  /** Current Cart contents — the footer's count and the End Session rule. */
  cartItems: PrintOrder[];
  /** Opens the order review screen (btn-cart) — App.tsx navigates there;
   * the Cart is a screen, not a popup, since the 2026-10 redesign
   * (docs/domain/kiosk-session.md, "Related entities: Cart").
   * Omitted on Payment/Print Status (a committed transaction) and on the
   * review screen itself — btn-cart is then disabled. */
  onOpenCart?: () => void;
  /** This is the order review screen — btn-cart shows as the current one. */
  cartIsCurrent?: boolean;
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
  onOpenCart,
  cartIsCurrent = false,
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
  const [isEndConfirmOpen, setIsEndConfirmOpen] = useState(false);
  const [isConnectionNotificationVisible, setIsConnectionNotificationVisible] = useState(false);
  const [isIdleWarningOpen, setIsIdleWarningOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isTariffsOpen, setIsTariffsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const language = useContext(LanguageContext);
  // When the inactivity warning will end the session — drives its countdown.
  const [idleEndsAt, setIdleEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const registerQrImageUrl = useRegisterQrImageUrl();
  const pavilionHours = usePavilionHours();
  const pavilionHoursMessage =
    pavilionHours.kind === 'closing-soon'
      ? t.pavilionHours.closingSoon(formatPavilionTime(pavilionHours.closesAt))
      : pavilionHours.kind === 'no-new-orders'
        ? t.pavilionHours.noNewOrders(formatPavilionTime(pavilionHours.closesAt))
        : pavilionHours.kind === 'closed'
          ? pavilionHours.opensAt
            ? t.pavilionHours.closedUntil(formatPavilionTime(pavilionHours.opensAt))
            : t.pavilionHours.closed
          : null;

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
      setIdleEndsAt(null);
      return;
    }

    let warningTimeoutId: ReturnType<typeof setTimeout>;
    let endTimeoutId: ReturnType<typeof setTimeout>;

    function scheduleWarning() {
      warningTimeoutId = setTimeout(() => {
        setIsIdleWarningOpen(true);
        setIdleEndsAt(Date.now() + IDLE_END_DELAY_MS);
        endTimeoutId = setTimeout(() => onEndSession('timeout'), IDLE_END_DELAY_MS);
      }, IDLE_WARNING_DELAY_MS);
    }

    function handleActivity() {
      setIsIdleWarningOpen(false);
      setIdleEndsAt(null);
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

  // Ticks the inactivity warning's countdown while it's shown.
  useEffect(() => {
    if (idleEndsAt === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [idleEndsAt]);
  const idleSecondsLeft =
    idleEndsAt === null ? 0 : Math.max(0, Math.ceil((idleEndsAt - now) / 1000));

  // Confirmation rule (docs/domain/kiosk-session.md): a genuinely empty
  // session ends immediately with no dialog; a non-empty one always shows
  // the same generic confirmation first.
  function handleEndSessionClick() {
    if (cartItems.length === 0) {
      onEndSession('manual');
    } else {
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
          <DevOnly>
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
          </DevOnly>
          {/* Opens "how we protect your data" (batch 6) — the badge is the
              question a careful customer would ask. */}
          <button
            type="button"
            className={styles.trustBadge}
            id="header-data-protected"
            onClick={() => setIsPrivacyOpen(true)}
          >
            <ShieldCheck size={26} strokeWidth={2} aria-hidden="true" />
            {t.kioskLayout.dataProtected}
          </button>
          <span
            className={styles.status}
            id="header-kiosk-status"
            data-state={isConnectionLost ? 'offline' : 'ready'}
            role="status"
          >
            <span className={styles.statusDot} aria-hidden="true" />
            {isConnectionLost ? t.kioskLayout.statusOffline : t.kioskLayout.statusReady}
          </span>
          {sessionActive && (
            <Button
              id="end-session"
              label={t.kioskLayout.endSession}
              icon={<LogOut size={24} strokeWidth={2} />}
              onClick={handleEndSessionClick}
            />
          )}
        </div>
      </header>

      {/* Opening hours (docs/pavilion-security-requirements.md, "Closing
          sequence") — a strip, not a popup: it must stay readable while the
          customer keeps working. */}
      {pavilionHoursMessage && (
        <div
          id="pavilion-hours-banner"
          className={styles.hoursBanner}
          data-kind={pavilionHours.kind}
          role="status"
        >
          {pavilionHoursMessage}
        </div>
      )}

      {(onBack || onHome) && (
        <div className={styles.navRow}>
          {onBack && (
            <Button
              id="navigation-back"
              variant="ghost"
              label={t.common.back}
              icon={<ArrowLeft size={28} strokeWidth={2} />}
              onClick={onBack}
            />
          )}
          {onBack && onHome && <span className={styles.navDivider} aria-hidden="true" />}
          {onHome && (
            <Button
              id="navigation-home"
              variant="ghost"
              label={t.common.home}
              icon={<House size={28} strokeWidth={2} />}
              onClick={onHome}
            />
          )}
        </div>
      )}

      <main className={styles.content}>
        {children}

        {isEndConfirmOpen && (
          <Modal onClose={() => setIsEndConfirmOpen(false)}>
            <Notification
              id="end-session-dialog"
              title={t.kioskLayout.endSessionConfirmTitle}
              message={t.kioskLayout.endSessionConfirmMessage}
              variant="warning"
              badge={<LogOut size={52} strokeWidth={1.75} />}
            >
              <Button
                id="end-session-cancel"
                label={t.kioskLayout.endSessionKeepWorking}
                onClick={() => setIsEndConfirmOpen(false)}
              />
              <Button
                id="end-session-confirm"
                variant="primary"
                label={t.kioskLayout.endSessionConfirmAction}
                onClick={handleConfirmEndSession}
              />
            </Notification>
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
          // Any touch already counts as activity and closes it; the button
          // just gives that touch an obvious place.
          <Modal onClose={() => setIsIdleWarningOpen(false)}>
            <Notification
              id="idle-warning"
              title={t.kioskLayout.idleWarningTitle}
              message={t.kioskLayout.idleWarningMessage}
              variant="warning"
              badge={
                <span className={styles.countdown} aria-live="polite">
                  {idleSecondsLeft}
                </span>
              }
            >
              <span className={styles.countdownText}>
                {t.kioskLayout.idleSecondsLeft(idleSecondsLeft)}
              </span>
              <Button
                id="idle-warning-stay"
                variant="primary"
                label={t.kioskLayout.idleStay}
                onClick={() => setIsIdleWarningOpen(false)}
              />
            </Notification>
          </Modal>
        )}

        {isLoginOpen && (
          <Modal onClose={() => setIsLoginOpen(false)}>
            <LoginPanel onLogin={handleLoginSuccess} registerQrImageUrl={registerQrImageUrl} />
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
            <LanguagePanel current={language} onSelect={handleLanguageSelect} />
          </Modal>
        )}

        {isHelpOpen && (
          <Modal size="wide" onClose={() => setIsHelpOpen(false)}>
            <HelpPanel />
          </Modal>
        )}

        {isTariffsOpen && (
          <Modal size="wide" onClose={() => setIsTariffsOpen(false)}>
            <TariffsPanel />
          </Modal>
        )}

        {isPrivacyOpen && (
          <Modal size="wide" onClose={() => setIsPrivacyOpen(false)}>
            <PrivacyPanel />
          </Modal>
        )}
      </main>

      <footer className={styles.footer}>
        <PersistentActionBar
          onCartActivate={onOpenCart}
          cartCount={cartItems.length}
          cartActive={cartIsCurrent}
          onAccountActivate={handleAccountActivate}
          accountLoggedIn={accountId !== null}
          onLanguageActivate={() => setIsLanguageOpen(true)}
          onHelpActivate={() => setIsHelpOpen(true)}
          onTariffsActivate={() => setIsTariffsOpen(true)}
        />
      </footer>
    </div>
  );
}
