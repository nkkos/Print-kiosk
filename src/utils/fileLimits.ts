// The confirmed file format and size limits (docs/domain/kiosk-session.md,
// "File format and size limits") — enforced by the backend
// (server/fileValidation.ts, which imports these), shown to the customer by
// the kiosk so nobody tries a format that will be refused.
export const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.heic'];
export const MAX_FILE_SIZE_MB = 20;

/** "PDF, DOC, DOCX, JPG, PNG, HEIC" — .jpeg folded into JPG. */
export function acceptedFormatsLabel(): string {
  return ACCEPTED_EXTENSIONS.filter((ext) => ext !== '.jpeg')
    .map((ext) => ext.slice(1).toUpperCase())
    .join(', ');
}
