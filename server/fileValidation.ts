// Confirmed, shared across every upload method — see
// docs/domain/kiosk-session.md, "File format and size limits". QR is the
// only method with a real backend so far, so this is enforced here only.

import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

export const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.heic'];
// Subset of ACCEPTED_EXTENSIONS that pdf-to-printer (SumatraPDF-based,
// server/printerAdapter.ts) can actually print directly — .doc/.docx/.heic
// fall back to the placeholder document instead (no document-conversion
// pipeline; see docs/domain/kiosk-session.md, "Related entities").
export const PRINTABLE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/** The name an uploaded file gets on disk: a random id plus its extension,
 * nothing else from the sender. Uploads come from anyone — a phone page or
 * an e-mail to the session's address — and a name like "../../x" or one
 * with characters a file system refuses must never become part of a path.
 * The original name is stored separately for display. */
export function diskFileName(originalName: string): string {
  const extension = extname(originalName).toLowerCase();
  return `${randomUUID()}${/^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ''}`;
}

export function hasAcceptedExtension(fileName: string): boolean {
  const lowerCased = fileName.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lowerCased.endsWith(extension));
}

export function hasPrintableExtension(fileName: string): boolean {
  const lowerCased = fileName.toLowerCase();
  return PRINTABLE_EXTENSIONS.some((extension) => lowerCased.endsWith(extension));
}

// multer/busboy decode multipart filenames as latin1 by default (the
// multipart spec predates a standard way to declare a filename's charset) —
// re-decoding those bytes as UTF-8 recovers non-Latin names (e.g. Cyrillic)
// instead of showing mojibake. Only a name that really is latin1-decoded
// UTF-8 is touched: one that already holds characters beyond latin1 (an
// e-mail attachment, which mailparser decodes properly), or whose bytes
// aren't valid UTF-8 (a genuine "Café.pdf"), is returned as it came.
export function decodeOriginalName(name: string): string {
  if ([...name].some((char) => char.charCodeAt(0) > 0xff)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}
