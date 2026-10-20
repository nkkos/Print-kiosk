import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, Maximize2, Minus, Plus, ShoppingCart } from 'lucide-react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { Modal } from '../../components/Modal/Modal';
import { OrderSteps } from '../../components/OrderSteps/OrderSteps';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder } from '../../types/kiosk';
import { getUploadedFileContentUrl } from '../../services/uploadedFileApi';
import { standHeaders } from '../../services/standAuth';
import { getAccountFileContentUrl } from '../../services/accountFileApi';
import { supportsDuplex, OFFERED_PAPER_SIZES } from '../../utils/printCapabilities';
import { computeUnitPrice, formatEuro } from '../../utils/pricing';
import {
  PAGES_PER_SHEET_OPTIONS,
  computeNUpLayout,
  pageNumbersInRange,
  type PagesPerSheet,
} from '../../utils/nUpLayout';
import {
  usePreview,
  usePageRangeSelection,
  renderPdfPageToCanvas,
  renderNUpSheetToCanvas,
  getPdfPageOrientation,
  type RenderMode,
} from '../../utils/documentPreview';
import styles from './PrintOrderConfigurationScreen.module.css';

// Combined preview + print-settings screen — see
// docs/email-upload-requirements.md ("no separate browse/edit screen;
// preview and print settings are combined into Print Order Configuration")
// and docs/domain/kiosk-session.md ("Related entities: Print Order").
//
// Layout (2026-10 redesign, docs/design/kiosk-redesign-plan.md, batch 3):
// the sheet on the left, one row per setting on the right, and the total
// with the one primary action under them. Settings are segmented choices
// built on plain native radio inputs, and numbers (copies, page range) are
// −/+ steppers — the stand has no keyboard. Both stay local to this screen
// until a second screen needs them.
//
// Quantity (docs/cart-requirements.md) is set here initially and can be
// adjusted again later on the order review screen — same underlying value.

// Calibrates the preview sheets to real paper proportions, so the paper
// size and "original size" vs. "fit to paper" are honestly comparable
// against something: an A5 sheet is drawn smaller than an A4 one, and a page
// that doesn't fit the sheet at original size shows up cropped. The inline
// thumbnail uses the same idea at a smaller scale (A4's long side ≈ 20rem).
const PX_PER_MM = 2.2;
const THUMBNAIL_PX_PER_MM = 1.07;
// Header, footer, the popup's Close button and page navigation — what's left
// of the window height is the most the popup's sheet may take.
const POPUP_VERTICAL_CHROME_PX = 420;
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
  /** Where this file sits in a batch ("File 2 of 3"), absent outside one. */
  batchPosition?: { current: number; total: number };
  /** The real backing file's id this file came from — either
   * `uploadedFiles.id` (QR/Email) or `accountFiles.id` (Personal Account),
   * disambiguated by `sourceFileOrigin`. Threaded into the built PrintOrder
   * so Print Status can print the real file instead of a placeholder
   * (server/printerAdapter.ts). */
  sourceFileId?: string;
  /** Which store `sourceFileId` resolves against — absent/`'upload'` = QR/Email,
   * `'account'` = Personal Account (server/routes.ts). */
  sourceFileOrigin?: 'upload' | 'account';
  /** Needed to preview an account file (only its owner may read it). */
  accountToken?: string;
  onAddToCart: (order: PrintOrder) => void;
  onBack: () => void;
  onHome: () => void;
  onEndSession: (reason: EndSessionReason) => void;
  /** Current Cart contents — the footer's count and the End Session rule. */
  cartItems: PrintOrder[];
  /** Opens the order review screen — the footer's btn-cart. */
  onOpenCart: () => void;
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
  accountToken,
  fileName,
  batchPosition,
  sourceFileId,
  sourceFileOrigin,
  onAddToCart,
  onBack,
  onHome,
  onEndSession,
  cartItems,
  onOpenCart,
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
  const [scale, setScale] = useState<PrintOrder['scale']>('fit');
  const [pagesPerSheet, setPagesPerSheet] = useState<PagesPerSheet>(1);
  const [quantity, setQuantity] = useState(1);
  const contentUrl = sourceFileId
    ? sourceFileOrigin === 'account'
      ? getAccountFileContentUrl(sourceFileId)
      : getUploadedFileContentUrl(sourceFileId)
    : undefined;
  // Account files are read with the account's token, QR/Email uploads with
  // the stand's key (server/security.ts).
  const preview = usePreview(
    contentUrl,
    sourceFileOrigin === 'account'
      ? accountToken
        ? { Authorization: `Bearer ${accountToken}` }
        : undefined
      : standHeaders(),
  );
  // Follows the document itself — a converted file can't be re-laid-out, and
  // forcing the sheet the other way only shrinks the page onto half of it.
  // Still recorded on the order: it picks the duplex flip edge.
  const orientation: PrintOrder['orientation'] = preview.orientation ?? 'portrait';
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
  // Pages per sheet (src/utils/nUpLayout.ts) — only offered for a
  // multi-page PDF. The cloud builds the real imposed PDF from the same
  // layout (server/nUpImposer.ts), so the preview below is what prints; each
  // sheet is printed 1:1, which is why "scale" doesn't apply to it.
  const nUpAvailable = preview.kind === 'pdf' && preview.numPages > 1;
  const effectivePagesPerSheet: PagesPerSheet = nUpAvailable ? pagesPerSheet : 1;
  const nUpLayout =
    effectivePagesPerSheet > 1 && preview.pageAspect
      ? computeNUpLayout(
          effectivePagesPerSheet as Exclude<PagesPerSheet, 1>,
          preview.pageAspect,
          PAPER_SIZE_MM[paperSize],
        )
      : null;
  const selectedPages = pageNumbersInRange(pageRange, preview.numPages);
  const sheets: number[][] = [];
  for (let i = 0; i < selectedPages.length; i += effectivePagesPerSheet) {
    sheets.push(selectedPages.slice(i, i + effectivePagesPerSheet));
  }
  const effectiveScale: PrintOrder['scale'] = nUpLayout ? 'fit' : scale;
  const unitPrice = computeUnitPrice(pagesToPrint, paperSize, color, sides, effectivePagesPerSheet);
  const duplexAvailable = supportsDuplex(paperSize);

  function selectPaperSize(size: PrintOrder['paperSize']) {
    setPaperSize(size);
    if (!supportsDuplex(size)) setSides('single');
  }

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [popupPage, setPopupPage] = useState(1);
  const thumbnailCanvasRef = useRef<HTMLCanvasElement>(null);
  const popupCanvasRef = useRef<HTMLCanvasElement>(null);

  // Thumbnail: page 1 on a to-scale sheet of the selected paper size, fitted
  // or at original size — the same simulation as the popup, just smaller.
  const thumbnailPaperMm = PAPER_SIZE_MM[paperSize];
  const thumbnailWidthPx = nUpLayout
    ? nUpLayout.widthMm * THUMBNAIL_PX_PER_MM
    : (orientation === 'landscape' ? thumbnailPaperMm.height : thumbnailPaperMm.width) *
      THUMBNAIL_PX_PER_MM;
  const thumbnailHeightPx = nUpLayout
    ? nUpLayout.heightMm * THUMBNAIL_PX_PER_MM
    : (orientation === 'landscape' ? thumbnailPaperMm.width : thumbnailPaperMm.height) *
      THUMBNAIL_PX_PER_MM;
  // Joined into a string for the effect deps: the sheet's contents matter,
  // not the array's identity (rebuilt on every render).
  const firstSheetKey = (sheets[0] ?? []).join(',');
  useEffect(() => {
    if (preview.state !== 'ready' || preview.kind !== 'pdf' || !preview.pdf) return;
    const canvas = thumbnailCanvasRef.current;
    if (!canvas) return;
    if (nUpLayout) {
      const pages = firstSheetKey ? firstSheetKey.split(',').map(Number) : [];
      renderNUpSheetToCanvas(preview.pdf, pages, nUpLayout, canvas, THUMBNAIL_PX_PER_MM).catch(
        () => {},
      );
      return;
    }
    canvas.style.width = '';
    canvas.style.height = '';
    const mode: RenderMode =
      scale === 'fit'
        ? { kind: 'fit-box', widthPx: thumbnailWidthPx, heightPx: thumbnailHeightPx }
        : { kind: 'absolute-points', pxPerPoint: THUMBNAIL_PX_PER_MM * POINTS_TO_MM };
    renderPdfPageToCanvas(preview.pdf, 1, canvas, mode).catch(() => {});
  }, [
    preview.state,
    preview.kind,
    preview.pdf,
    scale,
    thumbnailWidthPx,
    thumbnailHeightPx,
    nUpLayout,
    firstSheetKey,
  ]);

  // The popup's sheet turns with whichever page is shown — mixed documents
  // print each page onto the sheet the way it fits.
  const [popupPageOrientation, setPopupPageOrientation] =
    useState<PrintOrder['orientation']>(orientation);
  useEffect(() => {
    if (!isPreviewOpen) return;
    if (preview.kind !== 'pdf' || !preview.pdf) {
      setPopupPageOrientation(orientation);
      return;
    }
    let cancelled = false;
    getPdfPageOrientation(preview.pdf, popupPage)
      .then((pageOrientation) => {
        if (!cancelled) setPopupPageOrientation(pageOrientation);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isPreviewOpen, preview.kind, preview.pdf, popupPage, orientation]);

  // Popup frame proportions — real paper size (mm) at a fixed px-per-mm
  // scale, turned to match the page, so "original size" vs. "fit" is
  // honestly comparable against something real rather than an arbitrary box.
  const paperMm = PAPER_SIZE_MM[paperSize];
  const sheetWidthMm = nUpLayout
    ? nUpLayout.widthMm
    : popupPageOrientation === 'landscape'
      ? paperMm.height
      : paperMm.width;
  const sheetHeightMm = nUpLayout
    ? nUpLayout.heightMm
    : popupPageOrientation === 'landscape'
      ? paperMm.width
      : paperMm.height;
  // The sheet shrinks to fit the popup — at PX_PER_MM a landscape A4 is
  // wider than the popup and got cropped. Sheet and page scale together, so
  // "fit" vs. "original size" still compare honestly.
  const popupBoxRef = useRef<HTMLDivElement>(null);
  const [popupAvailableWidthPx, setPopupAvailableWidthPx] = useState<number | null>(null);
  useEffect(() => {
    const box = popupBoxRef.current;
    if (!isPreviewOpen || !box) return;
    const measure = () => setPopupAvailableWidthPx(box.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [isPreviewOpen]);
  // Room left for the sheet under the Close button and above the page
  // navigation, within the screen's content area.
  const popupAvailableHeightPx = Math.max(240, window.innerHeight - POPUP_VERTICAL_CHROME_PX);
  const popupPxPerMm = Math.min(
    PX_PER_MM,
    (popupAvailableWidthPx ?? sheetWidthMm * PX_PER_MM) / sheetWidthMm,
    popupAvailableHeightPx / sheetHeightMm,
  );
  const frameWidthPx = sheetWidthMm * popupPxPerMm;
  const frameHeightPx = sheetHeightMm * popupPxPerMm;
  // With pages per sheet the popup steps through printed sheets, not pages.
  const popupItemCount = nUpLayout ? sheets.length : preview.numPages;
  const popupSheetKey = (sheets[popupPage - 1] ?? []).join(',');

  useEffect(() => {
    if (!isPreviewOpen) setPopupPage(1);
  }, [isPreviewOpen]);
  useEffect(() => {
    setPopupPage(1);
  }, [effectivePagesPerSheet]);

  useEffect(() => {
    if (!isPreviewOpen || preview.kind !== 'pdf' || !preview.pdf) return;
    const canvas = popupCanvasRef.current;
    if (!canvas) return;
    if (nUpLayout) {
      const pages = popupSheetKey ? popupSheetKey.split(',').map(Number) : [];
      renderNUpSheetToCanvas(preview.pdf, pages, nUpLayout, canvas, popupPxPerMm).catch(() => {});
      return;
    }
    canvas.style.width = '';
    canvas.style.height = '';
    const mode: RenderMode =
      scale === 'fit'
        ? { kind: 'fit-box', widthPx: frameWidthPx, heightPx: frameHeightPx }
        : { kind: 'absolute-points', pxPerPoint: popupPxPerMm * POINTS_TO_MM };
    renderPdfPageToCanvas(preview.pdf, popupPage, canvas, mode).catch(() => {});
  }, [
    isPreviewOpen,
    preview.kind,
    preview.pdf,
    popupPage,
    scale,
    frameWidthPx,
    frameHeightPx,
    popupPxPerMm,
    nUpLayout,
    popupSheetKey,
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
      scale: effectiveScale,
      pageRange,
      pagesPerSheet: effectivePagesPerSheet,
      quantity,
      unitPrice,
      pageCount: pagesToPrint,
    });
  }

  const isPreviewClickable = preview.state === 'ready';
  const numPages = preview.kind === 'pdf' ? preview.numPages : 0;

  return (
    <KioskScreenLayout
      onEndSession={onEndSession}
      onBack={onBack}
      onHome={onHome}
      cartItems={cartItems}
      onOpenCart={onOpenCart}
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
        <h1 className={styles.title}>
          {t.printOrderConfiguration.title}
          {batchPosition && (
            <span className={styles.batch}>
              {t.printOrderConfiguration.fileOfBatch(batchPosition.current, batchPosition.total)}
            </span>
          )}
        </h1>
        <OrderSteps current="settings" />
      </div>

      <div className={styles.columns}>
        <section className={styles.previewPanel}>
          <div className={styles.file}>
            <span className={styles.fileIcon} aria-hidden="true">
              <FileText size={28} />
            </span>
            <span className={styles.fileText}>
              <span className={styles.fileName}>{fileName}</span>
              {numPages > 0 && (
                <span className={styles.fileMeta}>
                  {t.printOrderConfiguration.pageCount(numPages)}
                </span>
              )}
            </span>
          </div>

          {/* Fixed-height slot: switching A4/A5 resizes the sheet without
              shifting anything around it. */}
          <div className={styles.previewSlot}>
            <div
              id="print-order-preview"
              className={styles.preview}
              onClick={isPreviewClickable ? () => setIsPreviewOpen(true) : undefined}
              style={{
                ...(preview.state === 'ready'
                  ? { width: `${thumbnailWidthPx}px`, height: `${thumbnailHeightPx}px` }
                  : undefined),
                ...(isPreviewClickable ? { cursor: 'pointer' } : undefined),
              }}
            >
              {/* Always mounted (not just when ready) so the ref exists before
                  the preview effect tries to render onto it — hidden until
                  there's actually something drawn. */}
              <canvas
                ref={thumbnailCanvasRef}
                className={effectiveScale === 'fit' ? styles.previewMedia : undefined}
                hidden={!(preview.state === 'ready' && preview.kind === 'pdf')}
              />
              {/* Images always show as "fit" — same reasoning as the popup's. */}
              {preview.state === 'ready' && preview.kind === 'image' && preview.imageUrl && (
                <img src={preview.imageUrl} alt={fileName} className={styles.previewMediaContain} />
              )}
              {preview.state === 'loading' && t.printOrderConfiguration.loadingPreview}
              {preview.state === 'unavailable' && <FileText size={64} aria-hidden="true" />}
            </div>
          </div>

          {isPreviewClickable && (
            <Button
              id="print-order-preview-open"
              variant="ghost"
              icon={<Maximize2 size={22} />}
              label={t.printOrderConfiguration.previewHint}
              onClick={() => setIsPreviewOpen(true)}
            />
          )}
        </section>

        {isPreviewOpen && (
          <Modal onClose={() => setIsPreviewOpen(false)}>
            <div ref={popupBoxRef} className={styles.previewFrameBox}>
              <div
                className={styles.previewFrame}
                style={{ width: `${frameWidthPx}px`, height: `${frameHeightPx}px` }}
              >
                {preview.kind === 'pdf' && (
                  <canvas
                    ref={popupCanvasRef}
                    className={effectiveScale === 'fit' ? styles.previewMedia : undefined}
                  />
                )}
                {/* Images always simulate as "fit" regardless of `scale` — a
                  raster image has no inherent physical size (unlike a PDF
                  page, whose points convert directly to mm), so an "original
                  size" comparison against real paper would need an assumed
                  DPI. Not worth the ambiguity for a secondary content type. */}
                {preview.kind === 'image' && preview.imageUrl && (
                  <img
                    src={preview.imageUrl}
                    alt={fileName}
                    className={styles.previewMediaContain}
                  />
                )}
              </div>
            </div>
            {preview.kind === 'pdf' && popupItemCount > 1 && (
              <div className={styles.previewNav}>
                <Button
                  id="print-order-preview-prev-page"
                  label="‹"
                  onClick={() => setPopupPage((page) => Math.max(1, page - 1))}
                  disabled={popupPage <= 1}
                />
                <span>
                  {nUpLayout
                    ? t.printOrderConfiguration.previewSheetIndicator(popupPage, popupItemCount)
                    : t.printOrderConfiguration.previewPageIndicator(popupPage, popupItemCount)}
                </span>
                <Button
                  id="print-order-preview-next-page"
                  label="›"
                  onClick={() => setPopupPage((page) => Math.min(popupItemCount, page + 1))}
                  disabled={popupPage >= popupItemCount}
                />
              </div>
            )}
          </Modal>
        )}

        <div className={styles.side}>
          <section className={styles.settingsPanel}>
            <SettingRow label={t.printOrderConfiguration.colorLegend}>
              <Segmented
                name="color"
                value={color}
                onChange={setColor}
                options={[
                  { value: 'bw', label: t.common.colorBw, id: 'print-order-color-bw' },
                  { value: 'color', label: t.common.colorColor, id: 'print-order-color-color' },
                ]}
              />
            </SettingRow>

            <SettingRow
              label={t.printOrderConfiguration.sidesLegend}
              hint={duplexAvailable ? undefined : t.common.sidesDoubleA4Only}
            >
              <Segmented
                name="sides"
                value={sides}
                onChange={setSides}
                options={[
                  { value: 'single', label: t.common.sidesSingle, id: 'print-order-sides-single' },
                  {
                    value: 'double',
                    label: t.common.sidesDouble,
                    id: 'print-order-sides-double',
                    disabled: !duplexAvailable,
                  },
                ]}
              />
            </SettingRow>

            {OFFERED_PAPER_SIZES.length > 1 && (
              <SettingRow label={t.printOrderConfiguration.paperSizeLegend}>
                <Segmented
                  name="paperSize"
                  value={paperSize}
                  onChange={selectPaperSize}
                  options={OFFERED_PAPER_SIZES.map((size) => ({
                    value: size,
                    label: size === 'A4' ? t.common.paperSizeA4 : t.common.paperSizeA5,
                    id: `print-order-paper-${size.toLowerCase()}`,
                  }))}
                />
              </SettingRow>
            )}

            {numPages > 1 && (
              <SettingRow label={t.printOrderConfiguration.pagesLegend}>
                <div className={styles.pages}>
                  <Segmented
                    name="pageRangeMode"
                    value={pageRangeMode}
                    onChange={setPageRangeMode}
                    options={[
                      {
                        value: 'all',
                        label: t.printOrderConfiguration.pagesAll,
                        id: 'print-order-pages-all',
                      },
                      {
                        value: 'custom',
                        label: t.printOrderConfiguration.pagesCustom,
                        id: 'print-order-pages-custom',
                      },
                    ]}
                  />
                  {pageRangeMode === 'custom' && (
                    <div className={styles.pageRange}>
                      <span>{t.printOrderConfiguration.pagesFrom}</span>
                      <Stepper
                        id="print-order-range-from"
                        value={rangeFrom}
                        onChange={setRangeFrom}
                        min={1}
                        max={rangeTo}
                      />
                      <span>{t.printOrderConfiguration.pagesTo}</span>
                      <Stepper
                        id="print-order-range-to"
                        value={rangeTo}
                        onChange={setRangeTo}
                        min={rangeFrom}
                        max={numPages}
                      />
                    </div>
                  )}
                </div>
              </SettingRow>
            )}

            {nUpAvailable && (
              <SettingRow label={t.printOrderConfiguration.pagesPerSheetLegend}>
                <Segmented
                  name="pagesPerSheet"
                  value={effectivePagesPerSheet}
                  onChange={setPagesPerSheet}
                  options={PAGES_PER_SHEET_OPTIONS.map((option) => ({
                    value: option,
                    label: String(option),
                    id: `print-order-pages-per-sheet-${option}`,
                  }))}
                />
              </SettingRow>
            )}

            {!nUpLayout && (
              <SettingRow label={t.printOrderConfiguration.scaleLegend}>
                <Segmented
                  name="scale"
                  value={scale}
                  onChange={setScale}
                  options={[
                    { value: 'fit', label: t.common.scaleFit, id: 'print-order-scale-fit' },
                    {
                      value: 'original',
                      label: t.common.scaleOriginal,
                      id: 'print-order-scale-original',
                    },
                  ]}
                />
              </SettingRow>
            )}

            <SettingRow label={t.printOrderConfiguration.quantity}>
              <Stepper id="print-order-quantity" value={quantity} onChange={setQuantity} min={1} />
            </SettingRow>
          </section>

          <section className={styles.summary}>
            <div className={styles.summaryText}>
              <span className={styles.summaryDetails}>
                {t.printOrderConfiguration.summary(pagesToPrint, quantity)}
              </span>
              <span className={styles.total}>
                {t.printOrderConfiguration.total}{' '}
                <span id="print-order-price" className={styles.price}>
                  {formatEuro(unitPrice * quantity)}
                </span>
              </span>
            </div>
            <Button
              id="print-order-add-to-cart"
              variant="primary"
              icon={<ShoppingCart size={24} />}
              label={t.printOrderConfiguration.addToCart}
              onClick={handleAddToCart}
            />
          </section>
        </div>
      </div>
    </KioskScreenLayout>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <div className={styles.rowControl}>
        {children}
        {hint && <span className={styles.hint}>{hint}</span>}
      </div>
    </div>
  );
}

// A set of mutually exclusive choices drawn as one pill: native radios
// underneath (keyboard and screen readers keep working), the checked one
// lifted out of the track.
function Segmented<T extends string | number>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; id: string; disabled?: boolean }[];
}) {
  return (
    <div className={styles.segmented} role="radiogroup">
      {options.map((option) => (
        <label key={option.value} className={styles.segment}>
          <input
            type="radio"
            name={name}
            id={option.id}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

// −/+ around a number — the stand has no keyboard to type one in.
function Stepper({
  id,
  value,
  onChange,
  min,
  max = Infinity,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max?: number;
}) {
  return (
    <div className={styles.stepper}>
      <button
        type="button"
        id={`${id}-decrement`}
        className={styles.stepperButton}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="−"
      >
        <Minus size={24} />
      </button>
      <span className={styles.stepperValue} id={`${id}-value`}>
        {value}
      </span>
      <button
        type="button"
        id={`${id}-increment`}
        className={styles.stepperButton}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="+"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
