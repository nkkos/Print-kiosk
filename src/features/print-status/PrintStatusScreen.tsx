import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import type { PrintOrder } from '../../types/kiosk';
import styles from './PrintStatusScreen.module.css';

// Print Status screen — see docs/domain/kiosk-session.md: "Print Status has
// no Back action (or it is disabled) — this screen is fully
// system-controlled; the persistent footer ... remains accessible
// regardless." No navigation-back/navigation-home here at all, and
// end-session stays hidden (sessionActive=false) — the transaction is still
// committed until the order is delivered.
//
// Prototype simplification: only the successful outcome is simulated (a
// single button) — failure handling is deferred to the polish step.
interface PrintStatusScreenProps {
  cartItems: PrintOrder[];
  onPrintComplete: () => void;
  onEndSession: () => void;
  onProceedToPayment: () => void;
}

export function PrintStatusScreen({
  cartItems,
  onPrintComplete,
  onEndSession,
  onProceedToPayment,
}: PrintStatusScreenProps) {
  return (
    <KioskScreenLayout
      sessionActive={false}
      onEndSession={onEndSession}
      cartItems={cartItems}
      onProceedToPayment={onProceedToPayment}
    >
      <div className={styles.body}>
        <p className={styles.message}>Printing your document(s)...</p>
        <Button
          id="print-simulate-complete"
          label="Simulate print complete"
          onClick={onPrintComplete}
        />
      </div>
    </KioskScreenLayout>
  );
}
