import { Camera, CircleCheck, Images, LoaderCircle, Printer, RotateCcw, Send } from 'lucide-react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { QrCard } from '../../components/QrCard/QrCard';
import { StepList } from '../../components/StepList/StepList';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder } from '../../types/kiosk';
import type { ScanSession } from '../../services/scanApi';
import styles from './ScanScreen.module.css';

// Scan screen — see docs/scan-upload-requirements.md, docs/screens/scan-spec.md.
// Same layout as QR upload (2026-10 redesign): what to do on the left, the
// QR code on the right. The left side follows the phone — the steps before
// the first page, then how many pages are in, then "sent" — nothing is
// selectable on the kiosk itself for this service, since delivery happens
// entirely on the phone (Email/download link/Personal Account, "Delivery"
// in the requirements doc). Scanning is free; once sent, the scan can also be
// printed — that's ordinary paid printing (docs/scan-upload-requirements.md,
// "Printing a scan").
interface ScanScreenProps {
  /** The phone-facing scan URL to encode — null until App.tsx has created
   * the scan session and resolved the backend's LAN-facing base URL. */
  scanQrUrl: string | null;
  /** Polled scan session state (pages captured, delivery status) — null
   * until the first poll resolves. */
  scanSession: ScanSession | null;
  onRestart: () => void;
  /** "Print the scan" — App.tsx prepares it and opens print settings. */
  onPrintScan: () => void;
  /** The scan's print copy is being prepared (virus check). */
  isPreparingPrint: boolean;
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

export function ScanScreen({
  scanQrUrl,
  scanSession,
  onRestart,
  onPrintScan,
  isPreparingPrint,
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
}: ScanScreenProps) {
  const t = useTranslation();

  function describeMethod(method: string): string {
    if (method === 'email') return t.scan.methodEmail;
    if (method === 'link') return t.scan.methodLink;
    if (method === 'account') return t.scan.methodAccount;
    return method;
  }

  const isDelivered = scanSession?.deliveredAt != null;
  const pageCount = scanSession?.pages.length ?? 0;

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
        <h1 className={styles.title}>
          {t.scan.title}
          <span className={styles.free}>{t.scan.free}</span>
        </h1>
        <p className={styles.subtitle}>{t.scan.subtitle}</p>
      </div>

      <div className={styles.body}>
        <div className={styles.main} id="scan-status">
          {isDelivered ? (
            <div className={styles.statusCard}>
              <span className={`${styles.badge} ${styles.badgeSuccess}`} aria-hidden="true">
                <CircleCheck size={72} strokeWidth={1.5} />
              </span>
              <h2 className={styles.statusTitle}>{t.scan.deliveredTitle}</h2>
              <p className={styles.statusText} role="status">
                {t.scan.deliveredMessage(
                  (scanSession?.deliveryMethods ?? []).map(describeMethod).join(', '),
                )}
              </p>
              <Button
                id="scan-restart"
                variant="primary"
                icon={<RotateCcw size={24} />}
                label={t.scan.restart}
                onClick={onRestart}
              />
              <div className={styles.printOffer}>
                <span className={styles.printQuestion}>{t.scan.printQuestion}</span>
                <Button
                  id="scan-print"
                  icon={
                    isPreparingPrint ? (
                      <LoaderCircle className={styles.spin} size={24} />
                    ) : (
                      <Printer size={24} />
                    )
                  }
                  label={isPreparingPrint ? t.scan.printPreparing : t.scan.print}
                  onClick={onPrintScan}
                  disabled={isPreparingPrint}
                />
              </div>
            </div>
          ) : pageCount > 0 ? (
            <div className={styles.statusCard}>
              <span className={`${styles.badge} ${styles.badgeAccent}`} aria-hidden="true">
                <Images size={72} strokeWidth={1.5} />
              </span>
              <h2 className={styles.statusTitle} role="status">
                {t.scan.pageCountMessage(pageCount)}
              </h2>
              <p className={styles.statusText}>{t.scan.progressHint}</p>
            </div>
          ) : (
            <StepList
              id="scan-steps"
              steps={[
                {
                  icon: <Camera size={48} strokeWidth={1.5} />,
                  title: t.qrUpload.step1Title,
                  text: t.qrUpload.step1Text,
                },
                {
                  icon: <Images size={48} strokeWidth={1.5} />,
                  title: t.scan.step2Title,
                  text: t.scan.step2Text,
                },
                {
                  icon: <Send size={48} strokeWidth={1.5} />,
                  title: t.scan.step3Title,
                  text: t.scan.step3Text,
                },
              ]}
            />
          )}
        </div>

        <QrCard
          id="scan-qr-code"
          url={scanQrUrl}
          alt={t.scan.qrImageAlt}
          preparingLabel={t.scan.preparingQrCode}
          caption={t.qrUpload.qrCaption}
          note={t.qrUpload.sessionOnly}
        >
          {pageCount === 0 && !isDelivered && (
            <p className={styles.waiting} role="status">
              <LoaderCircle className={styles.spin} size={28} aria-hidden="true" />
              {t.scan.waitingShort}
            </p>
          )}
        </QrCard>
      </div>
    </KioskScreenLayout>
  );
}
