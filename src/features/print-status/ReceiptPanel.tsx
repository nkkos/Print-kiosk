import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from '../../i18n';
import { getPayment, type Payment } from '../../services/paymentApi';
import styles from './PrintStatusScreen.module.css';

// The eKasa receipt of the payment that's printing now
// (docs/payments-business-requirements.md, "Receipts"), shown while the
// customer waits for their documents: the QR code that opens it on their
// phone, or a line saying it went by e-mail / comes out of the receipt
// printer. Polls the payment until the register has issued the receipt.

const POLL_INTERVAL_MS = 2000;

export function ReceiptPanel({ paymentId }: { paymentId: string }) {
  const t = useTranslation();
  const [receipt, setReceipt] = useState<Payment['receipt']>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const issued = receipt?.url != null;

  useEffect(() => {
    if (issued) return;
    let cancelled = false;
    const poll = () =>
      getPayment(paymentId)
        .then((payment) => {
          if (!cancelled) setReceipt(payment.receipt);
        })
        .catch(() => {});
    void poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [paymentId, issued]);

  useEffect(() => {
    if (receipt?.delivery !== 'qr' || !receipt.url) return;
    let cancelled = false;
    QRCode.toDataURL(receipt.url).then((dataUrl) => {
      if (!cancelled) setQrImageUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [receipt?.delivery, receipt?.url]);

  if (!receipt) return null;
  if (!issued) return <p className={styles.receiptNote}>{t.printStatus.receiptPending}</p>;
  if (receipt.delivery === 'email') {
    return <p className={styles.receiptNote}>{t.printStatus.receiptEmailed}</p>;
  }
  if (receipt.delivery === 'paper') {
    return <p className={styles.receiptNote}>{t.printStatus.receiptPaper}</p>;
  }
  return (
    <div className={styles.receipt} id="print-receipt-qr">
      <p className={styles.receiptNote}>{t.printStatus.receiptQr}</p>
      {qrImageUrl && <img src={qrImageUrl} alt={t.printStatus.receiptQr} />}
    </div>
  );
}
