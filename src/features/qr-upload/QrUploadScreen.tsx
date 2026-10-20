import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Camera, Link2, LoaderCircle, Settings2, Upload } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { FileRow } from '../../components/FileRow/FileRow';
import { StepList } from '../../components/StepList/StepList';
import { QrCard } from '../../components/QrCard/QrCard';
import { acceptedFormatsLabel, MAX_FILE_SIZE_MB } from '../../utils/fileLimits';
import { fileStatusLabel } from '../../utils/fileStatusLabel';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder, ReceivedFile } from '../../types/kiosk';
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
  onEndSession: (reason: EndSessionReason) => void;
  /** Current Cart contents — the footer's count and the End Session rule. */
  cartItems: PrintOrder[];
  /** Opens the order review screen — the footer's btn-cart. */
  onOpenCart: () => void;
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
}: QrUploadScreenProps) {
  const t = useTranslation();
  const hasReadyFiles = files.some((file) => file.status === 'ready');

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
        <h1 className={styles.title}>{t.qrUpload.title}</h1>
        <p className={styles.subtitle}>{t.qrUpload.subtitle}</p>
      </div>

      <div className={styles.body}>
        {/* Before any file: how to do it. Once files arrive: what they are
            and where they stand — the steps have done their job. */}
        <div className={styles.main}>
          {files.length === 0 ? (
            <>
              <StepList
                id="qr-steps"
                steps={[
                  {
                    icon: <Camera size={48} strokeWidth={1.5} />,
                    title: t.qrUpload.step1Title,
                    text: t.qrUpload.step1Text,
                  },
                  {
                    icon: <Link2 size={48} strokeWidth={1.5} />,
                    title: t.qrUpload.step2Title,
                    text: t.qrUpload.step2Text,
                  },
                  {
                    icon: <Upload size={48} strokeWidth={1.5} />,
                    title: t.qrUpload.step3Title,
                    text: t.qrUpload.step3Text,
                  },
                ]}
              />
              <p className={styles.formats}>
                {t.uploadMethodSelection.formatsHint(acceptedFormatsLabel(), MAX_FILE_SIZE_MB)}
              </p>
            </>
          ) : (
            <div className={styles.files}>
              <h2 className={styles.filesTitle}>{t.qrUpload.filesTitle}</h2>
              <div className={styles.list}>
                {files.map((file) => {
                  // A rejected file (docs/domain/kiosk-session.md, "File scanning
                  // status") stays visible with its reason, so nobody wonders
                  // whether their upload got stuck.
                  const statusLabel = fileStatusLabel(file.status, t.common);
                  return (
                    <FileRow
                      key={file.id}
                      id={`qr-file-${file.id}`}
                      fileName={file.fileName}
                      status={file.status}
                      statusLabel={statusLabel}
                      onConfigure={() => onFileSelect(file.id, file.fileName)}
                      configureLabel={t.common.configure}
                    />
                  );
                })}
              </div>
              <Button
                id="qr-configure-all"
                variant="primary"
                icon={<Settings2 size={26} strokeWidth={2} />}
                label={t.common.configureAllFiles}
                onClick={onConfigureAllFiles}
                disabled={!hasReadyFiles}
              />
            </div>
          )}
        </div>

        <QrCard
          id="qr-code"
          url={qrUploadUrl}
          alt={t.qrUpload.qrImageAlt}
          preparingLabel={t.qrUpload.preparingQrCode}
          caption={t.qrUpload.qrCaption}
          note={t.qrUpload.sessionOnly}
        >
          {files.length === 0 ? (
            <p className={styles.waiting} id="qr-waiting" role="status">
              <LoaderCircle className={styles.spin} size={28} aria-hidden="true" />
              {t.qrUpload.waiting}
            </p>
          ) : (
            <p className={styles.addMore}>{t.qrUpload.addMore}</p>
          )}
        </QrCard>
      </div>
    </KioskScreenLayout>
  );
}
