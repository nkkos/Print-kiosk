import { useState } from 'react';
import type { FormEvent } from 'react';
import QRCode from 'qrcode';
import { sharePhotoByEmail, createPhotoShareLink, getKioskConfig } from '../services/photoKioskApi';

interface PhotoShareSectionProps {
  idPrefix: string;
  label: string;
  photoDataUrl: string;
}

type EmailStatus = 'idle' | 'sending' | 'sent' | 'error';
type LinkStatus = 'idle' | 'loading' | 'ready' | 'error';

// "Send me a copy" (docs/photo-kiosk-requirements.md) — offered once per
// printed item on FinalisingSessionScreen. Both delivery paths send the
// photo bytes through the backend transiently (server/photoShareStore.ts
// explains the narrow, deliberate exception to photo-kiosk's usual
// no-server-side-photo-content rule) — there's no purely client-side way to
// get a copy onto the customer's own device, since the kiosk's own browser
// tab can't act as a server a phone could reach.
export function PhotoShareSection({ idPrefix, label, photoDataUrl }: PhotoShareSectionProps) {
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<EmailStatus>('idle');
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<LinkStatus>('idle');

  async function handleSendEmail(e: FormEvent) {
    e.preventDefault();
    setEmailStatus('sending');
    try {
      await sharePhotoByEmail(email, photoDataUrl);
      setEmailStatus('sent');
    } catch {
      setEmailStatus('error');
    }
  }

  async function handleShowQr() {
    setLinkStatus('loading');
    try {
      const [token, config] = await Promise.all([
        createPhotoShareLink(photoDataUrl),
        getKioskConfig(),
      ]);
      const downloadUrl = `${config.lanUploadUrl}/api/photo-kiosk/share-link/${token}`;
      const qrDataUrl = await QRCode.toDataURL(downloadUrl);
      setQrImageUrl(qrDataUrl);
      setLinkStatus('ready');
    } catch {
      setLinkStatus('error');
    }
  }

  return (
    <div className="pk-share-section" id={`${idPrefix}-share`}>
      <p className="pk-share-label">{label}</p>

      <form className="pk-share-email-form" onSubmit={handleSendEmail}>
        <input
          type="email"
          className="pk-input"
          id={`${idPrefix}-share-email-input`}
          placeholder="Ваш email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button
          type="submit"
          className="pk-btn pk-btn-ghost"
          id={`${idPrefix}-share-email-submit`}
          disabled={emailStatus === 'sending'}
        >
          {emailStatus === 'sending' ? 'Отправляем…' : 'Отправить на email'}
        </button>
      </form>
      {emailStatus === 'sent' && (
        <p className="pk-form-hint" id={`${idPrefix}-share-email-sent`}>
          Отправлено!
        </p>
      )}
      {emailStatus === 'error' && (
        <p className="pk-error" id={`${idPrefix}-share-email-error`}>
          Не удалось отправить. Попробуйте ещё раз.
        </p>
      )}

      <button
        type="button"
        className="pk-btn pk-btn-ghost"
        id={`${idPrefix}-share-qr-button`}
        onClick={handleShowQr}
        disabled={linkStatus === 'loading'}
      >
        {linkStatus === 'loading' ? 'Готовим QR-код…' : 'Скачать по QR-коду'}
      </button>
      {qrImageUrl && (
        <div className="pk-share-qr" id={`${idPrefix}-share-qr`}>
          <img src={qrImageUrl} alt="QR-код для скачивания фото" />
          <p className="pk-form-hint">
            Отсканируйте телефоном, чтобы скачать фото. Ссылка одноразовая.
          </p>
        </div>
      )}
      {linkStatus === 'error' && (
        <p className="pk-error" id={`${idPrefix}-share-qr-error`}>
          Не удалось подготовить ссылку. Попробуйте ещё раз.
        </p>
      )}
    </div>
  );
}
