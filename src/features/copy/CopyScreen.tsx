import {
  Camera,
  CircleCheck,
  Images,
  LoaderCircle,
  RotateCcw,
  Settings2,
  ShieldAlert,
} from 'lucide-react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { QrCard } from '../../components/QrCard/QrCard';
import { StepList } from '../../components/StepList/StepList';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder, ReceivedFile } from '../../types/kiosk';
import type { CopySession } from '../../services/copyApi';
import styles from './CopyScreen.module.css';

// Copy screen — see docs/copy-upload-requirements.md, docs/screens/copy-spec.md.
// Same layout as Scan (2026-10 redesign): what to do on the left, the QR code
// on the right. A finished copy goes straight to print settings (App.tsx;
// product owner, 2026-10-20), and once it's in the order the next capture
// starts by itself — so "Ready" here only shows after Back from the settings,
// with configure-printing; another-document is left for a blocked copy. No
// delivery confirmation — nothing is ever delivered
// from this screen itself, the captured document just becomes a normal
// uploaded file (server/copyStore.ts) handed to Print Order Configuration.
interface CopyScreenProps {
  /** The phone-facing copy URL to encode — null until App.tsx has created
   * the copy session and resolved the backend's LAN-facing base URL. */
  copyQrUrl: string | null;
  /** Polled copy session state (pages captured, result file once finished)
   * — null until the first poll resolves. */
  copySession: CopySession | null;
  /** The real uploaded-file status behind copySession.resultFileId (the same
   * AV-scan/convert pipeline QR upload's files go through) — null until
   * known. copy-configure-printing stays disabled until this is 'ready',
   * since the capture finishing (copySession.resultFileId set) can precede
   * the file actually being printable/previewable by several seconds. */
  resultFileStatus: ReceivedFile['status'] | null;
  onConfigurePrinting: () => void;
  onAnotherDocument: () => void;
  onBack: () => void;
  onHome: () => void;
  onEndSession: (reason: EndSessionReason) => void;
  cartItems: PrintOrder[];
  /** Opens the order review screen — the footer's btn-cart. */
  onOpenCart: () => void;
  isConnectionLost: boolean;
  onSimulateConnectionLost: () => void;
  onSimulateConnectionRestored: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  accountId: string | null;
  onGoToPersonalAccount: () => void;
  hasPendingPaidOrders: boolean;
  onDismissPaidOrdersPrompt: () => void;
  onGoToPaidOrders: () => void;
  onLanguageChange: (language: Language) => void;
}

export function CopyScreen({
  copyQrUrl,
  copySession,
  resultFileStatus,
  onConfigurePrinting,
  onAnotherDocument,
  onBack,
  onHome,
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
}: CopyScreenProps) {
  const t = useTranslation();

  const hasResultFile = copySession?.resultFileId != null;
  // Reuses the exact same per-status wording QR upload's own received-files
  // list already shows while a file is scanning/converting (docs/domain/kiosk-session.md,
  // "File scanning status") — the underlying pipeline is identical.
  const isPrintable = hasResultFile && resultFileStatus === 'ready';
  const inProgressPageCount = copySession?.pages.length ?? 0;
  const resultStatusMessage =
    resultFileStatus === 'rejected'
      ? t.common.blockedVirusScan
      : resultFileStatus === 'scan-unavailable'
        ? t.common.scanUnavailable
        : resultFileStatus === 'converting'
          ? t.common.preparingForPrint
          : t.common.scanningForViruses;
  const isBlocked = resultFileStatus === 'rejected' || resultFileStatus === 'scan-unavailable';

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
        <h1 className={styles.title}>{t.copy.title}</h1>
        <p className={styles.subtitle}>{t.copy.subtitle}</p>
      </div>

      <div className={styles.body}>
        <div className={styles.main} id="copy-status">
          {hasResultFile ? (
            <div className={styles.statusCard}>
              {isPrintable ? (
                <>
                  <span className={`${styles.badge} ${styles.badgeSuccess}`} aria-hidden="true">
                    <CircleCheck size={72} strokeWidth={1.5} />
                  </span>
                  <h2 className={styles.statusTitle} role="status">
                    {t.copy.readyMessage(copySession?.resultPageCount ?? 0)}
                  </h2>
                </>
              ) : isBlocked ? (
                <>
                  <span className={`${styles.badge} ${styles.badgeWarning}`} aria-hidden="true">
                    <ShieldAlert size={72} strokeWidth={1.5} />
                  </span>
                  <h2 className={styles.statusTitle} role="status">
                    {resultStatusMessage}
                  </h2>
                </>
              ) : (
                <>
                  <span className={`${styles.badge} ${styles.badgeAccent}`} aria-hidden="true">
                    <LoaderCircle className={styles.spin} size={72} strokeWidth={1.5} />
                  </span>
                  <h2 className={styles.statusTitle}>{t.copy.preparingTitle}</h2>
                  <p className={styles.statusText} role="status">
                    {resultStatusMessage}
                  </p>
                </>
              )}
              <div className={styles.actions}>
                {isBlocked ? (
                  <Button
                    id="copy-another-document"
                    icon={<RotateCcw size={24} />}
                    label={t.copy.anotherDocument}
                    onClick={onAnotherDocument}
                  />
                ) : (
                  <Button
                    id="copy-configure-printing"
                    variant="primary"
                    icon={<Settings2 size={24} />}
                    label={t.copy.configurePrinting}
                    onClick={onConfigurePrinting}
                    disabled={!isPrintable}
                  />
                )}
              </div>
            </div>
          ) : inProgressPageCount > 0 ? (
            <div className={styles.statusCard}>
              <span className={`${styles.badge} ${styles.badgeAccent}`} aria-hidden="true">
                <Images size={72} strokeWidth={1.5} />
              </span>
              <h2 className={styles.statusTitle} role="status">
                {t.copy.pageCountMessage(inProgressPageCount)}
              </h2>
              <p className={styles.statusText}>{t.copy.progressHint}</p>
            </div>
          ) : (
            <StepList
              id="copy-steps"
              steps={[
                {
                  icon: <Camera size={48} strokeWidth={1.5} />,
                  title: t.qrUpload.step1Title,
                  text: t.qrUpload.step1Text,
                },
                {
                  icon: <Images size={48} strokeWidth={1.5} />,
                  title: t.copy.step2Title,
                  text: t.copy.step2Text,
                },
                {
                  icon: <Settings2 size={48} strokeWidth={1.5} />,
                  title: t.copy.step3Title,
                  text: t.copy.step3Text,
                },
              ]}
            />
          )}
        </div>

        <QrCard
          id="copy-qr-code"
          url={copyQrUrl}
          alt={t.copy.qrImageAlt}
          preparingLabel={t.copy.preparingQrCode}
          caption={t.qrUpload.qrCaption}
          note={t.qrUpload.sessionOnly}
        >
          {!hasResultFile && inProgressPageCount === 0 && (
            <p className={styles.waiting} role="status">
              <LoaderCircle className={styles.spin} size={28} aria-hidden="true" />
              {t.copy.waitingShort}
            </p>
          )}
        </QrCard>
      </div>
    </KioskScreenLayout>
  );
}
