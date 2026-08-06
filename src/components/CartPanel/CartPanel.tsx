import { useState } from 'react';
import { Button } from '../Button/Button';
import { computeItemPrice } from '../../utils/pricing';
import { useTranslation } from '../../i18n';
import type { PrintOrder } from '../../types/kiosk';
import styles from './CartPanel.module.css';

// Cart's content — see docs/domain/kiosk-session.md ("Related entities:
// Cart") and docs/cart-requirements.md (quantity, selection, removal).
// Interactive controls (checkbox, quantity stepper, remove, "Proceed to
// payment") only appear when their corresponding callback is supplied —
// omit all three for a read-only summary (used by Payment Status, which
// shows an already-committed batch that should not be re-editable there).
interface CartPanelProps {
  items: PrintOrder[];
  onQuantityChange?: (id: string, quantity: number) => void;
  onRemove?: (id: string) => void;
  onProceedToPayment?: (selectedItems: PrintOrder[]) => void;
}

export function CartPanel({
  items,
  onQuantityChange,
  onRemove,
  onProceedToPayment,
}: CartPanelProps) {
  const t = useTranslation();
  // Defaults to "all checked" — this component only ever mounts fresh each
  // time the Cart popup opens, so there's nothing to persist across visits
  // (docs/cart-requirements.md, "Selection state is not persisted").
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(items.map((item) => item.id)),
  );

  const SETTINGS_LABEL: Record<PrintOrder['paperSize'], string> = {
    A4: t.common.paperSizeA4,
    A5: t.common.paperSizeA5,
  };
  const SIDES_LABEL: Record<PrintOrder['sides'], string> = {
    single: t.common.sidesSingle,
    double: t.common.sidesDouble,
  };
  const COLOR_LABEL: Record<PrintOrder['color'], string> = {
    bw: t.common.colorBw,
    color: t.common.colorColor,
  };
  const ORIENTATION_LABEL: Record<PrintOrder['orientation'], string> = {
    portrait: t.common.orientationPortrait,
    landscape: t.common.orientationLandscape,
  };
  const SCALE_LABEL: Record<PrintOrder['scale'], string> = {
    fit: t.common.scaleFit,
    original: t.common.scaleOriginal,
  };

  if (items.length === 0) {
    return <p className={styles.empty}>{t.cart.empty}</p>;
  }

  const isSelectable = Boolean(onProceedToPayment);
  const relevantItems = isSelectable ? items.filter((item) => selectedIds.has(item.id)) : items;
  const total = relevantItems.reduce((sum, item) => sum + computeItemPrice(item), 0);

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
    <div className={styles.root}>
      <h2 className={styles.title}>{t.cart.title}</h2>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <div className={styles.itemRow}>
              {isSelectable && (
                <input
                  type="checkbox"
                  id={`cart-item-${item.id}-select`}
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelected(item.id)}
                />
              )}
              <span className={styles.fileName}>{item.fileName}</span>
              {onRemove && (
                <Button
                  id={`cart-item-${item.id}-remove`}
                  label="×"
                  onClick={() => onRemove(item.id)}
                />
              )}
            </div>

            <span className={styles.details}>
              {SETTINGS_LABEL[item.paperSize]}, {SIDES_LABEL[item.sides]}, {COLOR_LABEL[item.color]}
              , {ORIENTATION_LABEL[item.orientation]}, {SCALE_LABEL[item.scale]}
            </span>

            <div className={styles.itemRow}>
              {onQuantityChange ? (
                <div className={styles.quantity}>
                  <Button
                    id={`cart-item-${item.id}-quantity-decrement`}
                    label="−"
                    onClick={() => {
                      if (item.quantity > 1) {
                        onQuantityChange(item.id, item.quantity - 1);
                      }
                    }}
                  />
                  <span>{item.quantity}</span>
                  <Button
                    id={`cart-item-${item.id}-quantity-increment`}
                    label="+"
                    onClick={() => onQuantityChange(item.id, item.quantity + 1)}
                  />
                </div>
              ) : (
                <span>{t.cart.qty(item.quantity)}</span>
              )}

              <span className={styles.price}>${computeItemPrice(item).toFixed(2)}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className={styles.total}>{t.cart.total(total.toFixed(2))}</p>

      {onProceedToPayment && relevantItems.length > 0 && (
        <Button
          id="cart-proceed-to-payment"
          label={t.cart.proceedToPayment}
          onClick={() => onProceedToPayment(relevantItems)}
        />
      )}
    </div>
  );
}
