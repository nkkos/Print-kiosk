import { eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { receivedEmails, uploadedFiles } from './db/schema.js';
import { addFile } from './uploadStore.js';
import type { UploadedFile } from './uploadStore.js';

// Real, DB-backed store for inbound email (server/routes.ts's
// POST /api/email/incoming), keyed by the 8-character session-id prefix
// used in the kiosk's generated address (`upload-<prefix>@...` — see
// src/App.tsx). See README.md, "Database" — this used to be an in-memory Map.
//
// Attachments are registered through uploadStore.ts's addFile() (reused
// as-is, just keyed by prefix instead of a QR session id, with this email's
// id attached) so email attachments go through the exact same format/size
// validation and ClamAV scanning path QR already has — this store only
// tracks the email-specific bits (subject/body preview).

export interface ReceivedEmail {
  id: string;
  subject: string;
  bodyPreview: string;
  attachments: UploadedFile[];
}

export async function addEmail(
  prefix: string,
  subject: string,
  bodyPreview: string,
  attachments: { fileName: string; filePath: string }[],
): Promise<void> {
  const [email] = await db
    .insert(receivedEmails)
    .values({ prefix, subject, bodyPreview })
    .returning({ id: receivedEmails.id });

  await Promise.all(
    attachments.map(({ fileName, filePath }) => addFile(prefix, fileName, filePath, email.id)),
  );
}

export async function listEmails(prefix: string): Promise<ReceivedEmail[]> {
  const emails = await db
    .select({
      id: receivedEmails.id,
      subject: receivedEmails.subject,
      bodyPreview: receivedEmails.bodyPreview,
    })
    .from(receivedEmails)
    .where(eq(receivedEmails.prefix, prefix))
    .orderBy(receivedEmails.createdAt);

  const files = await db
    .select({
      id: uploadedFiles.id,
      fileName: uploadedFiles.fileName,
      status: uploadedFiles.status,
      emailId: uploadedFiles.emailId,
    })
    .from(uploadedFiles)
    .where(eq(uploadedFiles.sessionKey, prefix));

  return emails.map((email) => ({
    ...email,
    attachments: files
      .filter((file) => file.emailId === email.id)
      .map(({ id, fileName, status }) => ({
        id,
        fileName,
        status: status as UploadedFile['status'],
      })),
  }));
}
