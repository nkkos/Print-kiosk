import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Real document preview + page-range selection (docs/email-upload-requirements.md,
// "Preview and print configuration") — shared between the kiosk's
// PrintOrderConfigurationScreen and the portal's own "Configure & pay" panel
// (portal/FilesPage.tsx), extracted once that second consumer needed the
// identical fetch/render/page-range logic (docs/implementation/project-architecture.md,
// Section 9). Each screen still owns its own preview/settings JSX — the
// kiosk renders inside a Modal (its popup rules don't apply to the portal,
// a plain scrolling webpage), the portal renders its own lightweight
// overlay — only the data/rendering logic is shared here.

export type PreviewState = 'loading' | 'ready' | 'unavailable';
export type PreviewKind = 'pdf' | 'image';
export type PageOrientation = 'portrait' | 'landscape';

export interface Preview {
  state: PreviewState;
  kind: PreviewKind | null;
  /** Kept around (not discarded after rendering page 1) so switching pages
   * in the popup re-renders from the already-downloaded bytes — no new
   * network requests. */
  pdf: PDFDocumentProxy | null;
  numPages: number;
  imageUrl: string | null;
  /** The document's own orientation (first page of a PDF, or the image) —
   * a converted file can't be re-laid-out, so the kiosk follows it instead
   * of offering a choice (the printer rotates each page onto the sheet). */
  orientation: PageOrientation | null;
}

export const EMPTY_PREVIEW: Preview = {
  state: 'unavailable',
  kind: null,
  pdf: null,
  numPages: 0,
  imageUrl: null,
  orientation: null,
};

/** Fetches and decodes the file at `contentUrl` (undefined = no real file —
 * e.g. a mocked item with nothing to preview) into a `Preview`. The caller
 * resolves which content endpoint to hit (uploadedFileApi vs
 * accountFileApi) — this hook only cares about the final URL. */
export function usePreview(contentUrl: string | undefined): Preview {
  const [preview, setPreview] = useState<Preview>(
    contentUrl ? { ...EMPTY_PREVIEW, state: 'loading' } : EMPTY_PREVIEW,
  );

  useEffect(() => {
    if (!contentUrl) {
      setPreview(EMPTY_PREVIEW);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setPreview({ ...EMPTY_PREVIEW, state: 'loading' });

    fetch(contentUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error('Preview unavailable');
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.startsWith('image/')) {
          const blob = await response.blob();
          const bitmap = await createImageBitmap(blob).catch(() => null);
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setPreview({
            state: 'ready',
            kind: 'image',
            pdf: null,
            numPages: 0,
            imageUrl: objectUrl,
            orientation: bitmap ? (bitmap.width > bitmap.height ? 'landscape' : 'portrait') : null,
          });
          bitmap?.close();
          return;
        }

        const data = await response.arrayBuffer();
        if (cancelled) return;
        // Loaded on demand (not a top-level import) — it's a large library
        // only needed for PDF-backed previews specifically, not every visit.
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        const orientation = await getPdfPageOrientation(pdf, 1);
        if (cancelled) return;
        setPreview({
          state: 'ready',
          kind: 'pdf',
          pdf,
          numPages: pdf.numPages,
          imageUrl: null,
          orientation,
        });
      })
      .catch(() => {
        if (!cancelled) setPreview(EMPTY_PREVIEW);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [contentUrl]);

  return preview;
}

export type RenderMode =
  | { kind: 'fit-width'; targetWidthPx: number }
  | { kind: 'fit-box'; widthPx: number; heightPx: number }
  | { kind: 'absolute-points'; pxPerPoint: number };

/** A page's orientation as it will look on paper — its own size combined
 * with any rotation stored in the PDF. */
export async function getPdfPageOrientation(
  pdf: PDFDocumentProxy,
  pageNumber: number,
): Promise<PageOrientation> {
  const page = await pdf.getPage(pageNumber);
  const { width, height } = page.getViewport({ scale: 1 });
  return width > height ? 'landscape' : 'portrait';
}

// Renders the page exactly as it is (its own rotation included) — no
// simulated re-orientation: the printer rotates each page onto the sheet.
export async function renderPdfPageToCanvas(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  mode: RenderMode,
): Promise<void> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale =
    mode.kind === 'fit-width'
      ? mode.targetWidthPx / base.width
      : mode.kind === 'fit-box'
        ? Math.min(mode.widthPx / base.width, mode.heightPx / base.height)
        : mode.pxPerPoint;
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');
  if (!context) return;
  await page.render({ canvasContext: context, viewport, canvas }).promise;
}

export interface PageRangeSelection {
  pageRangeMode: 'all' | 'custom';
  setPageRangeMode: (mode: 'all' | 'custom') => void;
  rangeFrom: number;
  setRangeFrom: (value: number) => void;
  rangeTo: number;
  setRangeTo: (value: number) => void;
  /** Real page count to charge/print for the current selection — single-page
   * PDFs, images, and items with no real file all implicitly print/charge
   * for 1 page. */
  pagesToPrint: number;
  /** The exact pdf-to-printer page-range syntax ("2-5") — undefined means
   * every page (src/types/kiosk.ts's PrintOrder.pageRange). */
  pageRange: string | undefined;
}

/** Page range (docs/email-upload-requirements.md's bare mention of "page
 * range" as a future setting — now real). Only meaningful for a multi-page
 * PDF. */
export function usePageRangeSelection(preview: Preview): PageRangeSelection {
  const [pageRangeMode, setPageRangeMode] = useState<'all' | 'custom'>('all');
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(1);

  // Defaults "custom" to the full range once the real page count is known,
  // so switching to it starts pre-filled rather than collapsed to page 1 —
  // only fires once, when numPages first becomes available; a later manual
  // edit to rangeTo is never overwritten since numPages doesn't change again.
  useEffect(() => {
    if (preview.kind === 'pdf' && preview.numPages > 0) {
      setRangeTo(preview.numPages);
    }
  }, [preview.kind, preview.numPages]);

  const pagesToPrint =
    preview.kind === 'pdf' && pageRangeMode === 'custom'
      ? Math.max(1, rangeTo - rangeFrom + 1)
      : preview.kind === 'pdf'
        ? preview.numPages || 1
        : 1;
  const pageRange =
    preview.kind === 'pdf' && pageRangeMode === 'custom' ? `${rangeFrom}-${rangeTo}` : undefined;

  return {
    pageRangeMode,
    setPageRangeMode,
    rangeFrom,
    setRangeFrom,
    rangeTo,
    setRangeTo,
    pagesToPrint,
    pageRange,
  };
}
