import { useState } from 'react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { ChevronRight, LoaderCircle, Mail, Settings2 } from 'lucide-react';
import { Button } from '../../components/Button/Button';
import { FileRow } from '../../components/FileRow/FileRow';
import { fileStatusLabel } from '../../utils/fileStatusLabel';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder, ReceivedEmail } from '../../types/kiosk';
import styles from './EmailFileListScreen.module.css';

// Second Email upload screen — see docs/email-upload-requirements.md.
// Shows received emails (not a flat file list): the user may send several
// emails, and each email's subject/body can carry information useful for
// telling files apart, so opening an email in a popup to see its attachments
// is more legible than one merged file list. Attachments are still
// configured individually as separate Print Orders regardless of which
// email they came from — this grouping is for navigation only, not a new
// print-order concept.
//
// Real emails arrive via server/emailStore.ts (docs/email-upload-requirements.md)
// and are polled for by App.tsx, which owns `emails` (not locally here) since
// this screen unmounts/remounts on every navigation away and back (e.g.,
// after "Add to cart") and polling must keep running regardless.
interface EmailFileListScreenProps {
  onFileSelect: (fileId: string, fileName: string) => void;
  /** Configures every currently-selectable (scanned) attachment across every
   * received email, one after another (docs/personal-account-requirements.md,
   * "Batch configure") — an alternative to picking one file at a time. */
  onConfigureAllFiles: () => void;
  onBack: () => void;
  onHome: () => void;
  onEndSession: (reason: EndSessionReason) => void;
  /** Received emails, each attachment carrying its own scanning status
   * (docs/domain/kiosk-session.md, "File scanning status"). */
  emails: ReceivedEmail[];
  /** The session's address — repeated while nothing has arrived yet. */
  emailAddress: string;
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

export function EmailFileListScreen({
  onFileSelect,
  onConfigureAllFiles,
  onBack,
  onHome,
  onEndSession,
  emails,
  emailAddress,
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
}: EmailFileListScreenProps) {
  const t = useTranslation();
  const [openEmailId, setOpenEmailId] = useState<string | null>(null);
  // The newest e-mail is open until the customer picks another — the
  // attachments are what they came for.
  const openEmail = emails.find((email) => email.id === openEmailId) ?? emails[0] ?? null;
  const hasReadyAttachments = emails.some((email) =>
    email.attachments.some((attachment) => attachment.status === 'ready'),
  );

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
        <h1 className={styles.title}>{t.emailFileList.title}</h1>
        <p className={styles.subtitle}>{t.emailFileList.subtitle}</p>
      </div>

      {emails.length === 0 ? (
        // Nothing yet: say we're waiting, and where to send it, in case the
        // customer pressed "sent" before actually sending.
        <div className={styles.waitingCard} id="email-waiting" role="status">
          <LoaderCircle className={styles.spin} size={56} strokeWidth={1.75} aria-hidden="true" />
          <p className={styles.waitingTitle}>{t.emailFileList.waiting}</p>
          <p className={styles.waitingHint}>{t.emailFileList.waitingHint}</p>
          <p className={styles.address}>{emailAddress}</p>
        </div>
      ) : (
        <div className={styles.body}>
          {/* Grouped by e-mail (docs/email-upload-requirements.md): subject and
              text help tell files apart; each attachment is still its own
              print order. */}
          <section className={styles.messages}>
            <h2 className={styles.panelTitle}>{t.emailFileList.messagesTitle}</h2>
            {emails.map((email) => (
              <button
                type="button"
                key={email.id}
                id={`email-item-${email.id}`}
                className={styles.message}
                data-selected={email.id === openEmail?.id || undefined}
                onClick={() => setOpenEmailId(email.id)}
              >
                <Mail size={30} strokeWidth={1.75} aria-hidden="true" />
                <span className={styles.messageText}>
                  <span className={styles.messageSubject}>
                    {email.subject || t.emailFileList.noSubject}
                  </span>
                  <span className={styles.messageCount}>
                    {t.emailFileList.attachmentCount(email.attachments.length)}
                  </span>
                </span>
                <ChevronRight size={28} strokeWidth={2} aria-hidden="true" />
              </button>
            ))}
          </section>

          <section className={styles.attachments}>
            <h2 className={styles.panelTitle}>
              {openEmail ? openEmail.subject || t.emailFileList.noSubject : ''}
            </h2>
            {openEmail && openEmail.attachments.length === 0 && (
              <p className={styles.empty}>{t.emailFileList.noAttachments}</p>
            )}
            <div className={styles.attachmentList}>
              {openEmail?.attachments.map((attachment) => (
                <FileRow
                  key={attachment.id}
                  id={`email-attachment-${attachment.id}`}
                  fileName={attachment.fileName}
                  status={attachment.status}
                  statusLabel={fileStatusLabel(attachment.status, t.common)}
                  onConfigure={() => onFileSelect(attachment.id, attachment.fileName)}
                  configureLabel={t.common.configure}
                />
              ))}
            </div>
            <Button
              id="email-configure-all"
              variant="primary"
              icon={<Settings2 size={26} strokeWidth={2} />}
              label={t.common.configureAllFiles}
              onClick={onConfigureAllFiles}
              disabled={!hasReadyAttachments}
            />
          </section>
        </div>
      )}
    </KioskScreenLayout>
  );
}
