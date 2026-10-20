import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck } from 'lucide-react';
import { DevOnly } from '../DevOnly/DevOnly';
import styles from './QrCard.module.css';

// The QR code a phone scans to carry on there — QR upload, scan and copy
// (2026-10 redesign): the code, what to do with it, that it's only good for
// this session, and a live status line underneath (`children`). Extracted
// once the third screen needed it.
interface QrCardProps {
  id?: string;
  /** The phone-facing URL to encode — null while it's still being prepared. */
  url: string | null;
  alt: string;
  preparingLabel: string;
  caption: string;
  note: string;
  children?: ReactNode;
}

export function QrCard({ id, url, alt, preparingLabel, caption, note, children }: QrCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url).then((dataUrl) => {
      if (!cancelled) setImageUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <aside className={styles.root}>
      <div className={styles.qrBox} id={id}>
        {imageUrl ? (
          <img src={imageUrl} alt={alt} />
        ) : (
          <span className={styles.preparing}>{preparingLabel}</span>
        )}
      </div>
      <p className={styles.caption}>{caption}</p>
      <p className={styles.note}>
        <ShieldCheck size={24} strokeWidth={2} aria-hidden="true" />
        {note}
      </p>
      {children}
      {/* Opens the same page without a phone — handy while debugging network
          reachability (docs/qr-upload-requirements.md). */}
      {url && (
        <DevOnly>
          <a href={url} target="_blank" rel="noreferrer">
            phone link
          </a>
        </DevOnly>
      )}
    </aside>
  );
}
