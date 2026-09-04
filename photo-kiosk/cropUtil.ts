import type { CaptureSpec } from './types';

// Frame-guide + geometry crop (docs/photo-kiosk-requirements.md's "Confirmed
// technical approach," layer 2 only) — no face detection this pass. The
// customer self-aligns against an on-screen guide box; MediaPipe-based
// automatic face-centered cropping is a deliberate, separate follow-up task.

export const DEFAULT_DPI = 300;
// Placeholder defaults pending product-owner sign-off
// (docs/photo-kiosk-requirements.md's "Default crop values for 'Произвольный
// размер'" open item) — applied only when CustomSizeScreen leaves
// margin/eye-line blank.
export const DEFAULT_MARGIN_RATIO = 0.1;
export const DEFAULT_EYE_LINE_RATIO = 0.55;

const MM_PER_INCH = 25.4;

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const GUIDE_HEIGHT_FRACTION = 0.82;
const GUIDE_MAX_WIDTH_FRACTION = 0.92;

/** Guide box in CSS pixels, relative to the camera frame element's own
 * rendered size — real on-screen pixels, so the overlay div and the crop
 * math share one coordinate space. */
export function computeGuideRect(frameW: number, frameH: number, spec: CaptureSpec): PixelRect {
  const aspect = spec.widthMm / spec.heightMm;
  let height = frameH * GUIDE_HEIGHT_FRACTION;
  let width = height * aspect;
  if (width > frameW * GUIDE_MAX_WIDTH_FRACTION) {
    width = frameW * GUIDE_MAX_WIDTH_FRACTION;
    height = width / aspect;
  }
  return { x: (frameW - width) / 2, y: (frameH - height) / 2, width, height };
}

export interface GuideMarkers {
  eyeLineY: number;
  headTopY?: number;
  headBottomY?: number;
}

/** Decorative only (no detection) — approximate eye-line and head-height band
 * inside the guide box, for the customer to self-align against. Uses common
 * head-proportion heuristics (~45% of head height above the eye line, ~55%
 * below to the chin) — same "close, not pixel-perfect" caveat
 * docs/photo-kiosk-requirements.md already flags for the deferred real crop. */
export function computeGuideMarkers(guide: PixelRect, spec: CaptureSpec): GuideMarkers {
  const eyeLineFromBottomMm = spec.eyeLineFromBottomMm ?? spec.heightMm * DEFAULT_EYE_LINE_RATIO;
  const eyeLineY = guide.y + guide.height * (1 - eyeLineFromBottomMm / spec.heightMm);
  if (spec.headHeightMinMm == null || spec.headHeightMaxMm == null) {
    return { eyeLineY };
  }
  const avgHeadHeightMm = (spec.headHeightMinMm + spec.headHeightMaxMm) / 2;
  const pxPerMm = guide.height / spec.heightMm;
  return {
    eyeLineY,
    headTopY: eyeLineY - avgHeadHeightMm * 0.45 * pxPerMm,
    headBottomY: eyeLineY + avgHeadHeightMm * 0.55 * pxPerMm,
  };
}

/** Inverse of CSS `object-fit: cover` — maps the guide rect (in frame CSS
 * pixels) back to source video pixels, given the frame's rendered size and
 * the video's native resolution. */
export function computeSourceCropRect(
  video: { videoWidth: number; videoHeight: number },
  frame: { width: number; height: number },
  guide: PixelRect,
): PixelRect {
  const scale = Math.max(frame.width / video.videoWidth, frame.height / video.videoHeight);
  const offsetX = (video.videoWidth * scale - frame.width) / 2;
  const offsetY = (video.videoHeight * scale - frame.height) / 2;
  return {
    x: (guide.x + offsetX) / scale,
    y: (guide.y + offsetY) / scale,
    width: guide.width / scale,
    height: guide.height / scale,
  };
}

/** Draws the cropped region at the document's true output resolution, mirrored
 * to match what the customer saw in the on-screen preview (the video element
 * is CSS-mirrored via `transform: scaleX(-1)`; the raw stream itself is not
 * mirrored, so the capture must apply the same flip explicitly). */
export function cropAndScaleToDataUrl(
  video: HTMLVideoElement,
  source: PixelRect,
  spec: CaptureSpec,
): string {
  const dpi = spec.dpi ?? DEFAULT_DPI;
  const targetW = mmToPx(spec.widthMm, dpi);
  const targetH = mmToPx(spec.heightMm, dpi);
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.translate(targetW, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, source.x, source.y, source.width, source.height, 0, 0, targetW, targetH);
  return canvas.toDataURL('image/jpeg', 0.92);
}
