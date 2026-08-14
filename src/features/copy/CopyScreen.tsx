import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder, ReceivedFile } from '../../types/kiosk';
import type { CopySession } from '../../services/copyApi';
import styles from './CopyScreen.module.css';

// Copy screen — see docs/copy-upload-requirements.md, docs/screens/copy-spec.md.
// Reuses Scan's own kiosk-screen layout unchanged in structure, but the
// right half ends in a "Ready" state offering configure-printing/another-
// document instead of a delivery confirmation — nothing is ever delivered
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
  /** Opens the Cart popup as soon as this screen mounts — set after "Add to
   * cart" from Print Order Configuration, same pattern as every other
   * source screen (docs/screens/copy-spec.md, "Confirmed flow ordering"). */
  cartOpenOnMount?: boolean;
  onConfigurePrinting: () => void;
  onAnotherDocument: () => void;
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

export function CopyScreen({
  copyQrUrl,
  copySession,
  resultFileStatus,
  cartOpenOnMount,
  onConfigurePrinting,
  onAnotherDocument,
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
}: CopyScreenProps) {
  const t = useTranslation();
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!copyQrUrl) return;
    let cancelled = false;
    QRCode.toDataURL(copyQrUrl).then((dataUrl) => {
      if (!cancelled) setQrImageUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [copyQrUrl]);

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
  const statusMessage = hasResultFile
    ? isPrintable
      ? t.copy.readyMessage(copySession?.resultPageCount ?? 0)
      : resultStatusMessage
    : inProgressPageCount > 0
      ? t.copy.pageCountMessage(inProgressPageCount)
      : t.copy.waitingMessage;

  return (
    <KioskScreenLayout
      onEndSession={onEndSession}
      onBack={onBack}
      onHome={onHome}
      initialCartOpen={cartOpenOnMount}
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
          <div className={styles.qrBox} id="copy-qr-code">
            {qrImageUrl ? <img src={qrImageUrl} alt={t.copy.qrImageAlt} /> : t.copy.preparingQrCode}
          </div>
          <p className={styles.qrHint}>{t.copy.qrHint}</p>
          {/* Dev-only convenience, same as ScanScreen's own — not part of
              the confirmed screen design. */}
          {copyQrUrl && (
            <p className={styles.qrHint}>
              <a href={copyQrUrl} target="_blank" rel="noreferrer">
                {copyQrUrl}
              </a>
            </p>
          )}
        </div>

        <div className={styles.statusHalf} id="copy-status">
          <p className={styles.statusMessage}>{statusMessage}</p>
          {hasResultFile && (
            <>
              <Button
                id="copy-configure-printing"
                label={t.copy.configurePrinting}
                onClick={onConfigurePrinting}
                disabled={!isPrintable}
              />
              <Button
                id="copy-another-document"
                label={t.copy.anotherDocument}
                onClick={onAnotherDocument}
              />
            </>
          )}
        </div>
      </div>
    </KioskScreenLayout>
  );
}
