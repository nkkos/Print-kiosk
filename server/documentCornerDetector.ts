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
  const imgGray = new cv.Mat();
  const imgBlur = new cv.Mat();
  const imgThresh = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  let result: Corners | null = null;
  try {
    cv.Canny(img, imgGray, 50, 200);
    cv.GaussianBlur(imgGray, imgBlur, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
    cv.threshold(imgBlur, imgThresh, 0, 255, cv.THRESH_OTSU);
    cv.findContours(imgThresh, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let maxContourIndex = -1;
    for (let i = 0; i < contours.size(); i++) {
      const area = cv.contourArea(contours.get(i));
      if (area > maxArea) {
        maxArea = area;
        maxContourIndex = i;
      }
    }

    const workingArea = workWidth * workHeight;
    if (maxContourIndex >= 0 && maxArea >= workingArea * MIN_AREA_RATIO) {
      const contour: any = contours.get(maxContourIndex);
      const rect = cv.minAreaRect(contour);
      const center: Point = rect.center;

      let tl: Point | undefined;
      let tlDist = 0;
      let tr: Point | undefined;
      let trDist = 0;
      let bl: Point | undefined;
      let blDist = 0;
      let br: Point | undefined;
      let brDist = 0;

      // Same quadrant + furthest-from-center heuristic jscanify uses to
      // pick the four extreme corners out of a (possibly noisy, many-point)
      // contour, once we already know it's the page's own outline.
      for (let i = 0; i < contour.data32S.length; i += 2) {
        const point: Point = { x: contour.data32S[i], y: contour.data32S[i + 1] };
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

      if (tl && tr && bl && br) {
        result = [
          { x: tl.x / detectScale, y: tl.y / detectScale },
          { x: tr.x / detectScale, y: tr.y / detectScale },
          { x: br.x / detectScale, y: br.y / detectScale },
          { x: bl.x / detectScale, y: bl.y / detectScale },
        ];
      }
    }
  } finally {
    img.delete();
    imgGray.delete();
    imgBlur.delete();
    imgThresh.delete();
    contours.delete();
    hierarchy.delete();
  }

  return result;
}
