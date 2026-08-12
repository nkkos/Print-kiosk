import { useEffect, useRef, useState } from 'react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { Modal } from '../../components/Modal/Modal';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder } from '../../types/kiosk';
import { getUploadedFileContentUrl } from '../../services/uploadedFileApi';
import { getAccountFileContentUrl } from '../../services/accountFileApi';
import { computeUnitPrice } from '../../utils/pricing';
import {
  usePreview,
  usePageRangeSelection,
  renderPdfPageToCanvas,
  type RenderMode,
} from '../../utils/documentPreview';
import styles from './PrintOrderConfigurationScreen.module.css';

// Combined preview + print-settings screen — see
// docs/email-upload-requirements.md ("no separate browse/edit screen;
// preview and print settings are combined into Print Order Configuration")
// and docs/domain/kiosk-session.md ("Related entities: Print Order").
//
// Prototype simplifications:
// - settings use plain native radio inputs directly: no shared RadioGroup
//   component yet, since this is the only consumer so far
//
// Quantity (docs/cart-requirements.md) is set here initially and can be
// adjusted again later directly in the Cart popup — same underlying value.

// Calibrates the popup's preview frame to real paper proportions, so
// "original size" vs. "fit to paper" is honestly comparable against
// something — the inline thumbnail's box is just an arbitrary fixed CSS
// size and doesn't need this (see usePreview below).
const PX_PER_MM = 2.2;
const POINTS_TO_MM = 25.4 / 72;
const PAPER_SIZE_MM: Record<PrintOrder['paperSize'], { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
};

// Real document preview (docs/email-upload-requirements.md, "Preview and
// print configuration") — only for files with real bytes on disk
// (`sourceFileId` present): QR/Email uploads (server/uploadStore.ts) or
// Personal Account's real "My files"/paid orders (server/accountFileStore.ts),
// disambiguated by `sourceFileOrigin`. Paid-order items with no backing file
// at all keep the plain filename box, same fallback class as
// server/printerAdapter.ts's placeholder document for the same items.
// Fetch/render/page-range logic itself lives in src/utils/documentPreview.ts,
// shared with the portal's own "Configure & pay" panel (portal/FilesPage.tsx).

interface PrintOrderConfigurationScreenProps {
  fileName: string;
  /** The real backing file's id this file came from — either
   * `uploadedFiles.id` (QR/Email) or `accountFiles.id` (Personal Account),
   * disambiguated by `sourceFileOrigin`. Threaded into the built PrintOrder
   * so Print Status can print the real file instead of a placeholder
   * (server/printerAdapter.ts). */
  sourceFileId?: string;
  /** Which store `sourceFileId` resolves against — absent/`'upload'` = QR/Email,
   * `'account'` = Personal Account (server/routes.ts). */
  sourceFileOrigin?: 'upload' | 'account';
  onAddToCart: (order: PrintOrder) => void;
  onBack: () => void;
  onHome: () => void;
  onEndSession: (reason: EndSessionReason) => void;
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
  onLogin: (email: string, password: string) => Promise<void>;
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
  sourceFileId,
  sourceFileOrigin,
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
  const [orientation, setOrientation] = useState<PrintOrder['orientation']>('portrait');
  const [scale, setScale] = useState<PrintOrder['scale']>('fit');
  const [quantity, setQuantity] = useState(1);
  const contentUrl = sourceFileId
    ? sourceFileOrigin === 'account'
      ? getAccountFileContentUrl(sourceFileId)
      : getUploadedFileContentUrl(sourceFileId)
    : undefined;
  const preview = usePreview(contentUrl);
  const {
    pageRangeMode,
    setPageRangeMode,
    rangeFrom,
    setRangeFrom,
    rangeTo,
    setRangeTo,
    pagesToPrint,
    pageRange,
  } = usePageRangeSelection(preview);
  const unitPrice = computeUnitPrice(pagesToPrint, paperSize, color, sides);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [popupPage, setPopupPage] = useState(1);
  const thumbnailCanvasRef = useRef<HTMLCanvasElement>(null);
  const popupCanvasRef = useRef<HTMLCanvasElement>(null);

  // Thumbnail: always page 1, fit to the fixed box, rotated per orientation.
  // Never simulates `scale` — that only becomes meaningful once there's a
  // real paper-size-calibrated frame to compare against (the popup below).
  useEffect(() => {
    if (preview.state !== 'ready' || preview.kind !== 'pdf' || !preview.pdf) return;
    const canvas = thumbnailCanvasRef.current;
    if (!canvas) return;
    renderPdfPageToCanvas(preview.pdf, 1, canvas, orientation === 'landscape' ? 90 : 0, {
      kind: 'fit-width',
      targetWidthPx: 240,
    }).catch(() => {});
  }, [preview.state, preview.kind, preview.pdf, orientation]);

  // Popup frame proportions — real paper size (mm) at a fixed px-per-mm
  // scale, swapped when landscape, so "original size" vs. "fit" is honestly
  // comparable against something real rather than an arbitrary box.
  const paperMm = PAPER_SIZE_MM[paperSize];
  const frameWidthPx = (orientation === 'landscape' ? paperMm.height : paperMm.width) * PX_PER_MM;
  const frameHeightPx = (orientation === 'landscape' ? paperMm.width : paperMm.height) * PX_PER_MM;

  useEffect(() => {
    if (!isPreviewOpen) setPopupPage(1);
  }, [isPreviewOpen]);

  useEffect(() => {
    if (!isPreviewOpen || preview.kind !== 'pdf' || !preview.pdf) return;
    const canvas = popupCanvasRef.current;
    if (!canvas) return;
    const mode: RenderMode =
      scale === 'fit'
        ? { kind: 'fit-box', widthPx: frameWidthPx, heightPx: frameHeightPx }
        : { kind: 'absolute-points', pxPerPoint: PX_PER_MM * POINTS_TO_MM };
    renderPdfPageToCanvas(
      preview.pdf,
      popupPage,
      canvas,
      orientation === 'landscape' ? 90 : 0,
      mode,
    ).catch(() => {});
  }, [
    isPreviewOpen,
    preview.kind,
    preview.pdf,
    popupPage,
    orientation,
    scale,
    frameWidthPx,
    frameHeightPx,
  ]);

  function handleAddToCart() {
    onAddToCart({
      id: crypto.randomUUID(),
      fileName,
      sourceFileId,
      sourceFileOrigin,
      paperSize,
      sides,
      color,
      orientation,
      scale,
      pageRange,
      quantity,
      unitPrice,
    });
  }

  const isPreviewClickable = preview.state === 'ready';

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
        <div
          id="print-order-preview"
          className={styles.preview}
          onClick={isPreviewClickable ? () => setIsPreviewOpen(true) : undefined}
          style={isPreviewClickable ? { cursor: 'pointer' } : undefined}
        >
          {/* Always mounted (not just when ready) so the ref exists before
              the preview effect tries to render onto it — hidden until
              there's actually something drawn. */}
          <canvas
            ref={thumbnailCanvasRef}
            className={styles.previewMedia}
            hidden={!(preview.state === 'ready' && preview.kind === 'pdf')}
          />
          {preview.state === 'ready' && preview.kind === 'image' && preview.imageUrl && (
            <img src={preview.imageUrl} alt={fileName} className={styles.previewMedia} />
          )}
          {preview.state === 'loading' && t.printOrderConfiguration.loadingPreview}
          {preview.state === 'unavailable' && fileName}
        </div>

        {isPreviewOpen && (
          <Modal onClose={() => setIsPreviewOpen(false)}>
            <div
              className={styles.previewFrame}
              style={{ width: `${frameWidthPx}px`, height: `${frameHeightPx}px` }}
            >
              {preview.kind === 'pdf' && (
                <canvas
                  ref={popupCanvasRef}
                  className={scale === 'fit' ? styles.previewMedia : undefined}
                />
              )}
              {/* Images always simulate as "fit" regardless of `scale` — a
                  raster image has no inherent physical size (unlike a PDF
                  page, whose points convert directly to mm), so an "original
                  size" comparison against real paper would need an assumed
                  DPI. Not worth the ambiguity for a secondary content type. */}
              {preview.kind === 'image' && preview.imageUrl && (
                <img src={preview.imageUrl} alt={fileName} className={styles.previewMediaContain} />
              )}
            </div>
            {preview.kind === 'pdf' && preview.numPages > 1 && (
              <div className={styles.previewNav}>
                <Button
                  id="print-order-preview-prev-page"
                  label="‹"
                  onClick={() => setPopupPage((page) => Math.max(1, page - 1))}
                  disabled={popupPage <= 1}
                />
                <span>
                  {t.printOrderConfiguration.previewPageIndicator(popupPage, preview.numPages)}
                </span>
                <Button
                  id="print-order-preview-next-page"
                  label="›"
                  onClick={() => setPopupPage((page) => Math.min(preview.numPages, page + 1))}
                  disabled={popupPage >= preview.numPages}
                />
              </div>
            )}
          </Modal>
        )}

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
          <legend>{t.printOrderConfiguration.orientationLegend}</legend>
          <label>
            <input
              type="radio"
              name="orientation"
              checked={orientation === 'portrait'}
              onChange={() => setOrientation('portrait')}
            />
            {t.common.orientationPortrait}
          </label>
          <label>
            <input
              type="radio"
              name="orientation"
              checked={orientation === 'landscape'}
              onChange={() => setOrientation('landscape')}
            />
            {t.common.orientationLandscape}
          </label>
        </fieldset>

        <fieldset className={styles.settings}>
          <legend>{t.printOrderConfiguration.scaleLegend}</legend>
          <label>
            <input
              type="radio"
              name="scale"
              checked={scale === 'fit'}
              onChange={() => setScale('fit')}
            />
            {t.common.scaleFit}
          </label>
          <label>
            <input
              type="radio"
              name="scale"
              checked={scale === 'original'}
              onChange={() => setScale('original')}
            />
            {t.common.scaleOriginal}
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

        {preview.kind === 'pdf' && preview.numPages > 1 && (
          <fieldset className={styles.settings}>
            <legend>{t.printOrderConfiguration.pagesLegend}</legend>
            <label>
              <input
                type="radio"
                name="pageRangeMode"
                checked={pageRangeMode === 'all'}
                onChange={() => setPageRangeMode('all')}
              />
              {t.printOrderConfiguration.pagesAll}
            </label>
            <label>
              <input
                type="radio"
                name="pageRangeMode"
                checked={pageRangeMode === 'custom'}
                onChange={() => setPageRangeMode('custom')}
              />
              {t.printOrderConfiguration.pagesCustom}
            </label>
            {pageRangeMode === 'custom' && (
              <span className={styles.pageRangeInputs}>
                <input
                  type="number"
                  min={1}
                  max={preview.numPages}
                  value={rangeFrom}
                  onChange={(e) => {
                    const value = Math.max(
                      1,
                      Math.min(preview.numPages, Number(e.target.value) || 1),
                    );
                    setRangeFrom(Math.min(value, rangeTo));
                  }}
                />
                –
                <input
                  type="number"
                  min={1}
                  max={preview.numPages}
                  value={rangeTo}
                  onChange={(e) => {
                    const value = Math.max(
                      1,
                      Math.min(preview.numPages, Number(e.target.value) || 1),
                    );
                    setRangeTo(Math.max(value, rangeFrom));
                  }}
                />
              </span>
            )}
          </fieldset>
        )}

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
          {t.printOrderConfiguration.price((unitPrice * quantity).toFixed(2))}
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
