import { useState } from 'react';
import { FileText, FolderOpen, Mail, QrCode } from 'lucide-react';
import { acceptedFormatsLabel, MAX_FILE_SIZE_MB } from '../../utils/fileLimits';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { OptionCard } from '../../components/OptionCard/OptionCard';
import { Modal } from '../../components/Modal/Modal';
import { LoginPanel } from '../../components/LoginPanel/LoginPanel';
import { useRegisterQrImageUrl } from '../../components/LoginPanel/useRegisterQrImageUrl';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder } from '../../types/kiosk';
import styles from './UploadMethodSelectionScreen.module.css';

// Placeholder composition only — see docs/screens/upload-method-selection-spec.md
// and docs/domain/kiosk-session.md.
//
// TODO (deferred to the behavior-implementation phase):
// - upload-method-usb's real hardware-availability check / unavailable state
// - overlay open/close state driving Modal visibility for Language/Help/Tariffs
//   (Account/Cart are implemented; those three still have no confirmed content)
// - real navigation for telegram/web/usb (currently a placeholder no-op —
//   upload-method-email, upload-method-qr, and upload-method-account all
//   navigate for now, see docs/email-upload-requirements.md,
//   docs/qr-upload-requirements.md, and docs/personal-account-requirements.md)
//
// PromoAction is intentionally not rendered here — per docs/domain/kiosk-session.md,
// it is no longer a header element; if a promotion is ever active, it will be
// presented as a popup at session start instead.

// TODO: method-specific navigation is not implemented yet for these
// methods — see docs/screens/upload-method-selection-spec.md, Navigation.
// Placeholder only.
function handleMethodActivate() {
  console.log('Not implemented yet');
}

// Temporarily not shown on the kiosk (docs/upload-method-requirements.md,
// "Temporary display scope") — still confirmed methods, just not being
// actively developed right now. Code kept in place (cards below, and
// handleMethodActivate above) so re-enabling is a one-line flip, not a
// rebuild.
const SHOW_UNBUILT_METHODS = false;

interface UploadMethodSelectionScreenProps {
  onBack: () => void;
  /** Jumps directly to the Welcome Screen (see docs/domain/kiosk-session.md);
   * distinct from onBack even though both reach the same destination today. */
  onHome: () => void;
  /** Ends the active Kiosk Session and returns to the Welcome Screen. A
   * session always exists by the time this screen is reached (created by
   * service-print), so end-session is shown unconditionally here. */
  onEndSession: (reason: EndSessionReason) => void;
  /** Navigates into the Email upload flow (docs/email-upload-requirements.md). */
  onEmailActivate: () => void;
  /** Navigates into the QR upload flow (docs/qr-upload-requirements.md). */
  onQrActivate: () => void;
  /** Logs the Kiosk Session into an account (docs/personal-account-requirements.md).
   * Used both for KioskScreenLayout's footer login popup and this screen's
   * own upload-method-account card, which opens its own local login popup. */
  onLogin: (email: string, password: string) => Promise<void>;
  /** Navigates to the Personal Account screen (docs/personal-account-requirements.md).
   * Called directly if already logged in, or right after a successful login
   * from the upload-method-account card's own popup. */
  onGoToPersonalAccount: () => void;
  /** Current account, if logged in — null when anonymous. */
  accountId: string | null;
  /** True right after login when the account has a paid order awaiting
   * print — drives a one-time prompt popup (docs/personal-account-requirements.md,
   * "Paid orders awaiting print"). */
  hasPendingPaidOrders: boolean;
  onDismissPaidOrdersPrompt: () => void;
  onGoToPaidOrders: () => void;
  onLanguageChange: (language: Language) => void;
  /** Current Cart contents — the footer's count and the End Session rule. */
  cartItems: PrintOrder[];
  /** Opens the order review screen — the footer's btn-cart. */
  onOpenCart: () => void;
  /** Ids of upload methods used at least once this session — drives each
   * card's "used" marker (docs/upload-method-requirements.md). */
  usedMethods: ReadonlySet<string>;
  isConnectionLost: boolean;
  onSimulateConnectionLost: () => void;
  onSimulateConnectionRestored: () => void;
}

export function UploadMethodSelectionScreen({
  onBack,
  onHome,
  onEndSession,
  onEmailActivate,
  onQrActivate,
  onLogin,
  onGoToPersonalAccount,
  accountId,
  hasPendingPaidOrders,
  onDismissPaidOrdersPrompt,
  onGoToPaidOrders,
  onLanguageChange,
  cartItems,
  onOpenCart,
  usedMethods,
  isConnectionLost,
  onSimulateConnectionLost,
  onSimulateConnectionRestored,
}: UploadMethodSelectionScreenProps) {
  const t = useTranslation();
  const [isAccountLoginOpen, setIsAccountLoginOpen] = useState(false);
  const registerQrImageUrl = useRegisterQrImageUrl();

  function handleAccountCardActivate() {
    if (accountId) {
      onGoToPersonalAccount();
    } else {
      setIsAccountLoginOpen(true);
    }
  }

  // Only closes the popup and navigates on success — if onLogin rejects, the
  // error propagates back up to LoginPanel's own catch (it stays open and
  // shows the error, same as before).
  async function handleAccountLoginSuccess(email: string, password: string) {
    await onLogin(email, password);
    setIsAccountLoginOpen(false);
    onGoToPersonalAccount();
  }

  return (
    <KioskScreenLayout
      onEndSession={onEndSession}
      onBack={onBack}
      onHome={onHome}
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
      <div className={styles.intro}>
        <h1 className={styles.title}>{t.uploadMethodSelection.title}</h1>
        <p className={styles.subtitle}>{t.uploadMethodSelection.subtitle}</p>
      </div>

      <div className={styles.grid}>
        <OptionCard
          id="upload-method-qr"
          size="large"
          icon={<QrCode size={64} strokeWidth={1.5} />}
          title={t.uploadMethodSelection.qrHeading}
          description={t.uploadMethodSelection.qrHint}
          onActivate={onQrActivate}
          used={usedMethods.has('upload-method-qr')}
          usedLabel={t.uploadMethodSelection.usedTag}
        />
        <OptionCard
          id="upload-method-email"
          size="large"
          icon={<Mail size={64} strokeWidth={1.5} />}
          title={t.uploadMethodSelection.emailHeading}
          description={t.uploadMethodSelection.emailHint}
          onActivate={onEmailActivate}
          used={usedMethods.has('upload-method-email')}
          usedLabel={t.uploadMethodSelection.usedTag}
        />
        <OptionCard
          id="upload-method-account"
          size="large"
          icon={<FolderOpen size={64} strokeWidth={1.5} />}
          title={t.uploadMethodSelection.accountHeading}
          description={t.uploadMethodSelection.accountHint}
          onActivate={handleAccountCardActivate}
          // Unlike every other method, "used" alone isn't enough here: once
          // logged out, those files are no longer reachable from this
          // screen, so the marker should not keep pointing at them
          // (docs/personal-account-requirements.md, "Kiosk-side login").
          used={usedMethods.has('upload-method-account') && accountId !== null}
          usedLabel={t.uploadMethodSelection.usedTag}
        />
        {SHOW_UNBUILT_METHODS && (
          <>
            <OptionCard
              id="upload-method-telegram"
              title={t.uploadMethodSelection.telegramTitle}
              description={t.uploadMethodSelection.telegramDescription}
              onActivate={handleMethodActivate}
              used={usedMethods.has('upload-method-telegram')}
            />
            <OptionCard
              id="upload-method-web"
              title={t.uploadMethodSelection.webTitle}
              description={t.uploadMethodSelection.webDescription}
              onActivate={handleMethodActivate}
              used={usedMethods.has('upload-method-web')}
            />
            <OptionCard
              id="upload-method-usb"
              title={t.uploadMethodSelection.usbTitle}
              description={t.uploadMethodSelection.usbDescription}
              onActivate={handleMethodActivate}
              used={usedMethods.has('upload-method-usb')}
            />
          </>
        )}
      </div>

      {/* What will be accepted, before anyone tries (docs/domain/kiosk-session.md,
          "File format and size limits"). */}
      <p className={styles.formats} id="upload-formats-hint">
        <FileText size={26} strokeWidth={1.75} aria-hidden="true" />
        {t.uploadMethodSelection.formatsHint(acceptedFormatsLabel(), MAX_FILE_SIZE_MB)}
      </p>

      {isAccountLoginOpen && (
        <Modal onClose={() => setIsAccountLoginOpen(false)}>
          <LoginPanel onLogin={handleAccountLoginSuccess} registerQrImageUrl={registerQrImageUrl} />
        </Modal>
      )}

      {/* TODO: render <Notification /> here for the connectivity-lost state
          once that state exists — see
          docs/screens/upload-method-selection-spec.md, Screen states. Not
          rendered in the normal state. */}

      {/* TODO: render <Modal /> here as the shared shell for the temporary
          Language/Help/Tariffs panels once overlay state exists. Not
          rendered while no overlay is open. */}
    </KioskScreenLayout>
  );
}
