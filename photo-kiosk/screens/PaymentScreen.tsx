import type { PhotoCartItem } from '../types';
import { formatPrice } from '../pricing';

interface PaymentScreenProps {
  /** The checked subset from the Cart (docs/cart-requirements.md, "Selection
   * for payment") — not the whole cart; unchecked items stay behind. */
  items: PhotoCartItem[];
  onPaymentSuccess: () => void;
  onCancelPayment: () => void;
  isRecording: boolean;
}

// Mirrors src/features/payment-status/PaymentStatusScreen.tsx's exact current
// fidelity — one manual "Simulate payment success" button, no backend call
// until success (only then does a photoOrders row get written, per
// docs/domain/kiosk-session.md's "delete content, retain fact" principle).
// End Session is hidden throughout this screen (see PhotoKioskApp.tsx passing
// sessionActive={false} for 'payment'/'print') — the transaction is committed
// from the moment this screen is reached, same rule as the main kiosk.
export function PaymentScreen({
  items,
  onPaymentSuccess,
  onCancelPayment,
  isRecording,
}: PaymentScreenProps) {
  const totalCopies = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  return (
    <div className="pk-screen pk-screen-center" id="view-payment">
      <h1 className="pk-title">Оплата</h1>
      <p className="pk-form-hint">
        {items.length} {items.length === 1 ? 'позиция' : 'позиции'}, копий: {totalCopies}
      </p>
      <p className="pk-cart-total">{formatPrice(totalCents)}</p>
      <div className="pk-hero-actions">
        <button
          type="button"
          className="pk-btn pk-btn-ghost"
          id="payment-cancel"
          onClick={onCancelPayment}
          disabled={isRecording}
        >
          Отменить
        </button>
        <button
          type="button"
          className="pk-btn pk-btn-primary"
          id="payment-simulate-success"
          onClick={onPaymentSuccess}
          disabled={isRecording}
        >
          {isRecording ? 'Обрабатываем…' : 'Симулировать успешную оплату'}
        </button>
      </div>
    </div>
  );
}
