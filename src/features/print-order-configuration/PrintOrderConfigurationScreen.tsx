import { useState } from 'react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
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
// - price is a static placeholder, not a real per-page calculation
// - settings use plain native radio inputs directly: no shared RadioGroup
//   component yet, since this is the only consumer so far
const PLACEHOLDER_PRICE = 1;

interface PrintOrderConfigurationScreenProps {
  fileName: string;
  onAddToCart: (order: PrintOrder) => void;
  onBack: () => void;
  onHome: () => void;
  onEndSession: () => void;
  /** Current Cart contents, shown in the btn-cart popup. */
  cartItems: PrintOrder[];
  /** Navigates to the Payment Status screen from the Cart popup. */
  onProceedToPayment: () => void;
}

export function PrintOrderConfigurationScreen({
  fileName,
  onAddToCart,
  onBack,
  onHome,
  onEndSession,
  cartItems,
  onProceedToPayment,
}: PrintOrderConfigurationScreenProps) {
  const [paperSize, setPaperSize] = useState<PrintOrder['paperSize']>('A4');
  const [sides, setSides] = useState<PrintOrder['sides']>('single');
  const [color, setColor] = useState<PrintOrder['color']>('bw');

  function handleAddToCart() {
    onAddToCart({
      id: crypto.randomUUID(),
      fileName,
      paperSize,
      sides,
      color,
      price: PLACEHOLDER_PRICE,
    });
  }

  return (
    <KioskScreenLayout
      onEndSession={onEndSession}
      onBack={onBack}
      onHome={onHome}
      cartItems={cartItems}
      onProceedToPayment={onProceedToPayment}
    >
      <div className={styles.body}>
        <div className={styles.preview}>{fileName}</div>

        <fieldset className={styles.settings}>
          <legend>Paper size</legend>
          <label>
            <input
              type="radio"
              name="paperSize"
              checked={paperSize === 'A4'}
              onChange={() => setPaperSize('A4')}
            />
            A4
          </label>
          <label>
            <input
              type="radio"
              name="paperSize"
              checked={paperSize === 'A5'}
              onChange={() => setPaperSize('A5')}
            />
            A5
          </label>
        </fieldset>

        <fieldset className={styles.settings}>
          <legend>Sides</legend>
          <label>
            <input
              type="radio"
              name="sides"
              checked={sides === 'single'}
              onChange={() => setSides('single')}
            />
            Single-sided
          </label>
          <label>
            <input
              type="radio"
              name="sides"
              checked={sides === 'double'}
              onChange={() => setSides('double')}
            />
            Double-sided
          </label>
        </fieldset>

        <fieldset className={styles.settings}>
          <legend>Color</legend>
          <label>
            <input
              type="radio"
              name="color"
              checked={color === 'bw'}
              onChange={() => setColor('bw')}
            />
            Black &amp; white
          </label>
          <label>
            <input
              type="radio"
              name="color"
              checked={color === 'color'}
              onChange={() => setColor('color')}
            />
            Color
          </label>
        </fieldset>

        <p className={styles.price}>Price: ${PLACEHOLDER_PRICE.toFixed(2)}</p>

        <Button id="print-order-add-to-cart" label="Add to cart" onClick={handleAddToCart} />
      </div>
    </KioskScreenLayout>
  );
}
