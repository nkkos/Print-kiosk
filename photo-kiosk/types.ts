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
  eyeLineFromBottomMm?: number;
  // Only ever set by "Произвольный размер" — an admin-managed Document has no
  // equivalent field. Not yet consumed by the manual-guide crop (the guide
  // box is already sized to the exact target aspect ratio) — will matter once
  // the deferred automatic face-centered crop replaces this simplified pass.
  marginMm?: number;
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
