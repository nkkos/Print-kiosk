import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { getUploadConfig } from '../../services/qrUploadApi';

// The portal's real, phone-reachable register.html URL, QR-encoded for
// LoginPanel's "Register" option — registration itself only ever happens on
// the portal, from the user's own device (docs/personal-account-requirements.md).
// Extracted once a second consumer (UploadMethodSelectionScreen's own
// upload-method-account login popup, alongside KioskScreenLayout's footer
// login popup) needed the identical fetch — same extraction rule as
// docs/implementation/project-architecture.md, Section 9.
export function useRegisterQrImageUrl(): string | null {
  const [registerQrImageUrl, setRegisterQrImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUploadConfig().then(({ portalUrl }) => {
      if (cancelled) return;
      QRCode.toDataURL(`${portalUrl}/portal/register.html`).then((dataUrl) => {
        if (!cancelled) setRegisterQrImageUrl(dataUrl);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return registerQrImageUrl;
}
