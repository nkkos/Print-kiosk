import cvModule from '@techstark/opencv-js';
import sharp from 'sharp';

// Best-effort auto-detection for Scan's P2 "Adjust corners"
// (docs/scan-upload-requirements.md: "not a hard requirement... manual
// adjustment is the actual requirement"). Runs server-side, not on the
// phone: OpenCV.js's WASM build is ~13MB, which would fight the phone
// page's own "lightweight" design goal (docs/screens/scan-spec.md) for a
// visitor likely on cellular data — and this project already has a
// precedent for keeping heavy image-processing server-side rather than
// shipping it to every client (server/documentConverter.ts, server/uploadStore.ts's
// AV scanning).
//
// Two prior in-house heuristics (Sobel-edge extremes, then brightness +
// largest-connected-component) were both tried client-side first and both
// failed on real photos (a wood-grain desk defeated the edge heuristic;
// a light desk defeated the brightness heuristic) — real document-boundary
// detection is a genuinely non-trivial CV problem, which is exactly what
// OpenCV's Canny+contour pipeline exists to solve well. This function
// ports the same algorithm the (real, published) jscanify library uses
// for its own paper-contour/corner detection, rather than inventing a
// third home-grown heuristic.

export interface Point {
  x: number;
  y: number;
}

/** tl, tr, br, bl — matches server/scanProcessor.ts's Corners order. */
export type Corners = [Point, Point, Point, Point];

// OpenCV.js has no useful TypeScript surface for the Mat/contour API used
// below (its own types cover the module-loading shape only) — `any` here
// is the untyped WASM module itself, not a shortcut around real types.
let cvReady: Promise<any> | null = null;

function getCv(): Promise<any> {
  if (!cvReady) {
    cvReady = (async () => {
      let cv: any = cvModule;
      if (cv instanceof Promise) {
        cv = await cv;
      } else if (!cv.Mat) {
        await new Promise<void>((resolve) => {
          cv.onRuntimeInitialized = () => resolve();
        });
      }
      return cv;
    })();
  }
  return cvReady;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Downscaling before detection is purely a speed optimization (Canny +
// contour-finding on a multi-megapixel phone photo would be needlessly
// slow) — corners are scaled back up to the original photo's coordinates
// before returning, same as both prior in-house attempts.
const WORKING_MAX_DIMENSION = 700;
// Rejects a detected contour that's suspiciously small relative to the
// photo — almost certainly not the actual page, better to fall back to
// the phone's own default inset-rectangle than hand back a bad guess.
const MIN_AREA_RATIO = 0.15;
// A quad whose corners all sit within this many pixels (at working-image
// scale) of the photo's own four corners is almost certainly not a real
// detection — it's Otsu finding no real page-vs-background split (too low
// contrast) and lumping the *entire photo* into one "region," which reads
// as a perfectly plausible large contour otherwise. Confirmed live via
// findQuadByBrightness on a deliberately very-low-contrast test: the
// rejected result's corners landed exactly on (0,0)/(W,0)/(W,H)/(0,H) — the
// image bounds themselves. A plain "reject if area is too close to 100% of
// the frame" guard was tried first and reverted: a real photo where the
// page genuinely fills nearly the whole frame (a deliberately close-up
// shot, a completely legitimate and previously-working case) has a nearly
// identical area ratio to this failure case, so area alone can't tell them
// apart — but their corner positions can, since a real page (even a
// tightly-cropped one) still has a few pixels of margin on every side,
// while this failure mode has none at all.
const FRAME_EDGE_TOLERANCE_PX = 3;

/** Detects the page's four corners in `imagePath`, in the original photo's
 * own pixel coordinates. Returns null whenever detection doesn't find a
 * plausible quadrilateral, so the caller can fall back to a plain default. */
export async function detectDocumentCorners(imagePath: string): Promise<Corners | null> {
  const cv = await getCv();

  const { data, info } = await sharp(imagePath)
    .rotate()
    .ensureAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const detectScale = Math.min(1, WORKING_MAX_DIMENSION / Math.max(info.width, info.height));
  const workWidth = Math.max(1, Math.round(info.width * detectScale));
  const workHeight = Math.max(1, Math.round(info.height * detectScale));

  let workingData: Buffer = data;
  if (detectScale < 1) {
    workingData = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .resize(workWidth, workHeight)
      .raw()
      .toBuffer();
  }

  // matFromImageData duck-types a browser ImageData object ({width, height,
  // data}) — the documented way to hand OpenCV.js a raw pixel buffer under
  // Node, where there's no real <canvas>/cv.imread available (see
  // OpenCV.js's own Node.js tutorial, which does this via jimp's .bitmap;
  // sharp's raw RGBA output already matches that same shape).
  const img = cv.matFromImageData({ width: workWidth, height: workHeight, data: workingData });
  try {
    // Real phone photos vary a lot in lighting/contrast, and a single fixed
    // Canny threshold pair (jscanify's own defaults, 50/200) doesn't
    // generalize across them — confirmed live: multiple real photos found
    // nothing at all despite every synthetic test photo working fine.
    // "Auto Canny" (thresholds derived from the image's own mean
    // brightness, not a fixed guess) is the standard fix for exactly this;
    // tried alongside the fixed defaults rather than replacing them
    // outright, since neither is strictly better on every photo.
    const [adaptiveLow, adaptiveHigh] = computeAdaptiveCannyThresholds(cv, img);
    const thresholdPairs: Array<[number, number]> = [
      [50, 200],
      [adaptiveLow, adaptiveHigh],
      [30, 100],
    ];

    // Temporary diagnostic logging (visible in Railway's logs) — repeated
    // real-photo failures that no synthetic reproduction has matched so
    // far mean guessing at parameters blind isn't working; this turns the
    // next real failed attempt into actual data (image size, computed
    // thresholds, per-attempt contour counts/areas) instead of another
    // guess.
    console.log(
      `[documentCornerDetector] photo ${info.width}x${info.height} -> working ${workWidth}x${workHeight}, adaptive Canny thresholds: ${adaptiveLow.toFixed(1)}/${adaptiveHigh.toFixed(1)}`,
    );

    // Two-pass per threshold pair: try without dilation first (clean edge
    // case, no risk of merging the page with something touching it), and
    // only retry with dilation — which bridges small gaps in a broken Canny
    // boundary but can also fuse the page's contour with clutter physically
    // touching it — if that pair's no-dilation pass found nothing. No
    // detection is a strictly worse outcome than an occasionally-off
    // corner, but a clean no-dilate result beats a dilate-merged one
    // whenever it's available.
    for (const [low, high] of thresholdPairs) {
      const found =
        findQuad(cv, img, workWidth, workHeight, detectScale, false, low, high) ??
        findQuad(cv, img, workWidth, workHeight, detectScale, true, low, high);
      if (found) return found;
    }

    // Every Canny variant needs a real local gradient at the page boundary
    // to find it — confirmed live: pre-blur cut a real photo's contour
    // count from 690+ down to a clean 11, but still zero were large enough,
    // meaning the boundary itself wasn't registering as an edge at all, not
    // that it was buried in noise. Brightness-based region splitting doesn't
    // need a local edge, only an overall page-vs-background brightness
    // difference, so it's tried as a last resort for exactly that case.
    const brightnessResult = findQuadByBrightness(cv, img, workWidth, workHeight, detectScale);
    if (brightnessResult) return brightnessResult;

    console.log('[documentCornerDetector] no attempt found a usable contour — returning null');
    return null;
  } finally {
    img.delete();
  }
}

function computeAdaptiveCannyThresholds(cv: any, img: any): [number, number] {
  const grayForStats = new cv.Mat();
  cv.cvtColor(img, grayForStats, cv.COLOR_RGBA2GRAY);
  const mean = cv.mean(grayForStats)[0];
  grayForStats.delete();
  const sigma = 0.33;
  return [Math.max(0, (1 - sigma) * mean), Math.min(255, (1 + sigma) * mean)];
}

function findQuad(
  cv: any,
  img: any,
  workWidth: number,
  workHeight: number,
  detectScale: number,
  useDilate: boolean,
  cannyLow: number,
  cannyHigh: number,
): Corners | null {
  const imgPreBlur = new cv.Mat();
  const imgGray = new cv.Mat();
  const imgBlur = new cv.Mat();
  const imgThresh = new cv.Mat();
  const imgDilated = useDilate ? new cv.Mat() : null;
  const dilateKernel = useDilate ? cv.Mat.ones(3, 3, cv.CV_8U) : null;

  try {
    // Real-photo diagnostic logs confirmed this: a full-resolution phone
    // camera photo (sensor noise, real wood-grain texture, JPEG blocking)
    // produced 690+ tiny contours before Canny even ran here, none of them
    // the actual page — jscanify's own algorithm (which this was ported
    // from) only blurs *after* Canny, smoothing the edge map but not
    // suppressing the fine texture that created all those spurious edges
    // in the first place. A real pre-blur, before Canny, is the standard
    // fix: it costs some sensitivity to the page's own boundary, but that
    // boundary is a large, low-frequency feature that survives blurring
    // far better than per-pixel noise does.
    cv.GaussianBlur(img, imgPreBlur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(imgPreBlur, imgGray, cannyLow, cannyHigh);
    cv.GaussianBlur(imgGray, imgBlur, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
    cv.threshold(imgBlur, imgThresh, 0, 255, cv.THRESH_OTSU);

    let contourSource = imgThresh;
    if (useDilate) {
      cv.dilate(imgThresh, imgDilated, dilateKernel, new cv.Point(-1, -1), 1);
      contourSource = imgDilated;
    }

    return extractCorners(
      cv,
      contourSource,
      workWidth,
      workHeight,
      detectScale,
      `canny ${cannyLow.toFixed(1)}/${cannyHigh.toFixed(1)} dilate=${useDilate}`,
      false,
    );
  } finally {
    imgPreBlur.delete();
    imgGray.delete();
    imgBlur.delete();
    imgThresh.delete();
    if (imgDilated) imgDilated.delete();
    if (dilateKernel) dilateKernel.delete();
  }
}

// Edge detection (findQuad above) needs a real local gradient at the page's
// boundary to find it at all — confirmed live: a real photo's contour count
// dropped from 690+ to a clean 11 once the pre-blur fix landed, but still
// zero of them were large enough, meaning the boundary itself just wasn't
// registering as an edge anywhere, not that it was buried in noise. A
// region-based split (Otsu on brightness directly, then the single largest
// resulting region) doesn't need a local edge at all — only an overall
// brightness difference between page and background — so it can succeed on
// exactly the low-local-contrast photos that defeat every Canny variant.
// Tried both polarities since the page could come out as the bright region
// or the dark one depending on lighting.
function findQuadByBrightness(
  cv: any,
  img: any,
  workWidth: number,
  workHeight: number,
  detectScale: number,
): Corners | null {
  const imgGray = new cv.Mat();
  const imgPreBlur = new cv.Mat();
  const imgThreshNormal = new cv.Mat();
  const imgThreshInverted = new cv.Mat();

  try {
    cv.cvtColor(img, imgGray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(imgGray, imgPreBlur, new cv.Size(7, 7), 0, 0, cv.BORDER_DEFAULT);
    cv.threshold(imgPreBlur, imgThreshNormal, 0, 255, cv.THRESH_OTSU + cv.THRESH_BINARY);
    cv.threshold(imgPreBlur, imgThreshInverted, 0, 255, cv.THRESH_OTSU + cv.THRESH_BINARY_INV);

    return (
      extractCorners(
        cv,
        imgThreshNormal,
        workWidth,
        workHeight,
        detectScale,
        'brightness normal',
        true,
      ) ??
      extractCorners(
        cv,
        imgThreshInverted,
        workWidth,
        workHeight,
        detectScale,
        'brightness inverted',
        true,
      )
    );
  } finally {
    imgGray.delete();
    imgPreBlur.delete();
    imgThreshNormal.delete();
    imgThreshInverted.delete();
  }
}

// Shared by both detection strategies above: given a binary Mat (an edge
// map or a brightness-threshold mask), finds the largest region that
// plausibly is the page and extracts its four corners.
function extractCorners(
  cv: any,
  binary: any,
  workWidth: number,
  workHeight: number,
  detectScale: number,
  label: string,
  requireCleanQuad: boolean,
): Corners | null {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let bestQuad: any = null;

  try {
    cv.findContours(binary, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

    const workingArea = workWidth * workHeight;
    // Prefer a contour that genuinely approximates to a clean quadrilateral
    // (the standard "cv2.approxPolyDP -> exactly 4 points" document-scanner
    // check) over just trusting the single largest contour by raw area —
    // clutter near the page can produce a larger, messier contour that
    // isn't actually the page. `requireCleanQuad=false` (Canny) falls back
    // to the largest contour's own extreme points (jscanify's original
    // approach) when nothing approximates cleanly; `requireCleanQuad=true`
    // (brightness) doesn't — confirmed live that a brightness-thresholded
    // region failing to approximate to 4 points usually means it bled into
    // an adjacent similarly-bright area or lost part of the page to a
    // shadow, and the raw extreme-point fallback on that messy a shape
    // produced a wildly wrong quad, not just a slightly-off one.
    let bestQuadArea = 0;
    let largestContour: any = null;
    let largestArea = 0;
    let candidatesAboveMinArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area < workingArea * MIN_AREA_RATIO) continue;
      candidatesAboveMinArea++;
      if (area > largestArea) {
        largestArea = area;
        largestContour = contour;
      }
      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
      if (approx.rows === 4 && area > bestQuadArea) {
        bestQuadArea = area;
        bestQuad = approx;
      } else {
        approx.delete();
      }
    }

    console.log(
      `[documentCornerDetector]   ${label}: ${contours.size()} contours total, ${candidatesAboveMinArea} above min-area (${(MIN_AREA_RATIO * 100).toFixed(0)}% of ${workingArea}), largest=${largestArea.toFixed(0)}, cleanQuadArea=${bestQuadArea || 'none'}`,
    );

    const sourceContour = bestQuad || (requireCleanQuad ? null : largestContour);
    if (!sourceContour) return null;

    const rect = cv.minAreaRect(sourceContour);
    const center: Point = rect.center;

    let tl: Point | undefined;
    let tlDist = 0;
    let tr: Point | undefined;
    let trDist = 0;
    let bl: Point | undefined;
    let blDist = 0;
    let br: Point | undefined;
    let brDist = 0;

    // Same quadrant + furthest-from-center heuristic jscanify uses to pick
    // the four extreme corners out of a (possibly noisy, many-point)
    // contour, once we already know it's the page's own outline.
    for (let i = 0; i < sourceContour.data32S.length; i += 2) {
      const point: Point = { x: sourceContour.data32S[i], y: sourceContour.data32S[i + 1] };
      const dist = distance(point, center);
      if (point.x < center.x && point.y < center.y) {
        if (dist > tlDist) {
          tl = point;
          tlDist = dist;
        }
      } else if (point.x > center.x && point.y < center.y) {
        if (dist > trDist) {
          tr = point;
          trDist = dist;
        }
      } else if (point.x < center.x && point.y > center.y) {
        if (dist > blDist) {
          bl = point;
          blDist = dist;
        }
      } else if (point.x > center.x && point.y > center.y) {
        if (dist > brDist) {
          br = point;
          brDist = dist;
        }
      }
    }

    if (!tl || !tr || !bl || !br) return null;

    const looksLikeWholeFrame =
      distance(tl, { x: 0, y: 0 }) < FRAME_EDGE_TOLERANCE_PX &&
      distance(tr, { x: workWidth, y: 0 }) < FRAME_EDGE_TOLERANCE_PX &&
      distance(br, { x: workWidth, y: workHeight }) < FRAME_EDGE_TOLERANCE_PX &&
      distance(bl, { x: 0, y: workHeight }) < FRAME_EDGE_TOLERANCE_PX;
    if (looksLikeWholeFrame) {
      console.log(
        `[documentCornerDetector]   ${label}: rejected — quad matches the photo's own frame`,
      );
      return null;
    }

    return [
      { x: tl.x / detectScale, y: tl.y / detectScale },
      { x: tr.x / detectScale, y: tr.y / detectScale },
      { x: br.x / detectScale, y: br.y / detectScale },
      { x: bl.x / detectScale, y: bl.y / detectScale },
    ];
  } finally {
    if (bestQuad) bestQuad.delete();
    contours.delete();
    hierarchy.delete();
  }
}
