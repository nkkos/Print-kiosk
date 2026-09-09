// Classical chroma-key background replacement — colour distance from the
// booth's own known physical backdrop, NOT ML segmentation
// (backgroundSegmentation.ts, kept in the codebase but no longer wired into
// CaptureScreen). Confirmed 2026-09-XX after real testing: the general
// selfie-segmenter model, trained on natural photos, performed WORSE on a
// saturated/contrasting backdrop than on a plain wall — an artificial
// solid-color backdrop is out-of-distribution input for that model, not an
// easy case the way it is for a colour-distance keyer. Chroma-key is the
// right tool specifically because the booth has (or will have) a
// controlled, uniform backdrop — the exact scenario this decades-old
// broadcast/photography technique was built for — and needs no model
// download or inference at all.

// The booth's own physical backdrop colour — a hardware property, not a
// per-document one, hence a single constant rather than admin data. This is
// a placeholder chroma green; replace it with the real backdrop's measured
// colour (sample a pixel directly from a real photo of the installed
// backdrop, under the booth's actual lighting) once that hardware exists.
export const BOOTH_BACKDROP_COLOR_HEX = '#00b140';

// Normalized RGB Euclidean distance (0-1) thresholds: at/below LOW, a pixel
// is definitely background; at/above HIGH, definitely foreground; linear
// ramp between the two for a soft, not jagged, edge. Tuned for a bright,
// saturated backdrop clearly separated from skin/hair/clothing colours —
// re-tune once real footage of the installed backdrop exists.
const DISTANCE_LOW = 0.18;
const DISTANCE_HIGH = 0.38;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function normalizedDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const dr = (r1 - r2) / 255;
  const dg = (g1 - g2) / 255;
  const db = (b1 - b2) / 255;
  return Math.sqrt(dr * dr + dg * dg + db * db) / Math.sqrt(3);
}

// No model to preload — kept so CaptureScreen.tsx's mount effect doesn't
// need a conditional depending on which background-removal strategy is
// wired in (see backgroundSegmentation.ts's own version of this name).
export function preloadBackgroundRemoval(): void {
  // Intentionally empty.
}

/** Replaces every pixel close (in colour) to BOOTH_BACKDROP_COLOR_HEX with
 * `targetHex`, in place — returns the same canvas it drew `source` onto.
 * Async signature kept for drop-in parity with backgroundSegmentation.ts's
 * same-named export, even though this is pure synchronous pixel math. */
export async function recolorBackground(
  source: HTMLVideoElement | HTMLCanvasElement,
  targetHex: string,
): Promise<HTMLCanvasElement> {
  const width = 'videoWidth' in source ? source.videoWidth : source.width;
  const height = 'videoHeight' in source ? source.videoHeight : source.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(source, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const [keyR, keyG, keyB] = hexToRgb(BOOTH_BACKDROP_COLOR_HEX);
  const [targetR, targetG, targetB] = hexToRgb(targetHex);

  for (let i = 0; i < pixels.length; i += 4) {
    const distance = normalizedDistance(pixels[i], pixels[i + 1], pixels[i + 2], keyR, keyG, keyB);
    let backgroundWeight: number;
    if (distance <= DISTANCE_LOW) backgroundWeight = 1;
    else if (distance >= DISTANCE_HIGH) backgroundWeight = 0;
    else backgroundWeight = 1 - (distance - DISTANCE_LOW) / (DISTANCE_HIGH - DISTANCE_LOW);

    pixels[i] += (targetR - pixels[i]) * backgroundWeight;
    pixels[i + 1] += (targetG - pixels[i + 1]) * backgroundWeight;
    pixels[i + 2] += (targetB - pixels[i + 2]) * backgroundWeight;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
