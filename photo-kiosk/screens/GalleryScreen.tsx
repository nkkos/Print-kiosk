import type { CaptureSpec } from '../types';

interface GalleryScreenProps {
  spec: CaptureSpec;
  hasAcceptedShot: boolean;
  copies: number;
  sheetPreview: string | null;
  onRetake: () => void;
  onAddToCart: () => void;
  isComposingSheet: boolean;
}

// docs/photo-kiosk-requirements.md's wireframe screen 8: prints on one A4
// sheet, physically cut out by the customer in the self-service area — no
// automatic cutting hardware. Shows the REAL print-page preview
// (sheetComposer.ts's composeA4Sheet, kept live-updated by PhotoKioskApp.tsx)
// — N identical copies of the ONE confirmed shot, matching real-world
// ID-photo printing convention (confirmed with the product owner), not a
// gallery of distinct shots.
export function GalleryScreen({
  spec,
  hasAcceptedShot,
  copies,
  sheetPreview,
  onRetake,
  onAddToCart,
  isComposingSheet,
}: GalleryScreenProps) {
  const isSinglePrint = spec.printMode === 'single-print';

  return (
    <div className="pk-screen pk-screen-center" id="view-gallery">
      <h1 className="pk-title">Предпросмотр печати</h1>
      <p className="pk-form-hint">
        {isSinglePrint
          ? `Печать на фотобумаге 10×15 — ${spec.label}.`
          : `Печать на листе А4 — ${spec.label}, ${copies} копий. Вы можете вырезать фотографии в зоне самостоятельной работы.`}
      </p>
      {sheetPreview ? (
        <img
          src={sheetPreview}
          alt="Предпросмотр листа печати"
          className={isSinglePrint ? 'pk-sheet-preview-single' : 'pk-sheet-preview'}
          id="gallery-sheet-preview"
        />
      ) : (
        <p className="pk-empty-note">Готовим предпросмотр листа…</p>
      )}
      <div className="pk-hero-actions">
        <button
          type="button"
          className="pk-btn pk-btn-ghost"
          id="gallery-retake"
          onClick={onRetake}
        >
          Переснять
        </button>
        <button
          type="button"
          className="pk-btn pk-btn-primary"
          id="gallery-add-to-cart"
          onClick={onAddToCart}
          disabled={!hasAcceptedShot || isComposingSheet}
        >
          {isComposingSheet ? 'Готовим лист…' : 'Добавить в корзину'}
        </button>
      </div>
    </div>
  );
}
