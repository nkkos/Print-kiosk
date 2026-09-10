import { randomUUID } from 'node:crypto';

// Deliberate, narrow exception to photo-kiosk's own "no photo pixel data is
// ever written server-side" rule (PhotoKioskApp.tsx) — confirmed with the
// product owner: getting a copy onto the customer's own device (email
// attachment, or a QR code their phone can download from) has no purely
// client-side way to work, since the kiosk's own browser tab can't act as a
// server a phone could reach. The compromise kept as narrow as possible:
// in-memory only (never touches disk or the database), one-time-use (a
// download consumes and deletes its entry immediately), and swept on a
// short TTL regardless, so a link nobody scans doesn't linger.
const SHARE_TTL_MS = 10 * 60 * 1000;

interface SharedPhoto {
  buffer: Buffer;
  mimeType: string;
  createdAt: number;
}

const shares = new Map<string, SharedPhoto>();

export function createShare(buffer: Buffer, mimeType: string): string {
  const token = randomUUID();
  shares.set(token, { buffer, mimeType, createdAt: Date.now() });
  return token;
}

/** One-time read — deletes the entry whether or not it was found, so a
 * token never serves the photo twice. */
export function consumeShare(token: string): SharedPhoto | null {
  const entry = shares.get(token);
  if (!entry) return null;
  shares.delete(token);
  return entry;
}

// Catches links that are generated (e.g. the QR code is shown) but never
// scanned — consumeShare alone wouldn't free those.
const sweepInterval = setInterval(() => {
  const cutoff = Date.now() - SHARE_TTL_MS;
  for (const [token, entry] of shares) {
    if (entry.createdAt < cutoff) shares.delete(token);
  }
}, 60 * 1000);
sweepInterval.unref();
