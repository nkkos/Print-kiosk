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
  // Admin-configurable per Document (server/db/schema.ts's photoDocuments.copiesPerSheet).
  // Undefined on "Произвольный размер" (no admin record) — sheetComposer.ts's
  // DEFAULT_COPIES_PER_SHEET applies then. Real-world ID-photo printing
  // convention: N copies of the ONE confirmed shot on one A4 sheet, not a
  // gallery of distinct shots (confirmed with the product owner).
  copiesPerSheet?: number;
}

/** One confirmed shoot, ready for checkout — pushed onto the cart on
 * "Добавить в корзину" (GalleryScreen). `copies` identical prints of `shot`
 * are tiled onto one A4 sheet (sheetComposer.ts) — not a gallery of distinct
 * shots, matching standard ID-photo sheet printing. */
export interface PhotoCartItem {
  id: string;
  spec: CaptureSpec;
  // The cropped (not raw) confirmed shot. Cleared on checkout completion and
  // on End Session — never persisted to localStorage (privacy over convenience).
  shot: string;
  copies: number;
  // Pre-rendered A4 tiling of `shot` x `copies` (sheetComposer.ts), computed
  // once at "Добавить в корзину" time and reused by both the Cart popup and
  // the Print screen instead of recomposing on every render.
  sheetPreviewDataUrl: string;
  createdAt: number;
}
