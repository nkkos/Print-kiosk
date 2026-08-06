import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { OptionCard } from '../../components/OptionCard/OptionCard';
import { Button } from '../../components/Button/Button';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { PrintOrder, ReceivedFile } from '../../types/kiosk';
import styles from './QrUploadScreen.module.css';

// QR upload screen — see docs/qr-upload-requirements.md. A single screen
// (unlike Email's two), split into a QR half and a received-files half: the
// user is standing at the kiosk waiting, so there's no separate "Next" step
// — they scan, upload from their phone, and watch files appear here. The
// list is flat (no grouping, unlike Email's per-message grouping, which
// doesn't apply since there's no equivalent of a "message").
//
// `files` (populated by App.tsx polling the real dev-only backend in
// server/) is owned by App.tsx, not here, so the same accumulated list
// survives this screen unmounting/remounting (e.g., after "Add to cart" and
// returning). The QR image itself is generated client-side (`qrcode`
// package) from `qrUploadUrl`, which App.tsx fetches from that backend.
interface QrUploadScreenProps {
  files: ReceivedFile[];
  /** The phone-facing upload URL to encode — null until App.tsx has fetched
   * it from the backend (docs/qr-upload-requirements.md). */
  qrUploadUrl: string | null;
  onFileSelect: (fileId: string, fileName: string) => void;
  /** Configures every currently-selectable (scanned) uploaded file, one
   * after another (docs/personal-account-requirements.md, "Batch
   * configure") — an alternative to picking one file at a time. */
  onConfigureAllFiles: () => void;
  onBack: () => void;
  onHome: () => void;
  onEndSession: () => void;
  /** Current Cart contents, shown in the btn-cart popup. */
  cartItems: PrintOrder[];
  onQuantityChange: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onProceedToPayment: (selectedItems: PrintOrder[]) => void;
  cartOpenOnMount?: boolean;
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

export function QrUploadScreen({
  files,
  qrUploadUrl,
  onFileSelect,
  onConfigureAllFiles,
  onBack,
  onHome,
  onEndSession,
  cartItems,
  onQuantityChange,
  onRemoveItem,
  onProceedToPayment,
  cartOpenOnMount,
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
}: QrUploadScreenProps) {
  const t = useTranslation();
  const hasReadyFiles = files.some((file) => file.status === 'ready');
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!qrUploadUrl) return;
    let cancelled = false;
    QRCode.toDataURL(qrUploadUrl).then((dataUrl) => {
      if (!cancelled) setQrImageUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [qrUploadUrl]);

  return (
    <KioskScreenLayout
      onEndSession={onEndSession}
      onBack={onBack}
      onHome={onHome}
      cartItems={cartItems}
      onQuantityChange={onQuantityChange}
      onRemoveItem={onRemoveItem}
      onProceedToPayment={onProceedToPayment}
      initialCartOpen={cartOpenOnMount}
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
          <div className={styles.qrBox}>
            {qrImageUrl ? (
              <img src={qrImageUrl} alt={t.qrUpload.qrImageAlt} />
            ) : (
              t.qrUpload.preparingQrCode
            )}
          </div>
          <p className={styles.qrHint}>{t.qrUpload.qrHint}</p>
          {/* Dev-only convenience: lets the exact same-session URL be opened
              directly (e.g. from a phone browser, or copy-pasted) without
              needing a QR scanner — useful while debugging network
              reachability (docs/qr-upload-requirements.md). Not part of the
              confirmed screen design. */}
          {qrUploadUrl && (
            <p className={styles.qrHint}>
              <a href={qrUploadUrl} target="_blank" rel="noreferrer">
                {qrUploadUrl}
              </a>
            </p>
          )}
        </div>

        <div className={styles.filesHalf}>
          {files.length === 0 ? (
            <p className={styles.waiting}>{t.qrUpload.waitingForFiles}</p>
          ) : (
            <div className={styles.list}>
              {files.map((file) => {
                const isReady = file.status === 'ready';
                // 'rejected' (docs/domain/kiosk-session.md, "File scanning
                // status") stays visible rather than disappearing, so the
                // user isn't left wondering whether their upload got stuck.
                const description =
                  file.status === 'ready'
                    ? t.common.tapToConfigurePrinting
                    : file.status === 'rejected'
                      ? t.common.blockedVirusScan
                      : file.status === 'converting'
                        ? t.common.preparingForPrint
                        : t.common.scanningForViruses;
                return (
                  <OptionCard
                    key={file.id}
                    id={`qr-file-${file.id}`}
                    title={file.fileName}
                    description={description}
                    onActivate={isReady ? () => onFileSelect(file.id, file.fileName) : undefined}
                    disabled={!isReady}
                  />
                );
              })}
            </div>
          )}

          <Button
            id="qr-configure-all"
            label={t.common.configureAllFiles}
            onClick={onConfigureAllFiles}
            disabled={!hasReadyFiles}
          />
        </div>
      </div>
    </KioskScreenLayout>
  );
}
