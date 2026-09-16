import { mmToPx, DEFAULT_DPI } from './cropUtil';
import type { CaptureSpec } from './types';

// A4 sheet composition (docs/photo-kiosk-requirements.md's wireframe screen 8:
// "the print is on one A4 sheet, physically cut out by the customer in the
// self-service area, no automatic cutting hardware") — entirely client-side,
// never uploaded anywhere, since photo privacy is confirmed more sensitive
// than document privacy and no server-side storage of photo content exists.
//
// Real-world ID-photo printing convention (confirmed with the product owner):
// N identical copies of the ONE confirmed shot, not a gallery of distinct
// shots — matches how passport-photo services actually sell a sheet.

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const OUTER_MARGIN_MM = 8;
const GUTTER_MM = 4;

// Admin-configurable per Document (photoDocuments.copiesPerSheet) — this is
// only the fallback for "Произвольный размер," which has no admin record.
export const DEFAULT_PHOTOS_PER_SHEET = 6;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Tiles `photosPerSheet` identical prints of the one accepted (already-
 * cropped) shot on one A4 sheet with a cut-guide border, row-major starting
 * top-left. Uses a near-square grid (columns = ceil(sqrt(photosPerSheet)))
 * rather than greedily maximizing columns to fit the sheet width — for
 * typical small ID-photo sizes, packing everything into one wide row would
 * either overflow the sheet or leave an ungainly near-empty second row.
 * Photos beyond what physically fits on one sheet are dropped — multi-sheet
 * composition (for `PhotoCartItem.quantity` > 1) isn't needed here: each
 * sheet in a multi-quantity order is identical, so one preview represents
 * all of them. */
export async function composeA4Sheet(
  shotDataUrl: string,
  spec: CaptureSpec,
  photosPerSheet: number = DEFAULT_PHOTOS_PER_SHEET,
): Promise<string> {
  const dpi = spec.dpi ?? DEFAULT_DPI;
  const sheetW = mmToPx(A4_WIDTH_MM, dpi);
  const sheetH = mmToPx(A4_HEIGHT_MM, dpi);
  const cellW = mmToPx(spec.widthMm, dpi);
  const cellH = mmToPx(spec.heightMm, dpi);
  const gutter = mmToPx(GUTTER_MM, dpi);
  const margin = mmToPx(OUTER_MARGIN_MM, dpi);
  const maxColumns = Math.max(1, Math.floor((sheetW - 2 * margin + gutter) / (cellW + gutter)));
  const maxRows = Math.max(1, Math.floor((sheetH - 2 * margin + gutter) / (cellH + gutter)));

  const columns = Math.min(maxColumns, Math.max(1, Math.ceil(Math.sqrt(photosPerSheet))));
  const rows = Math.min(maxRows, Math.ceil(photosPerSheet / columns));
  const cellCount = Math.min(photosPerSheet, columns * rows);

  const canvas = document.createElement('canvas');
  canvas.width = sheetW;
  canvas.height = sheetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sheetW, sheetH);
  ctx.strokeStyle = '#cccccc';

  const img = await loadImage(shotDataUrl);
  for (let i = 0; i < cellCount; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = margin + col * (cellW + gutter);
    const y = margin + row * (cellH + gutter);
    ctx.drawImage(img, x, y, cellW, cellH);
    ctx.strokeRect(x, y, cellW, cellH);
  }

  return canvas.toDataURL('image/jpeg', 0.9);
}

/** CaptureSpec.printMode === 'single-print' companion to composeA4Sheet:
 * the shot fills the WHOLE canvas at exactly spec.widthMm×heightMm, no
 * margin, no cut-guides, no tiling — because the "page" here already IS
 * one physical print (e.g. 10×15cm photo paper), not an A4 sheet several
 * smaller prints get cut out of. `quantity` (PhotoCartItem's own field)
 * already means "how many separate prints," so there's nothing here for
 * copiesPerSheet to do. */
export async function composeSinglePrint(shotDataUrl: string, spec: CaptureSpec): Promise<string> {
  const dpi = spec.dpi ?? DEFAULT_DPI;
  const width = mmToPx(spec.widthMm, dpi);
  const height = mmToPx(spec.heightMm, dpi);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = await loadImage(shotDataUrl);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.92);
}
