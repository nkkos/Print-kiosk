// Shared mock content for the Email upload flow — extracted out of
// EmailFileListScreen so App.tsx can also derive the flat list of attachment
// names (needed to drive the antivirus-scanning timer, docs/domain/kiosk-session.md,
// "File scanning status").
export interface ReceivedEmail {
  id: string;
  subject: string;
  bodyPreview: string;
  attachments: string[];
}

export const MOCK_EMAILS: ReceivedEmail[] = [
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

export const ALL_EMAIL_ATTACHMENT_NAMES: string[] = MOCK_EMAILS.flatMap(
  (email) => email.attachments,
);
