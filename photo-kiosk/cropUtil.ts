import type { FaceDetectionResult } from './faceDetection';
import type { CaptureSpec } from './types';

// Frame-guide + geometry crop (docs/photo-kiosk-requirements.md's "Confirmed
// technical approach," layer 2), now combined with real face-landmark
// detection (jiggly-beaming-dragonfly.md) for any document that specifies a
// head-height band (headHeightMinMm/MaxMm — always true for a real DB
// PhotoDocument, never true for "Произвольный размер"): the on-screen guide
// stays a loose self-alignment aid (computeGuideRect/computeGuideMarkers,
// unchanged below), but the actual crop rectangle is computed post-capture
// from detectFace()'s real landmarks (see computeDetectedCropRect) instead
// of from the guide box itself. "Произвольный размер" has no head-height
// band to calibrate a px-per-mm scale from, so it keeps the older
// guide-based crop (computeSourceCropRect) unchanged.

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
  eyeLineY?: number;
  headTopY?: number;
  headBottomY?: number;
  headLeftX?: number;
  headRightX?: number;
}

/** Decorative only (no detection) — approximate eye-line, head-height band,
 * and head-width brackets inside the guide box, for the customer to
 * self-align against. Uses common head-proportion heuristics (~45% of head
 * height above the eye line, ~55% below to the chin) — same "close, not
 * pixel-perfect" caveat docs/photo-kiosk-requirements.md already flags for
 * the deferred real crop.
 *
 * Vertical anchor priority: eye-line first (the traditional figure most
 * issuers publish), falling back to a top-margin anchor (China-style: a
 * fixed clearance from the photo's top edge to the crown, used when the
 * issuer never publishes an eye-line at all), falling back to the
 * "Произвольный размер" branch's default ratio when neither is given. */
export function computeGuideMarkers(guide: PixelRect, spec: CaptureSpec): GuideMarkers {
  const pxPerMmY = guide.height / spec.heightMm;
  const avgHeadHeightMm =
    spec.headHeightMinMm != null && spec.headHeightMaxMm != null
      ? (spec.headHeightMinMm + spec.headHeightMaxMm) / 2
      : undefined;

  let headTopY: number | undefined;
  let eyeLineY: number | undefined;

  if (spec.eyeLineFromBottomMm != null || spec.marginTopMm == null) {
    const eyeLineFromBottomMm = spec.eyeLineFromBottomMm ?? spec.heightMm * DEFAULT_EYE_LINE_RATIO;
    eyeLineY = guide.y + guide.height * (1 - eyeLineFromBottomMm / spec.heightMm);
    if (avgHeadHeightMm != null) {
      headTopY = eyeLineY - avgHeadHeightMm * 0.45 * pxPerMmY;
    }
  } else {
    headTopY = guide.y + spec.marginTopMm * pxPerMmY;
    if (avgHeadHeightMm != null) {
      eyeLineY = headTopY + avgHeadHeightMm * 0.45 * pxPerMmY;
    }
  }

  const headBottomY =
    headTopY != null && avgHeadHeightMm != null ? headTopY + avgHeadHeightMm * pxPerMmY : undefined;

  const markers: GuideMarkers = { eyeLineY, headTopY, headBottomY };

  if (spec.headWidthMinMm != null && spec.headWidthMaxMm != null) {
    const avgHeadWidthMm = (spec.headWidthMinMm + spec.headWidthMaxMm) / 2;
    const pxPerMmX = guide.width / spec.widthMm;
    const halfWidthPx = (avgHeadWidthMm * pxPerMmX) / 2;
    const centerX = guide.x + guide.width / 2;
    markers.headLeftX = centerX - halfWidthPx;
    markers.headRightX = centerX + halfWidthPx;
  }

  return markers;
}

type DetectedFace = Extract<FaceDetectionResult, { ok: true }>;

/** Real crop rectangle (native video pixel space), computed from
 * `detectFace`'s landmarks instead of the static guide. The document's own
 * head-height band (headHeightMinMm/MaxMm) is the only calibration
 * available for turning detected pixel distances into the physical mm
 * geometry the document requires — same eye-line/margin-top anchor duality
 * `computeGuideMarkers` already implements, just anchored to a real
 * detected head instead of an assumed average position.
 *
 * Always returns a usable rect — the kiosk must take whatever photo the
 * customer gives it, never refuse a shot over camera distance (confirmed
 * after real testing kept rejecting normal seating distance with "отойдите
 * дальше"). When the geometrically ideal crop would need more of the frame
 * than actually exists (customer stood close, or the document's head-height
 * band demands a lot of surrounding margin), the whole rect is shrunk
 * in-place — same aspect ratio, both dimensions scaled down together — to
 * the largest size that fits, so the head ends up a bit larger in-frame
 * than the document's ideal proportion rather than the shot being refused.
 * The result is then translated (never resized) back inside frame bounds if
 * the anchor math placed it partly outside. */
export function computeDetectedCropRect(
  detected: DetectedFace,
  spec: CaptureSpec,
  videoWidth: number,
  videoHeight: number,
): PixelRect {
  const avgHeadHeightMm = ((spec.headHeightMinMm as number) + (spec.headHeightMaxMm as number)) / 2;
  const detectedHeadHeightPx = detected.chinY - detected.headTopY;
  const idealScale = detectedHeadHeightPx / avgHeadHeightMm; // source px per output mm

  const fitScale = Math.min(
    1,
    videoWidth / (spec.widthMm * idealScale),
    videoHeight / (spec.heightMm * idealScale),
  );
  const scale = idealScale * fitScale;
  const cropWidthPx = spec.widthMm * scale;
  const cropHeightPx = spec.heightMm * scale;

  const headCenterX = (detected.headLeftX + detected.headRightX) / 2;
  let cropY: number;
  if (spec.eyeLineFromBottomMm != null || spec.marginTopMm == null) {
    const eyeLineFromBottomMm = spec.eyeLineFromBottomMm ?? spec.heightMm * DEFAULT_EYE_LINE_RATIO;
    cropY = detected.eyeLineY + eyeLineFromBottomMm * scale - cropHeightPx;
  } else {
    cropY = detected.headTopY - spec.marginTopMm * scale;
  }
  let cropX = headCenterX - cropWidthPx / 2;

  cropX = Math.min(Math.max(cropX, 0), videoWidth - cropWidthPx);
  cropY = Math.min(Math.max(cropY, 0), videoHeight - cropHeightPx);

  return { x: cropX, y: cropY, width: cropWidthPx, height: cropHeightPx };
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
