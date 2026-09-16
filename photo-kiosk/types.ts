import type { CropLandmarks } from './cropUtil';

// Shared shape both branches ("Фото на документы" and "Произвольный размер") build,
// so the capture/review/gallery screens don't care which branch produced it
// (docs/photo-kiosk-requirements.md — both reuse the same downstream flow).
export interface CaptureSpec {
  label: string;
  widthMm: number;
  heightMm: number;
  instructions?: string | null;
  // Feeds mm->px conversion for the real crop (cropUtil.ts) and the A4
  // composition. Undefined only on "Произвольный размер" when the
  // admin-managed DPI isn't known — cropUtil.ts's DEFAULT_DPI applies then.
  dpi?: number;
  // Only ever set when built from a DB PhotoDocument — feeds the capture
  // guide's decorative head-height band. Undefined on "Произвольный размер"
  // (that branch never collects this).
  headHeightMinMm?: number;
  headHeightMaxMm?: number;
  // Vertical crop anchor — a spec sets at least one of these two (mirrors
  // server/db/schema.ts's photoDocuments: most issuers publish an eye-line,
  // China-style ones publish a top margin instead and never give an
  // eye-line). cropUtil.ts falls back to a default eye-line ratio only when
  // BOTH are absent (the "Произвольный размер" branch left blank).
  eyeLineFromBottomMm?: number;
  marginTopMm?: number;
  // Distinct from widthMm — how wide the HEAD itself must be, not the frame.
  // Only ever set when built from a DB PhotoDocument; "Произвольный размер"
  // doesn't collect this.
  headWidthMinMm?: number;
  headWidthMaxMm?: number;
  // Admin-configurable per Document (server/db/schema.ts's photoDocuments.copiesPerSheet)
  // — how many photos are tiled onto ONE A4 sheet, not how many sheets get
  // printed (that's PhotoCartItem.quantity, a separate customer-editable
  // concept). Undefined on "Произвольный размер" (no admin record) —
  // sheetComposer.ts's DEFAULT_PHOTOS_PER_SHEET applies then.
  copiesPerSheet?: number;
  // Admin-configurable per Document (server/db/schema.ts's photoDocuments.priceCents)
  // — price for one copy (one A4 sheet). Undefined on "Произвольный размер"
  // (no admin record) — pricing.ts's DEFAULT_PRICE_CENTS applies then.
  priceCents?: number;
  // Admin-configurable per Document (server/db/schema.ts's photoDocuments.backgroundColorHex)
  // — a `#RRGGBB` the capture pipeline's real background segmentation
  // (backgroundSegmentation.ts) recolors to. Undefined skips segmentation
  // entirely (the booth's own physical backdrop is used unmodified) —
  // "Произвольный размер" never collects this, and a real document only
  // has it once an admin picks a concrete target color.
  backgroundColorHex?: string;
  // 'a4-sheet' (default when absent) — sheetComposer.ts's composeA4Sheet
  // tiles `copiesPerSheet` identical small prints onto one A4 page with
  // cut-guides, for the document-photo sizes this was originally built
  // for. 'single-print' — sheetComposer.ts's composeSinglePrint instead:
  // the shot fills the ENTIRE page with no margin/tiling, because the
  // "page" itself already IS the final print medium (e.g. 10×15cm photo
  // paper, not an A4 sheet you cut smaller prints out of). Added 2026-09
  // after "AI бэкграунд"'s first real test showed exactly what tiling a
  // 100×150mm shot under 'a4-sheet' rules produces: only one physically
  // fits per "sheet," so every other requested copy silently gets dropped
  // and the one that IS drawn sits in a corner of an otherwise-blank A4
  // page instead of filling the actual print.
  printMode?: 'a4-sheet' | 'single-print';
}

/** One confirmed shoot, ready for checkout — pushed onto the cart on
 * "Добавить в корзину" (GalleryScreen). `photosPerSheet` identical prints of
 * `shot` are tiled onto ONE A4 sheet (sheetComposer.ts) — not a gallery of
 * distinct shots, matching standard ID-photo sheet printing. `quantity` is a
 * separate, customer-editable concept: how many such sheets to print (e.g.
 * "2 листа, каждый с 6 фото"), never to be confused with `photosPerSheet`
 * (confirmed with the product owner after the two were shown conflated in
 * the cart UI as one "N копий" number). */
export interface PhotoCartItem {
  id: string;
  spec: CaptureSpec;
  // The cropped (not raw) confirmed shot. Cleared on checkout completion and
  // on End Session — never persisted to localStorage (privacy over convenience).
  shot: string;
  photosPerSheet: number;
  // Price for one copy (one sheet), baked in at "Добавить в корзину" time —
  // see pricing.ts. Total for this item is unitPriceCents * quantity.
  unitPriceCents: number;
  // Customer-editable in the Cart popup (+/- stepper) — defaults to 1.
  quantity: number;
  // Pre-rendered A4 tiling of `shot` x `photosPerSheet` (sheetComposer.ts),
  // computed once at "Добавить в корзину" time and reused by both the Cart
  // popup and the Print screen instead of recomposing on every render. One
  // sheet's worth — `quantity` sheets of this exact layout get printed.
  sheetPreviewDataUrl: string;
  createdAt: number;
}

/** The output of CaptureScreen, before the customer has confirmed anything —
 * a generous crop (wider than the final document size) around either real
 * detected face landmarks or, if detection found no single clear face, a
 * heuristic estimate (cropUtil.ts's estimateFallbackLandmarks). ShotReviewScreen
 * lets the customer drag/nudge `landmarks` before cutting the actual
 * document-sized crop (cropUtil.ts's finalizeCrop) — nothing here is the
 * final printable photo yet. */
export interface PendingShot {
  rawDataUrl: string;
  rawWidth: number;
  rawHeight: number;
  landmarks: CropLandmarks;
}
