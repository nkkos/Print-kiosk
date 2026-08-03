import type { PrintOrder } from '../../types/kiosk';
import styles from './CartPanel.module.css';

// Cart's content — see docs/domain/kiosk-session.md ("Related entities:
// Cart") and docs/screens/welcome-screen-spec.md ("btn-cart"). Read-only for
// now: no remove/edit action and no "proceed to payment" button yet, since
// Payment doesn't exist as a screen yet (a future step). Shows only orders
// currently in the session — Cart's confirmed scope is "awaiting payment"
// orders, which is everything in this prototype's cart so far.
interface CartPanelProps {
  items: PrintOrder[];
}

const SETTINGS_LABEL: Record<PrintOrder['paperSize'], string> = { A4: 'A4', A5: 'A5' };
const SIDES_LABEL: Record<PrintOrder['sides'], string> = {
  single: 'Single-sided',
  double: 'Double-sided',
};
const COLOR_LABEL: Record<PrintOrder['color'], string> = { bw: 'Black & white', color: 'Color' };

export function CartPanel({ items }: CartPanelProps) {
  if (items.length === 0) {
    return <p className={styles.empty}>Cart is empty</p>;
  }

  const total = items.reduce((sum, item) => sum + item.price, 0);

  return (
    <div className={styles.root}>
      <h2 className={styles.title}>Cart</h2>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <span className={styles.fileName}>{item.fileName}</span>
            <span className={styles.details}>
              {SETTINGS_LABEL[item.paperSize]}, {SIDES_LABEL[item.sides]}, {COLOR_LABEL[item.color]}
            </span>
            <span className={styles.price}>${item.price.toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.total}>Total: ${total.toFixed(2)}</p>
    </div>
  );
}
