// Confirmed, shared across every upload method — see
// docs/domain/kiosk-session.md, "File format and size limits". QR is the
// only method with a real backend so far, so this is enforced here only.

export const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.heic'];
export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function hasAcceptedExtension(fileName: string): boolean {
  const lowerCased = fileName.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lowerCased.endsWith(extension));
}

// multer/busboy decode multipart filenames as latin1 by default (the
// multipart spec predates a standard way to declare a filename's charset) —
// re-decoding those bytes as UTF-8 recovers non-Latin names (e.g. Cyrillic)
// instead of showing mojibake. Safe to run on ASCII-only names too (no-op).
export function decodeOriginalName(name: string): string {
  return Buffer.from(name, 'latin1').toString('utf8');
}
