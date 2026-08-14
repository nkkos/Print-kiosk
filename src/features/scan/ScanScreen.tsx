import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder } from '../../types/kiosk';
import type { ScanSession } from '../../services/scanApi';
import styles from './ScanScreen.module.css';

// Scan screen — see docs/scan-upload-requirements.md, docs/screens/scan-spec.md.
// Reuses QrUploadScreen's two-half layout unchanged in structure (confirmed
// in the spec), but the right half is a live status message rather than a
// received-files list — nothing is selectable on the kiosk itself for this
// service, since delivery happens entirely on the phone (Email/download
// link/Personal Account, "Delivery" in the requirements doc).
interface ScanScreenProps {
  /** The phone-facing scan URL to encode — null until App.tsx has created
   * the scan session and resolved the backend's LAN-facing base URL. */
  scanQrUrl: string | null;
  /** Polled scan session state (pages captured, delivery status) — null
   * until the first poll resolves. */
  scanSession: ScanSession | null;
  onRestart: () => void;
  onBack: () => void;
  onHome: () => void;
  onEndSession: (reason: EndSessionReason) => void;
  cartItems: PrintOrder[];
  onQuantityChange: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onProceedToPayment: (selectedItems: PrintOrder[]) => void;
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
  onBack,
  onHome,
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
}: ScanScreenProps) {
  const t = useTranslation();
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!scanQrUrl) return;
    let cancelled = false;
    QRCode.toDataURL(scanQrUrl).then((dataUrl) => {
      if (!cancelled) setQrImageUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [scanQrUrl]);

  function describeMethod(method: string): string {
    if (method === 'email') return t.scan.methodEmail;
    if (method === 'link') return t.scan.methodLink;
    if (method === 'account') return t.scan.methodAccount;
    return method;
  }

  const isDelivered = scanSession?.deliveredAt != null;
  const pageCount = scanSession?.pages.length ?? 0;
  const statusMessage = isDelivered
    ? t.scan.deliveredMessage((scanSession?.deliveryMethods ?? []).map(describeMethod).join(', '))
    : pageCount > 0
      ? t.scan.pageCountMessage(pageCount)
      : t.scan.waitingMessage;

  return (
    <KioskScreenLayout
      onEndSession={onEndSession}
      onBack={onBack}
      onHome={onHome}
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
        <div className={styles.qrHalf}>
          <div className={styles.qrBox} id="scan-qr-code">
            {qrImageUrl ? <img src={qrImageUrl} alt={t.scan.qrImageAlt} /> : t.scan.preparingQrCode}
          </div>
          <p className={styles.qrHint}>{t.scan.qrHint}</p>
          {/* Dev-only convenience, same as QrUploadScreen's own — not part of
              the confirmed screen design. */}
          {scanQrUrl && (
            <p className={styles.qrHint}>
              <a href={scanQrUrl} target="_blank" rel="noreferrer">
                {scanQrUrl}
              </a>
            </p>
          )}
        </div>

        <div className={styles.statusHalf} id="scan-status">
          <p className={styles.statusMessage}>{statusMessage}</p>
          {isDelivered && <Button id="scan-restart" label={t.scan.restart} onClick={onRestart} />}
        </div>
      </div>
    </KioskScreenLayout>
  );
}
