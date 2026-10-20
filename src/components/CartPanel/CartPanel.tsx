import { useState, type ReactNode } from 'react';
import { ArrowRight, Check, FileText, Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '../Button/Button';
import { computeItemPrice, formatEuro } from '../../utils/pricing';
import { MIN_CARD_PAYMENT_CENTS } from '../../utils/tariff';
import { useTranslation } from '../../i18n';
import type { PrintOrder } from '../../types/kiosk';
import styles from './CartPanel.module.css';

// Cart's content — see docs/domain/kiosk-session.md ("Related entities:
// Cart") and docs/cart-requirements.md (quantity, selection, removal): the
// orders on the left, the total and what to do next on the right. Shown on
// the order review screen since the 2026-10 redesign (it used to be a
// popup). Interactive controls (tick, quantity stepper, remove, "Proceed to
// payment") only appear when their corresponding callback is supplied —
// omit all three for a read-only summary (used by Payment Status, which
// shows an already-committed batch that should not be re-editable there).
interface CartPanelProps {
  items: PrintOrder[];
  onQuantityChange?: (id: string, quantity: number) => void;
  onRemove?: (id: string) => void;
  onProceedToPayment?: (selectedItems: PrintOrder[]) => void;
  // The printer can't print right now (the order review screen checks) —
  // payment is refused rather than taking money for a job that can't come out.
  printerUnavailable?: boolean;
  /** A secondary action under "Proceed to payment" — "Add another file". */
  secondaryAction?: ReactNode;
}

export function CartPanel({
  items,
  onQuantityChange,
  onRemove,
  onProceedToPayment,
  printerUnavailable = false,
  secondaryAction,
}: CartPanelProps) {
  const t = useTranslation();
  // Defaults to "all checked" — the order review screen mounts this fresh on
  // every visit, so there's nothing to persist across visits
  // (docs/cart-requirements.md, "Selection state is not persisted").
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(items.map((item) => item.id)),
  );

  const PAPER_LABEL: Record<PrintOrder['paperSize'], string> = {
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
      <ul className={styles.list}>
        {items.map((item) => {
          const selected = !isSelectable || selectedIds.has(item.id);
          return (
            <li key={item.id} className={styles.item} data-selected={selected || undefined}>
              {isSelectable && (
                <label className={styles.tick}>
                  <input
                    type="checkbox"
                    id={`cart-item-${item.id}-select`}
                    checked={selected}
                    onChange={() => toggleSelected(item.id)}
                  />
                  <span className={styles.tickBox} aria-hidden="true">
                    {selected && <Check size={24} strokeWidth={3} />}
                  </span>
                </label>
              )}
              <span className={styles.fileIcon} aria-hidden="true">
                <FileText size={28} />
              </span>

              <div className={styles.itemText}>
                <span className={styles.fileName}>{item.fileName}</span>
                <span className={styles.chips}>
                  <span className={styles.chip}>{PAPER_LABEL[item.paperSize]}</span>
                  <span className={styles.chip}>{COLOR_LABEL[item.color]}</span>
                  <span className={styles.chip}>{SIDES_LABEL[item.sides]}</span>
                  {item.pageRange && (
                    <span className={styles.chip}>{t.cart.pages(item.pageRange)}</span>
                  )}
                  {item.pagesPerSheet && item.pagesPerSheet > 1 && (
                    <span className={styles.chip}>{t.cart.pagesPerSheet(item.pagesPerSheet)}</span>
                  )}
                  {item.scale === 'original' && (
                    <span className={styles.chip}>{t.common.scaleOriginal}</span>
                  )}
                </span>
              </div>

              {onQuantityChange ? (
                <div className={styles.stepper} aria-label={t.cart.copies}>
                  <button
                    type="button"
                    id={`cart-item-${item.id}-quantity-decrement`}
                    className={styles.stepperButton}
                    onClick={() => onQuantityChange(item.id, item.quantity - 1)}
                    disabled={item.quantity <= 1}
                    aria-label="−"
                  >
                    <Minus size={22} />
                  </button>
                  <span className={styles.stepperValue}>{item.quantity}</span>
                  <button
                    type="button"
                    id={`cart-item-${item.id}-quantity-increment`}
                    className={styles.stepperButton}
                    onClick={() => onQuantityChange(item.id, item.quantity + 1)}
                    aria-label="+"
                  >
                    <Plus size={22} />
                  </button>
                </div>
              ) : (
                <span className={styles.qty}>{t.cart.qty(item.quantity)}</span>
              )}

              <span className={styles.price}>{formatEuro(computeItemPrice(item))}</span>

              {onRemove && (
                <button
                  type="button"
                  id={`cart-item-${item.id}-remove`}
                  className={styles.remove}
                  onClick={() => onRemove(item.id)}
                  aria-label={t.cart.remove}
                >
                  <Trash2 size={26} />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <aside className={styles.summary}>
        {isSelectable && (
          <span className={styles.toPrint}>{t.cart.toPrint(relevantItems.length)}</span>
        )}
        <span className={styles.total}>
          {t.cart.totalLabel}{' '}
          <span className={styles.totalAmount} id="cart-total">
            {formatEuro(total)}
          </span>
        </span>
        {/* Viva takes no card payment below the minimum — the server tops the
            order up (src/utils/tariff.ts); said here so the higher amount on
            the terminal isn't a surprise. */}
        {total > 0 && total * 100 < MIN_CARD_PAYMENT_CENTS - 0.5 && (
          <p className={styles.note} id="cart-minimum-charge">
            {t.cart.minimumCharge(formatEuro(MIN_CARD_PAYMENT_CENTS / 100))}
          </p>
        )}

        {onProceedToPayment && relevantItems.length > 0 && (
          <>
            {printerUnavailable && (
              <p className={styles.unavailable} role="status">
                {t.cart.printerUnavailable}
              </p>
            )}
            <Button
              id="cart-proceed-to-payment"
              variant="primary"
              label={t.cart.proceedToPayment}
              trailingIcon={<ArrowRight size={24} />}
              onClick={() => onProceedToPayment(relevantItems)}
              disabled={printerUnavailable}
            />
          </>
        )}
        {secondaryAction}
      </aside>
    </div>
  );
}
