import { useState } from 'react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { PrintOrder } from '../../types/kiosk';
import styles from './PrintOrderConfigurationScreen.module.css';

// Combined preview + print-settings screen — see
// docs/email-upload-requirements.md ("no separate browse/edit screen;
// preview and print settings are combined into Print Order Configuration")
// and docs/domain/kiosk-session.md ("Related entities: Print Order").
//
// Prototype simplifications:
// - the preview is a placeholder box (file name only), not a real rendered
//   document — no server-side PDF conversion exists yet
// - unitPrice is a static placeholder, not a real per-page calculation
// - settings use plain native radio inputs directly: no shared RadioGroup
//   component yet, since this is the only consumer so far
//
// Quantity (docs/cart-requirements.md) is set here initially and can be
// adjusted again later directly in the Cart popup — same underlying value.
const PLACEHOLDER_UNIT_PRICE = 1;

interface PrintOrderConfigurationScreenProps {
  fileName: string;
  onAddToCart: (order: PrintOrder) => void;
  onBack: () => void;
  onHome: () => void;
  onEndSession: () => void;
  /** Current Cart contents, shown in the btn-cart popup. */
  cartItems: PrintOrder[];
  /** Adjusts a Cart item's quantity (docs/cart-requirements.md). */
  onQuantityChange: (id: string, quantity: number) => void;
  /** Removes a Cart item entirely (docs/cart-requirements.md). */
  onRemoveItem: (id: string) => void;
  /** Navigates to the Payment Status screen with the checked Cart items. */
  onProceedToPayment: (selectedItems: PrintOrder[]) => void;
  isConnectionLost: boolean;
  onSimulateConnectionLost: () => void;
  onSimulateConnectionRestored: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
  accountId: string | null;
  /** Navigates to the Personal Account screen (docs/personal-account-requirements.md)
   * — used by the footer's btn-account. */
  onGoToPersonalAccount: () => void;
  hasPendingPaidOrders: boolean;
  onDismissPaidOrdersPrompt: () => void;
  onGoToPaidOrders: () => void;
  onLanguageChange: (language: Language) => void;
}

export function PrintOrderConfigurationScreen({
  fileName,
  onAddToCart,
  onBack,
  onHome,
  onEndSession,
  cartItems,
  onQuantityChange,
  onRemoveItem,
  onProceedToPayment,
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
}: PrintOrderConfigurationScreenProps) {
  const t = useTranslation();
  const [paperSize, setPaperSize] = useState<PrintOrder['paperSize']>('A4');
  const [sides, setSides] = useState<PrintOrder['sides']>('single');
  const [color, setColor] = useState<PrintOrder['color']>('bw');
  const [quantity, setQuantity] = useState(1);

  function handleAddToCart() {
    onAddToCart({
      id: crypto.randomUUID(),
      fileName,
      paperSize,
      sides,
      color,
      quantity,
      unitPrice: PLACEHOLDER_UNIT_PRICE,
    });
  }

  return (
    <KioskScreenLayout
      onEndSession={onEndSession}
      onBack={onBack}
      onHome={onHome}
      cartItems={cartItems}
      onQuantityChange={onQuantityChange}
      onRemoveItem={onRemoveItem}
      onProceedToPayment={onProceedToPayment}
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
      <div className={styles.body}>
        <div className={styles.preview}>{fileName}</div>

        <fieldset className={styles.settings}>
          <legend>{t.printOrderConfiguration.paperSizeLegend}</legend>
          <label>
            <input
              type="radio"
              name="paperSize"
              checked={paperSize === 'A4'}
              onChange={() => setPaperSize('A4')}
            />
            {t.common.paperSizeA4}
          </label>
          <label>
            <input
              type="radio"
              name="paperSize"
              checked={paperSize === 'A5'}
              onChange={() => setPaperSize('A5')}
            />
            {t.common.paperSizeA5}
          </label>
        </fieldset>

        <fieldset className={styles.settings}>
          <legend>{t.printOrderConfiguration.sidesLegend}</legend>
          <label>
            <input
              type="radio"
              name="sides"
              checked={sides === 'single'}
              onChange={() => setSides('single')}
            />
            {t.common.sidesSingle}
          </label>
          <label>
            <input
              type="radio"
              name="sides"
              checked={sides === 'double'}
              onChange={() => setSides('double')}
            />
            {t.common.sidesDouble}
          </label>
        </fieldset>

        <fieldset className={styles.settings}>
          <legend>{t.printOrderConfiguration.colorLegend}</legend>
          <label>
            <input
              type="radio"
              name="color"
              checked={color === 'bw'}
              onChange={() => setColor('bw')}
            />
            {t.common.colorBw}
          </label>
          <label>
            <input
              type="radio"
              name="color"
              checked={color === 'color'}
              onChange={() => setColor('color')}
            />
            {t.common.colorColor}
          </label>
        </fieldset>

        <div className={styles.quantity}>
          <span>{t.printOrderConfiguration.quantity}</span>
          <Button
            id="print-order-quantity-decrement"
            label="−"
            onClick={() => setQuantity((current) => Math.max(1, current - 1))}
          />
          <span>{quantity}</span>
          <Button
            id="print-order-quantity-increment"
            label="+"
            onClick={() => setQuantity((current) => current + 1)}
          />
        </div>

        <p className={styles.price}>
          {t.printOrderConfiguration.price((PLACEHOLDER_UNIT_PRICE * quantity).toFixed(2))}
        </p>

        <Button
          id="print-order-add-to-cart"
          label={t.printOrderConfiguration.addToCart}
          onClick={handleAddToCart}
        />
      </div>
    </KioskScreenLayout>
  );
}
