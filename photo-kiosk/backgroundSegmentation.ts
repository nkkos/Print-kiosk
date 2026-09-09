import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

// Real background segmentation + recoloring (jiggly-beaming-dragonfly.md) —
// self-hosted, same reasoning as faceDetection.ts (no live-internet
// dependency, no photo pixel data ever leaves the browser). Segments the
// RAW captured frame — before any cropping — so the model has maximum
// context for edge decisions, especially hair, which is the hardest case.
const MODEL_BASE_PATH = '/models';

let segmenterPromise: Promise<ImageSegmenter> | null = null;

function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = FilesetResolver.forVisionTasks(`${MODEL_BASE_PATH}/wasm`).then((fileset) =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: `${MODEL_BASE_PATH}/selfie_segmenter.tflite`,
          // CPU (WASM), not GPU — same reasoning as faceDetection.ts: a
          // one-shot still-image pipeline, not worth two MediaPipe tasks
          // fighting over WebGL context ownership on unknown kiosk drivers.
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        // Soft per-pixel confidence, not a hard category mask — blending
        // proportionally to confidence avoids jagged edges at hair.
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      }),
    );
  }
  return segmenterPromise;
}

/** Starts loading the model in the background — call on mount for any
 * document that actually has a backgroundColorHex set, so the one-time
 * download/init latency is hidden behind idle kiosk time. */
export function preloadBackgroundSegmentation(): void {
  void getSegmenter();
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/** Bilinear-samples the low-res confidence mask at a floating-point pixel
 * position in OUTPUT space — nearest-neighbor sampling (picking one mask
 * cell per output pixel) produces visible blocky/staircase edges once a
 * ~256x256 mask is stretched over a 720p+ camera frame, independent of how
 * good the underlying model itself is. This is the single cheapest quality
 * fix available before considering a different model or technique. */
function sampleMaskBilinear(
  confidences: Float32Array,
  maskWidth: number,
  maskHeight: number,
  outX: number,
  outY: number,
  outWidth: number,
  outHeight: number,
): number {
  const mx = ((outX + 0.5) / outWidth) * maskWidth - 0.5;
  const my = ((outY + 0.5) / outHeight) * maskHeight - 0.5;
  const x0 = Math.max(0, Math.min(maskWidth - 1, Math.floor(mx)));
  const y0 = Math.max(0, Math.min(maskHeight - 1, Math.floor(my)));
  const x1 = Math.min(maskWidth - 1, x0 + 1);
  const y1 = Math.min(maskHeight - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, mx - x0));
  const fy = Math.max(0, Math.min(1, my - y0));

  const c00 = confidences[y0 * maskWidth + x0];
  const c10 = confidences[y0 * maskWidth + x1];
  const c01 = confidences[y1 * maskWidth + x0];
  const c11 = confidences[y1 * maskWidth + x1];
  const top = c00 + (c10 - c00) * fx;
  const bottom = c01 + (c11 - c01) * fx;
  return top + (bottom - top) * fy;
}

/** Replaces the background of `source` with `hex`, in place — returns the
 * same canvas it drew `source` onto. Blends each pixel between its original
 * color and the target color, weighted by (1 - personConfidence): fully
 * replaced background, untouched foreground, proportional blending at the
 * edges in between. */
export async function recolorBackground(
  source: HTMLVideoElement | HTMLCanvasElement,
  hex: string,
): Promise<HTMLCanvasElement> {
  const segmenter = await getSegmenter();
  const width = 'videoWidth' in source ? source.videoWidth : source.width;
  const height = 'videoHeight' in source ? source.videoHeight : source.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(source, 0, 0, width, height);

  const result = segmenter.segment(canvas);
  const mask = result.confidenceMasks?.[0];
  if (!mask) return canvas;

  const confidences = mask.getAsFloat32Array();
  const maskWidth = mask.width;
  const maskHeight = mask.height;

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const [targetR, targetG, targetB] = hexToRgb(hex);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const personConfidence = sampleMaskBilinear(
        confidences,
        maskWidth,
        maskHeight,
        x,
        y,
        width,
        height,
      );
      const backgroundWeight = 1 - personConfidence;
      const idx = (y * width + x) * 4;
      pixels[idx] += (targetR - pixels[idx]) * backgroundWeight;
      pixels[idx + 1] += (targetG - pixels[idx + 1]) * backgroundWeight;
      pixels[idx + 2] += (targetB - pixels[idx + 2]) * backgroundWeight;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  mask.close();
  return canvas;
}
