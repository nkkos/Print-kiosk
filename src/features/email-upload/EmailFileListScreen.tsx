import { useState } from 'react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { OptionCard } from '../../components/OptionCard/OptionCard';
import { Modal } from '../../components/Modal/Modal';
import { Button } from '../../components/Button/Button';
import { MOCK_EMAILS } from './mockEmails';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { PrintOrder } from '../../types/kiosk';
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
// Prototype simplification: mock emails are always "received" the instant
// this screen is reached — no real inbound-email backend. Each attachment
// still passes through the shared antivirus-scanning status
// (docs/domain/kiosk-session.md, "File scanning status") — `readyAttachments`
// is owned by App.tsx (not locally here), since this screen unmounts/remounts
// on every navigation away and back (e.g., after "Add to cart"), and an
// already-scanned file must not restart scanning just because the screen
// remounted.
interface EmailFileListScreenProps {
  onFileSelect: (fileName: string) => void;
  /** Configures every currently-selectable (scanned) attachment across every
   * received email, one after another (docs/personal-account-requirements.md,
   * "Batch configure") — an alternative to picking one file at a time. */
  onConfigureAllFiles: () => void;
  onBack: () => void;
  onHome: () => void;
  onEndSession: () => void;
  /** Attachments that have finished antivirus scanning and can be selected. */
  readyAttachments: ReadonlySet<string>;
  /** Current Cart contents, shown in the btn-cart popup. */
  cartItems: PrintOrder[];
  /** Adjusts a Cart item's quantity (docs/cart-requirements.md). */
  onQuantityChange: (id: string, quantity: number) => void;
  /** Removes a Cart item entirely (docs/cart-requirements.md). */
  onRemoveItem: (id: string) => void;
  /** Navigates to the Payment Status screen with the checked Cart items. */
  onProceedToPayment: (selectedItems: PrintOrder[]) => void;
  /** Opens the Cart popup as soon as this screen mounts — set right after
   * "Add to cart" so the user sees what was just added. */
  cartOpenOnMount?: boolean;
  isConnectionLost: boolean;
  onSimulateConnectionLost: () => void;
  onSimulateConnectionRestored: () => void;
  onLogin: (username: string) => void;
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
  readyAttachments,
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
}: EmailFileListScreenProps) {
  const t = useTranslation();
  const [openEmailId, setOpenEmailId] = useState<string | null>(null);
  const openEmail = MOCK_EMAILS.find((email) => email.id === openEmailId) ?? null;

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
        <p className={styles.instruction}>{t.emailFileList.instruction}</p>
        <div className={styles.list}>
          {MOCK_EMAILS.map((email) => (
            <OptionCard
              key={email.id}
              id={`email-item-${email.id}`}
              title={email.subject}
              description={t.emailFileList.attachmentCount(email.attachments.length)}
              onActivate={() => setOpenEmailId(email.id)}
            />
          ))}
        </div>

        <Button
          id="email-configure-all"
          label={t.common.configureAllFiles}
          onClick={onConfigureAllFiles}
          disabled={readyAttachments.size === 0}
        />
      </div>

      {openEmail && (
        <Modal onClose={() => setOpenEmailId(null)}>
          <h2 className={styles.emailSubject}>{openEmail.subject}</h2>
          <p className={styles.emailBody}>{openEmail.bodyPreview}</p>
          <div className={styles.attachments}>
            {openEmail.attachments.map((fileName) => {
              const isReady = readyAttachments.has(fileName);
              return (
                <OptionCard
                  key={fileName}
                  id={`email-attachment-${fileName}`}
                  title={fileName}
                  description={
                    isReady ? t.common.tapToConfigurePrinting : t.common.scanningForViruses
                  }
                  onActivate={isReady ? () => onFileSelect(fileName) : undefined}
                  disabled={!isReady}
                />
              );
            })}
          </div>
        </Modal>
      )}
    </KioskScreenLayout>
  );
}
