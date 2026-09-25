// "Pages per sheet" (N-up): several document pages laid out on one printed
// sheet side. Pure geometry, no browser or Node APIs — shared by the preview
// (src/utils/documentPreview.ts, kiosk and portal) and by the cloud, which
// builds the actual imposed PDF that gets printed (server/nUpImposer.ts), so
// what the customer sees is exactly what comes out.

export type PagesPerSheet = 1 | 2 | 4 | 6;
export const PAGES_PER_SHEET_OPTIONS: readonly PagesPerSheet[] = [1, 2, 4, 6];

export function isPagesPerSheet(value: unknown): value is PagesPerSheet {
  return PAGES_PER_SHEET_OPTIONS.includes(value as PagesPerSheet);
}

// Sheet margin and the gap between cells — the margin clears the printer's
// unprintable edge (≈4.2 mm on the Brother), since the imposed sheet is
// printed 1:1.
const SHEET_MARGIN_MM = 6;
const CELL_GAP_MM = 4;

// Grids tried for each N (columns × rows) — only near-square ones; 4-in-a-row
// strips would make every page tiny.
const GRIDS: Record<Exclude<PagesPerSheet, 1>, [number, number][]> = {
  2: [
    [2, 1],
    [1, 2],
  ],
  4: [[2, 2]],
  6: [
    [3, 2],
    [2, 3],
  ],
};

export interface Cell {
  /** mm from the sheet's top-left corner */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SheetLayout {
  orientation: 'portrait' | 'landscape';
  widthMm: number;
  heightMm: number;
  /** In reading order: left to right, then top to bottom. */
  cells: Cell[];
}

/** Picks the grid and sheet orientation that show the pages largest, given
 * the document's page shape (`pageAspect` = width / height, e.g. ≈0.71 for a
 * portrait A4 page, ≈1.78 for a 16:9 slide). */
export function computeNUpLayout(
  pagesPerSheet: Exclude<PagesPerSheet, 1>,
  pageAspect: number,
  paperMm: { width: number; height: number },
): SheetLayout {
  let best: { layout: SheetLayout; pageArea: number } | null = null;
  for (const orientation of ['portrait', 'landscape'] as const) {
    const widthMm = orientation === 'portrait' ? paperMm.width : paperMm.height;
    const heightMm = orientation === 'portrait' ? paperMm.height : paperMm.width;
    for (const [columns, rows] of GRIDS[pagesPerSheet]) {
      const cellWidth = (widthMm - 2 * SHEET_MARGIN_MM - (columns - 1) * CELL_GAP_MM) / columns;
      const cellHeight = (heightMm - 2 * SHEET_MARGIN_MM - (rows - 1) * CELL_GAP_MM) / rows;
      // Largest page of this shape that fits one cell.
      const pageWidth = Math.min(cellWidth, cellHeight * pageAspect);
      const pageArea = pageWidth * (pageWidth / pageAspect);
      // Ties (and near-ties) keep the first candidate — portrait sheet first.
      if (best && pageArea <= best.pageArea * 1.001) continue;
      const cells: Cell[] = [];
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          cells.push({
            x: SHEET_MARGIN_MM + column * (cellWidth + CELL_GAP_MM),
            y: SHEET_MARGIN_MM + row * (cellHeight + CELL_GAP_MM),
            width: cellWidth,
            height: cellHeight,
          });
        }
      }
      best = { layout: { orientation, widthMm, heightMm, cells }, pageArea };
    }
  }
  return best!.layout;
}

/** Where a page of `pageWidth` × `pageHeight` (any unit) goes inside `cell`:
 * scaled to fit, centred. Same units as the cell. */
export function fitIntoCell(
  cell: Cell,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(cell.width / pageWidth, cell.height / pageHeight);
  const width = pageWidth * scale;
  const height = pageHeight * scale;
  return {
    x: cell.x + (cell.width - width) / 2,
    y: cell.y + (cell.height - height) / 2,
    width,
    height,
  };
}

/** Printed sheet sides for `pageCount` pages — what printing is charged by. */
export function sheetSidesFor(pageCount: number, pagesPerSheet: PagesPerSheet): number {
  return Math.max(1, Math.ceil(pageCount / pagesPerSheet));
}

/** 1-based page numbers selected by a page range in the kiosk's syntax
 * ("2-5", "1,3,7-9"); undefined = every page. Out-of-range numbers dropped. */
export function pageNumbersInRange(pageRange: string | undefined, numPages: number): number[] {
  const all = Array.from({ length: numPages }, (_, i) => i + 1);
  if (!pageRange) return all;
  const selected = new Set<number>();
  for (const part of pageRange.split(',')) {
    const [fromText, toText] = part.split('-').map((text) => text.trim());
    const from = Number(fromText);
    const to = toText === undefined ? from : Number(toText);
    if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
    for (let page = Math.min(from, to); page <= Math.max(from, to); page++) {
      if (page >= 1 && page <= numPages) selected.add(page);
    }
  }
  return all.filter((page) => selected.has(page));
}
