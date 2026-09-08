import { useState } from 'react';
import type { PhotoCartItem } from '../types';
import { formatPrice } from '../pricing';

// Mirrors src/components/CartPanel/CartPanel.tsx's exact logic (selection
// state, "checked = will be paid for now, unchecked stays behind" —
// docs/cart-requirements.md's "Selection for payment") — forked, not
// imported, for the same reasoning as every other photo-kiosk shell piece
// (see PhotoKioskLayout.tsx's own comment). Interactive controls (checkbox,
// quantity stepper, remove, "Оплатить") only appear when their corresponding
// callback is supplied — omit all three for a read-only summary.
interface CartPanelProps {
  items: PhotoCartItem[];
  onQuantityChange?: (id: string, quantity: number) => void;
  onRemove?: (id: string) => void;
  onProceedToPayment?: (selectedItems: PhotoCartItem[]) => void;
}

export function CartPanel({
  items,
  onQuantityChange,
  onRemove,
  onProceedToPayment,
}: CartPanelProps) {
  // Defaults to "all checked" — this component only ever mounts fresh each
  // time the Cart popup opens (docs/cart-requirements.md, "Selection state
  // is not persisted").
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(items.map((item) => item.id)),
  );

  if (items.length === 0) {
    return <p className="pk-empty-note">Корзина пуста.</p>;
  }

  const isSelectable = Boolean(onProceedToPayment);
  const relevantItems = isSelectable ? items.filter((item) => selectedIds.has(item.id)) : items;
  const totalCopies = relevantItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalCents = relevantItems.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <>
      <ul className="pk-cart-list" id="cart-items">
        {items.map((item) => (
          <li key={item.id} className="pk-cart-item">
            <img src={item.sheetPreviewDataUrl} alt={item.spec.label} className="pk-cart-thumb" />
            <div className="pk-cart-item-body">
              <div className="pk-cart-item-head">
                {isSelectable && (
                  <input
                    type="checkbox"
                    id={`cart-item-${item.id}-select`}
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                  />
                )}
                <span className="pk-cart-item-title">{item.spec.label}</span>
              </div>
              <div className="pk-cart-item-meta">{item.photosPerSheet} фото на листе А4</div>
              <div className="pk-cart-item-actions">
                {onQuantityChange ? (
                  <div className="pk-qty-stepper">
                    <span className="pk-qty-label">Копий:</span>
                    <button
                      type="button"
                      className="pk-qty-btn"
                      id={`cart-item-${item.id}-decrease`}
                      onClick={() => onQuantityChange(item.id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      aria-label="Уменьшить количество"
                    >
                      −
                    </button>
                    <span className="pk-qty-value" id={`cart-item-${item.id}-quantity`}>
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      className="pk-qty-btn"
                      id={`cart-item-${item.id}-increase`}
                      onClick={() => onQuantityChange(item.id, item.quantity + 1)}
                      aria-label="Увеличить количество"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <span className="pk-qty-label">Копий: {item.quantity}</span>
                )}
                <span className="pk-cart-item-price">
                  {formatPrice(item.unitPriceCents * item.quantity)}
                </span>
              </div>
              {onRemove && (
                <button
                  type="button"
                  className="pk-cart-item-remove"
                  id={`cart-item-${item.id}-remove`}
                  onClick={() => onRemove(item.id)}
                >
                  Удалить
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="pk-cart-summary">
        <span>Копий: {totalCopies}</span>
        <span className="pk-cart-total">{formatPrice(totalCents)}</span>
      </div>

      {onProceedToPayment && (
        <button
          type="button"
          className="pk-btn pk-btn-primary"
          id="cart-proceed-to-payment"
          disabled={relevantItems.length === 0}
          onClick={() => onProceedToPayment(relevantItems)}
        >
          Оплатить
        </button>
      )}
    </>
  );
}
