import { useEffect, useState } from 'react';
import { Plus, ShoppingCart } from 'lucide-react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { CartPanel } from '../../components/CartPanel/CartPanel';
import { OrderSteps } from '../../components/OrderSteps/OrderSteps';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder } from '../../types/kiosk';
import { isPrinterAvailable } from '../../services/printerStatusApi';
import styles from './OrderReviewScreen.module.css';

// "Check your order" — the Cart as a screen, step 3 of the print path
// (2026-10 redesign, docs/design/kiosk-redesign-plan.md; product owner's
// decision 2026-10-20 to replace the Cart popup). Reached right after "Add
// to order" and from the footer's btn-cart. Item behaviour — ticks,
// quantity, removal, total — is unchanged (docs/cart-requirements.md);
// "Add another file" goes back to where the customer came from, so they
// still keep their place.

const PRINTER_STATUS_POLL_MS = 10 * 1000;

interface OrderReviewScreenProps {
  cartItems: PrintOrder[];
  onQuantityChange: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onProceedToPayment: (selectedItems: PrintOrder[]) => void;
  /** Back to the screen files came from (or upload-method selection). */
  onAddMore: () => void;
  onBack: () => void;
  onHome: () => void;
  onEndSession: (reason: EndSessionReason) => void;
  isConnectionLost: boolean;
  onSimulateConnectionLost: () => void;
  onSimulateConnectionRestored: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  accountId: string | null;
  onGoToPersonalAccount: () => void;
  hasPendingPaidOrders: boolean;
  onDismissPaidOrdersPrompt: () => void;
  onGoToPaidOrders: () => void;
  onLanguageChange: (language: Language) => void;
}

export function OrderReviewScreen({
  cartItems,
  onQuantityChange,
  onRemoveItem,
  onProceedToPayment,
  onAddMore,
  onBack,
  onHome,
  onEndSession,
  isConnectionLost,
  onSimulateConnectionLost,
  onSimulateConnectionRestored,
  onLogin,
  accountId,
  onGoToPersonalAccount,
  hasPendingPaidOrders,
  onDismissPaidOrdersPrompt,
  onGoToPaidOrders,
  onLanguageChange,
}: OrderReviewScreenProps) {
  const t = useTranslation();
  const [printerUnavailable, setPrinterUnavailable] = useState(false);

  // Checked while this screen is open — the one place payment starts — and
  // re-checked so a fixed jam unlocks the button without leaving the screen.
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      isPrinterAvailable().then((available) => {
        if (!cancelled) setPrinterUnavailable(!available);
      });
    check();
    const intervalId = setInterval(check, PRINTER_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const isEmpty = cartItems.length === 0;

  return (
    <KioskScreenLayout
      onEndSession={onEndSession}
      onBack={onBack}
      onHome={onHome}
      cartItems={cartItems}
      cartIsCurrent
      isConnectionLost={isConnectionLost}
      onSimulateConnectionLost={onSimulateConnectionLost}
      onSimulateConnectionRestored={onSimulateConnectionRestored}
      onLogin={onLogin}
      accountId={accountId}
      onGoToPersonalAccount={onGoToPersonalAccount}
      hasPendingPaidOrders={hasPendingPaidOrders}
      onDismissPaidOrdersPrompt={onDismissPaidOrdersPrompt}
      onGoToPaidOrders={onGoToPaidOrders}
      onLanguageChange={onLanguageChange}
    >
      <div className={styles.top}>
        <div className={styles.intro}>
          <h1 className={styles.title}>{t.cart.title}</h1>
          {!isEmpty && <p className={styles.subtitle}>{t.cart.subtitle}</p>}
        </div>
        <OrderSteps current="review" />
      </div>

      {isEmpty ? (
        <div className={styles.empty} id="order-review-empty">
          <span className={styles.emptyIcon} aria-hidden="true">
            <ShoppingCart size={56} strokeWidth={1.75} />
          </span>
          <span className={styles.emptyTitle}>{t.cart.empty}</span>
          <span className={styles.emptyHint}>{t.cart.emptyHint}</span>
          <Button
            id="order-review-add-files"
            variant="primary"
            icon={<Plus size={24} />}
            label={t.cart.addFiles}
            onClick={onAddMore}
          />
        </div>
      ) : (
        <div className={styles.body}>
          <CartPanel
            items={cartItems}
            onQuantityChange={onQuantityChange}
            onRemove={onRemoveItem}
            onProceedToPayment={onProceedToPayment}
            printerUnavailable={printerUnavailable}
            secondaryAction={
              <Button
                id="order-review-add-more"
                icon={<Plus size={24} />}
                label={t.cart.addMore}
                onClick={onAddMore}
              />
            }
          />
        </div>
      )}
    </KioskScreenLayout>
  );
}
