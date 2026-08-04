import { randomUUID } from 'node:crypto';
import { addFile, listFiles } from './uploadStore.js';
import type { UploadedFile } from './uploadStore.js';

// In-memory store for real inbound email (server/routes.ts's
// POST /api/email/incoming), keyed by the 8-character session-id prefix
// used in the kiosk's generated address (`upload-<prefix>@...` — see
// src/App.tsx). Dev-only backend, same "nothing survives a restart"
// tradeoff as server/uploadStore.ts.
//
// Attachments are registered through uploadStore.ts's addFile()/listFiles()
// (reused as-is, just keyed by prefix instead of a QR session id) so email
// attachments go through the exact same format/size validation and ClamAV
// scanning path QR already has — this store only tracks the email-specific
// bits (subject/body preview) and which attachment ids belong to which email.

interface EmailRecord {
  id: string;
  subject: string;
  bodyPreview: string;
  attachmentIds: string[];
}

export interface ReceivedEmail {
  id: string;
  subject: string;
  bodyPreview: string;
  attachments: UploadedFile[];
}

const emailsByPrefix = new Map<string, EmailRecord[]>();

export function addEmail(
  prefix: string,
  subject: string,
  bodyPreview: string,
  attachments: { fileName: string; filePath: string }[],
): void {
  const attachmentIds = attachments.map(
    ({ fileName, filePath }) => addFile(prefix, fileName, filePath).id,
  );
  const email: EmailRecord = { id: randomUUID(), subject, bodyPreview, attachmentIds };
  const existing = emailsByPrefix.get(prefix) ?? [];
  emailsByPrefix.set(prefix, [...existing, email]);
}

export function listEmails(prefix: string): ReceivedEmail[] {
  const emails = emailsByPrefix.get(prefix) ?? [];
  const filesById = new Map(listFiles(prefix).map((file) => [file.id, file]));
  return emails.map(({ id, subject, bodyPreview, attachmentIds }) => ({
    id,
    subject,
    bodyPreview,
    attachments: attachmentIds
      .map((fileId) => filesById.get(fileId))
      .filter((file): file is UploadedFile => file !== undefined),
  }));
}
