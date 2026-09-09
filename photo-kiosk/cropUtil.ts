import type { CaptureSpec } from './types';

// Frame-guide + geometry crop (docs/photo-kiosk-requirements.md's "Confirmed
// technical approach," layer 2), combined with real face-landmark detection
// (originally jiggly-beaming-dragonfly.md, reworked 2026-09-09 per the
// customer-facing manual-adjustment requirement below). The live on-screen
// guide during capture (computeGuideRect/computeGuideMarkers) stays a loose
// self-alignment aid — unchanged. The actual crop, though, is now a
// two-step process: capture produces a GENEROUS crop (wider than the final
// document size) around either real detected landmarks or, if detection
// found no single clear face, a heuristic estimate — never blocking the
// shot. ShotReviewScreen then shows that generous shot with the landmark
// lines the customer can drag/nudge before the final tight crop
// (computeTightCropRect) is actually cut, so a wrong detection is fixable
// by the customer rather than baked in silently or rejected outright.

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

/** A framing box sized relative to whatever image it's given — a CSS-pixel
 * camera frame for the live on-screen guide, or (computeCropSize below)
 * native video pixels as the size fallback when there's no head-height band
 * to calibrate a detected head against. Same ratio either way. */
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
 * self-align against live, before capture. Uses common head-proportion
 * heuristics (~45% of head height above the eye line, ~55% below to the
 * chin) — same "close, not pixel-perfect" caveat as any estimate without a
 * real detected face. Also reused (see estimateFallbackLandmarks) as the
 * post-capture starting point when detection itself fails.
 *
 * Vertical anchor priority: top-margin first when given (a direct distance
 * from the photo's top edge to the crown — e.g. China-style specs that
 * never publish an eye-line at all, but also real documents that publish
 * both figures, like a Schengen visa's 3mm top margin alongside its
 * eye-line — same priority computeTightCropRect uses and for the same
 * reason: a direct margin figure needs no assumption about where the
 * eye-line sits relative to head-height), falling back to eye-line (the
 * more commonly published figure) when no margin is given, falling back to
 * the "Произвольный размер" branch's default ratio when neither is given. */
export function computeGuideMarkers(guide: PixelRect, spec: CaptureSpec): GuideMarkers {
  const pxPerMmY = guide.height / spec.heightMm;
  const avgHeadHeightMm =
    spec.headHeightMinMm != null && spec.headHeightMaxMm != null
      ? (spec.headHeightMinMm + spec.headHeightMaxMm) / 2
      : undefined;

  let headTopY: number | undefined;
  let eyeLineY: number | undefined;

  if (spec.marginTopMm == null) {
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

/** One flavor of "where's the head" — either real `detectFace` output
 * (chinY renamed headBottomY for symmetry) or a heuristic fallback. Every
 * field is independently optional so a partial signal (e.g. only an
 * eye-line, no head-width — "Произвольный размер" never has head-width) is
 * expressed the same way whether it came from real detection or a guess. */
export interface CropLandmarks {
  eyeLineY?: number;
  headTopY?: number;
  headBottomY?: number;
  headLeftX?: number;
  headRightX?: number;
}

/** Used when `detectFace` couldn't find exactly one clear face — reuses the
 * same proportion heuristics as the live on-screen guide (computeGuideMarkers),
 * evaluated over the whole image instead of a smaller on-screen box, so the
 * customer still has *something* sensible to drag into place rather than a
 * blocked shot. */
export function estimateFallbackLandmarks(
  spec: CaptureSpec,
  imageWidth: number,
  imageHeight: number,
): CropLandmarks {
  const markers = computeGuideMarkers({ x: 0, y: 0, width: imageWidth, height: imageHeight }, spec);
  return {
    eyeLineY: markers.eyeLineY,
    headTopY: markers.headTopY,
    headBottomY: markers.headBottomY,
    headLeftX: markers.headLeftX,
    headRightX: markers.headRightX,
  };
}

/** How big the tight crop should be. Documents with a head-height band
 * calibrate real pixels-per-mm from the landmarks' own head height (shrunk
 * to fit the frame if the ideal size would exceed it — never refuse a
 * shot over camera distance). Without that band ("Произвольный размер",
 * or detection that never located a head at all), size instead comes from
 * the same frame-relative ratio the live on-screen guide already uses. */
function computeCropSize(
  landmarks: CropLandmarks,
  spec: CaptureSpec,
  imageWidth: number,
  imageHeight: number,
): { widthPx: number; heightPx: number } {
  const avgHeadHeightMm =
    spec.headHeightMinMm != null && spec.headHeightMaxMm != null
      ? (spec.headHeightMinMm + spec.headHeightMaxMm) / 2
      : undefined;

  if (avgHeadHeightMm != null && landmarks.headTopY != null && landmarks.headBottomY != null) {
    const detectedHeadHeightPx = landmarks.headBottomY - landmarks.headTopY;
    const idealScale = detectedHeadHeightPx / avgHeadHeightMm; // px per output mm
    const fitScale = Math.min(
      1,
      imageWidth / (spec.widthMm * idealScale),
      imageHeight / (spec.heightMm * idealScale),
    );
    const scale = idealScale * fitScale;
    return { widthPx: spec.widthMm * scale, heightPx: spec.heightMm * scale };
  }

  const guide = computeGuideRect(imageWidth, imageHeight, spec);
  return { widthPx: guide.width, heightPx: guide.height };
}

/** The real crop rectangle (in whatever image's pixel space `landmarks` and
 * `imageWidth`/`imageHeight` are given in) — called once with the initial
 * (real or fallback) landmarks to size the generous capture, and again at
 * confirm time with the customer's possibly-adjusted landmarks to cut the
 * final tight crop. Horizontal center follows the detected/adjusted head
 * width when available, otherwise the image center.
 *
 * Vertical position prefers margin-top + headTopY over eye-line whenever
 * both a margin-top figure and a real headTopY landmark are available —
 * margin-top is a DIRECT distance from the frame edge to the crown, with no
 * assumption baked in, whereas the eye-line anchor requires eyeLineY to sit
 * at whatever proportion of head-height the document silently assumes,
 * which a real detected/adjusted head only sometimes matches (confirmed:
 * faceDetection.ts's fixed ~0.52 eye-to-chin/head-height crown estimate
 * doesn't match every document's own numbers, and even visafoto.com's own
 * published Schengen figures give a margin-top, 3mm, alongside the eye-line
 * — not one or the other). Falls back to eye-line, then vertical centering,
 * when no head-top landmark or margin figure exists. Always translated
 * (never resized) back inside the image bounds. */
export function computeTightCropRect(
  landmarks: CropLandmarks,
  spec: CaptureSpec,
  imageWidth: number,
  imageHeight: number,
): PixelRect {
  const { widthPx, heightPx } = computeCropSize(landmarks, spec, imageWidth, imageHeight);
  const pxPerMmY = heightPx / spec.heightMm;

  const centerX =
    landmarks.headLeftX != null && landmarks.headRightX != null
      ? (landmarks.headLeftX + landmarks.headRightX) / 2
      : imageWidth / 2;

  let y: number;
  if (landmarks.headTopY != null && spec.marginTopMm != null) {
    y = landmarks.headTopY - spec.marginTopMm * pxPerMmY;
  } else if (landmarks.eyeLineY != null) {
    const eyeLineFromBottomMm = spec.eyeLineFromBottomMm ?? spec.heightMm * DEFAULT_EYE_LINE_RATIO;
    y = landmarks.eyeLineY + eyeLineFromBottomMm * pxPerMmY - heightPx;
  } else {
    y = (imageHeight - heightPx) / 2;
  }

  let x = centerX - widthPx / 2;

  // Never let the crop cut into the head the customer actually marked. The
  // anchor formulas above assume eyeLineY sits at its "standard" position
  // relative to headTopY/headBottomY (or that the document's own margin/
  // eye-line numbers imply a plausible crown clearance) — an assumption
  // that breaks in two real cases: the customer drags one landmark without
  // the others (e.g. nudging a mis-detected crown up without touching the
  // eye line), or a real detected face's crown estimate (faceDetection.ts's
  // fixed ~0.52 eye-to-chin/head-height ratio) just doesn't match a given
  // document's own eye-line/head-height numbers closely enough — confirmed
  // against a real Schengen-visa photo, where the anchor math alone cropped
  // the crown off entirely. heightPx always comfortably exceeds the marked
  // head span (avgHeadHeightMm is always < heightMm), so a position exists
  // that satisfies both landmarks — this clamps into it.
  if (landmarks.headTopY != null) {
    y = Math.min(y, landmarks.headTopY);
  }
  if (landmarks.headBottomY != null) {
    y = Math.max(y, landmarks.headBottomY - heightPx);
  }
  if (landmarks.headLeftX != null) {
    x = Math.min(x, landmarks.headLeftX);
  }
  if (landmarks.headRightX != null) {
    x = Math.max(x, landmarks.headRightX - widthPx);
  }

  x = Math.min(Math.max(x, 0), imageWidth - widthPx);
  y = Math.min(Math.max(y, 0), imageHeight - heightPx);

  return { x, y, width: widthPx, height: heightPx };
}

// Ample room to drag lines without immediately hitting the edge of the
// working image — the generous crop the customer actually adjusts against.
const GENEROUS_MARGIN_FACTOR = 1.7;

export function computeGenerousCropRect(
  landmarks: CropLandmarks,
  spec: CaptureSpec,
  imageWidth: number,
  imageHeight: number,
): PixelRect {
  const tight = computeTightCropRect(landmarks, spec, imageWidth, imageHeight);
  const centerX = tight.x + tight.width / 2;
  const centerY = tight.y + tight.height / 2;
  const width = Math.min(tight.width * GENEROUS_MARGIN_FACTOR, imageWidth);
  const height = Math.min(tight.height * GENEROUS_MARGIN_FACTOR, imageHeight);

  const x = Math.min(Math.max(centerX - width / 2, 0), imageWidth - width);
  const y = Math.min(Math.max(centerY - height / 2, 0), imageHeight - height);

  return { x, y, width, height };
}

/** Cuts the generous working crop out of the source frame — the live video
 * directly, or (when the document has a backgroundColorHex) the same frame
 * already recolored by backgroundSegmentation.ts's recolorBackground —
 * applying the horizontal mirror once here (matching what the customer saw
 * in the CSS-mirrored preview) and re-expressing `landmarks` in the
 * resulting canvas's own pixel space — including the left/right swap
 * mirroring causes — so everything downstream (ShotReviewScreen's overlay,
 * the final tight crop) works in one already-correctly-oriented coordinate
 * space and never has to flip again. */
export function drawMirroredCrop(
  source: HTMLVideoElement | HTMLCanvasElement,
  rect: PixelRect,
  landmarks: CropLandmarks,
): { canvas: HTMLCanvasElement; landmarks: CropLandmarks } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(
      source,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }

  const translated: CropLandmarks = {
    eyeLineY: landmarks.eyeLineY != null ? landmarks.eyeLineY - rect.y : undefined,
    headTopY: landmarks.headTopY != null ? landmarks.headTopY - rect.y : undefined,
    headBottomY: landmarks.headBottomY != null ? landmarks.headBottomY - rect.y : undefined,
    headLeftX:
      landmarks.headRightX != null ? canvas.width - (landmarks.headRightX - rect.x) : undefined,
    headRightX:
      landmarks.headLeftX != null ? canvas.width - (landmarks.headLeftX - rect.x) : undefined,
  };

  return { canvas, landmarks: translated };
}

/** Cuts the final, document-sized print from the generous working image
 * (already mirrored — see drawMirroredCrop) using whatever landmarks the
 * customer confirmed, scaling up to the document's real DPI. */
export function finalizeCrop(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  landmarks: CropLandmarks,
  spec: CaptureSpec,
): string {
  const tight = computeTightCropRect(landmarks, spec, sourceWidth, sourceHeight);
  const dpi = spec.dpi ?? DEFAULT_DPI;
  const targetW = mmToPx(spec.widthMm, dpi);
  const targetH = mmToPx(spec.heightMm, dpi);
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(source, tight.x, tight.y, tight.width, tight.height, 0, 0, targetW, targetH);
  return canvas.toDataURL('image/jpeg', 0.92);
}
