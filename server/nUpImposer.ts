import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  computeNUpLayout,
  fitIntoCell,
  pageNumbersInRange,
  type PagesPerSheet,
} from '../src/utils/nUpLayout.js';

// Builds the PDF that actually gets printed for "pages per sheet": the
// selected pages laid out several to a sheet, using exactly the geometry the
// kiosk/portal preview draws (src/utils/nUpLayout.ts). SumatraPDF can't do
// N-up and the Brother driver's own "multiple pages" setting isn't reachable
// from outside it, so the imposition happens here and the printer just gets
// an ordinary PDF of whole sheets.

const MM_TO_POINTS = 72 / 25.4;
const PAPER_SIZE_MM: Record<string, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
};

// Temp dir, not next to the upload: it's a derived file, cheap to rebuild,
// and shouldn't outlive the upload's own retention sweep.
const CACHE_DIR = join(tmpdir(), 'print-kiosk-nup');

export interface ImposedPdf {
  path: string;
  /** The printed sheet's orientation — picks the duplex flip edge. */
  orientation: 'portrait' | 'landscape';
}

export async function imposeNUp(
  sourcePath: string,
  pagesPerSheet: Exclude<PagesPerSheet, 1>,
  paperSize: string | undefined,
  pageRange: string | undefined,
): Promise<ImposedPdf> {
  const paperMm = PAPER_SIZE_MM[paperSize ?? 'A4'] ?? PAPER_SIZE_MM.A4;
  const { mtimeMs } = await stat(sourcePath);
  const key = createHash('sha256')
    .update(JSON.stringify([sourcePath, mtimeMs, pagesPerSheet, paperMm, pageRange ?? '']))
    .digest('hex')
    .slice(0, 32);

  const source = await PDFDocument.load(await readFile(sourcePath), { ignoreEncryption: true });
  const sourcePages = source.getPages();
  const pageNumbers = pageNumbersInRange(pageRange, sourcePages.length);

  // Layout from the first selected page's displayed shape — the preview uses
  // the document's first page the same way.
  const first = sourcePages[pageNumbers[0] - 1] ?? sourcePages[0];
  const firstRotated = first.getRotation().angle % 180 !== 0;
  const { width: firstWidth, height: firstHeight } = first.getSize();
  const pageAspect = firstRotated ? firstHeight / firstWidth : firstWidth / firstHeight;
  const layout = computeNUpLayout(pagesPerSheet, pageAspect, paperMm);

  const path = join(CACHE_DIR, `${key}.pdf`);
  if (existsSync(path)) return { path, orientation: layout.orientation };

  const output = await PDFDocument.create();
  const embedded = await output.embedPages(pageNumbers.map((n) => sourcePages[n - 1]));
  const sheetWidth = layout.widthMm * MM_TO_POINTS;
  const sheetHeight = layout.heightMm * MM_TO_POINTS;

  for (let start = 0; start < embedded.length; start += pagesPerSheet) {
    const sheet = output.addPage([sheetWidth, sheetHeight]);
    for (let slot = 0; slot < pagesPerSheet && start + slot < embedded.length; slot++) {
      const page = embedded[start + slot];
      const rotation = (((sourcePages[pageNumbers[start + slot] - 1].getRotation().angle % 360) +
        360) %
        360) as 0 | 90 | 180 | 270;
      const turned = rotation === 90 || rotation === 270;
      // Displayed size, as a viewer (and the preview) shows the page.
      const shownWidth = turned ? page.height : page.width;
      const shownHeight = turned ? page.width : page.height;
      const cell = layout.cells[slot];
      const box = fitIntoCell(
        {
          x: cell.x * MM_TO_POINTS,
          y: cell.y * MM_TO_POINTS,
          width: cell.width * MM_TO_POINTS,
          height: cell.height * MM_TO_POINTS,
        },
        shownWidth,
        shownHeight,
      );
      // The layout measures from the top-left; PDF from the bottom-left.
      const left = box.x;
      const bottom = sheetHeight - box.y - box.height;
      const scale = box.width / shownWidth;
      const width = page.width * scale;
      const height = page.height * scale;
      // pdf-lib rotates counter-clockwise about the drawing origin, so the
      // origin is shifted to keep the rotated page inside its box.
      const placement = {
        0: { x: left, y: bottom, rotate: 0 },
        90: { x: left, y: bottom + width, rotate: -90 },
        180: { x: left + width, y: bottom + height, rotate: 180 },
        270: { x: left + height, y: bottom, rotate: 90 },
      }[rotation];
      sheet.drawPage(page, {
        x: placement.x,
        y: placement.y,
        width,
        height,
        rotate: degrees(placement.rotate),
      });
    }
  }

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path, await output.save());
  return { path, orientation: layout.orientation };
}
