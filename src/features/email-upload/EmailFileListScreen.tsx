import { useState } from 'react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { OptionCard } from '../../components/OptionCard/OptionCard';
import { Modal } from '../../components/Modal/Modal';
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
// this screen is reached — no real inbound-email backend and no
// antivirus-scan state yet (docs/domain/kiosk-session.md, Open items).
interface ReceivedEmail {
  id: string;
  subject: string;
  bodyPreview: string;
  attachments: string[];
}

const MOCK_EMAILS: ReceivedEmail[] = [
  {
    id: 'email-1',
    subject: 'Contract for signing',
    bodyPreview: 'Please find the contract attached. Two copies needed for signature.',
    attachments: ['contract.pdf'],
  },
  {
    id: 'email-2',
    subject: 'Photos for the album',
    bodyPreview: 'Here are the photos we picked out — could you print all of them?',
    attachments: ['photo-1.jpg', 'photo-2.jpg'],
  },
];

interface EmailFileListScreenProps {
  onFileSelect: (fileName: string) => void;
  onBack: () => void;
  onHome: () => void;
  onEndSession: () => void;
  /** Current Cart contents, shown in the btn-cart popup. */
  cartItems: PrintOrder[];
  /** Navigates to the Payment Status screen from the Cart popup. */
  onProceedToPayment: () => void;
}

export function EmailFileListScreen({
  onFileSelect,
  onBack,
  onHome,
  onEndSession,
  cartItems,
  onProceedToPayment,
}: EmailFileListScreenProps) {
  const [openEmailId, setOpenEmailId] = useState<string | null>(null);
  const openEmail = MOCK_EMAILS.find((email) => email.id === openEmailId) ?? null;

  return (
    <KioskScreenLayout
      onEndSession={onEndSession}
      onBack={onBack}
      onHome={onHome}
      cartItems={cartItems}
      onProceedToPayment={onProceedToPayment}
    >
      <div className={styles.body}>
        <p className={styles.instruction}>Select an email to see its attachments</p>
        <div className={styles.list}>
          {MOCK_EMAILS.map((email) => (
            <OptionCard
              key={email.id}
              id={`email-item-${email.id}`}
              title={email.subject}
              description={`${email.attachments.length} attachment(s)`}
              onActivate={() => setOpenEmailId(email.id)}
            />
          ))}
        </div>
      </div>

      {openEmail && (
        <Modal onClose={() => setOpenEmailId(null)}>
          <h2 className={styles.emailSubject}>{openEmail.subject}</h2>
          <p className={styles.emailBody}>{openEmail.bodyPreview}</p>
          <div className={styles.attachments}>
            {openEmail.attachments.map((fileName) => (
              <OptionCard
                key={fileName}
                id={`email-attachment-${fileName}`}
                title={fileName}
                description="Tap to configure printing"
                onActivate={() => onFileSelect(fileName)}
              />
            ))}
          </div>
        </Modal>
      )}
    </KioskScreenLayout>
  );
}
