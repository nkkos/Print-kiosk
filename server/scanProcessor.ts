import sharp from 'sharp';
import PerspT from 'perspective-transform';

// Turns one raw phone photo + four confirmed corners (docs/screens/scan-spec.md,
// P2 "Adjust corners") into a perspective-corrected, cleaned-up page image.
// Corner *detection* is the phone's job (client-side); this only ever
// receives already-confirmed points — no CV/detection logic lives here.
//
// Deliberately not OpenCV (native compile pain on Windows, already hit with
// LibreOffice — see server/documentConverter.ts's own history) and not
// opencv.js either (its WASM build targets a browser-like environment;
// running it under plain Node has real friction). Instead: `sharp` for image
// I/O/cleanup (ships prebuilt binaries, no compile step) plus the small,
// dependency-free `perspective-transform` package for just the homography
// math, driving a hand-written inverse-warp/bilinear-sample loop — the
// warp itself is a well-defined, bounded problem (4 known points, not
// open-ended detection), not something that needs a full CV library.

export interface Point {
  x: number;
  y: number;
}

/** Corners in the raw photo's own pixel coordinates, in order: top-left,
 * top-right, bottom-right, bottom-left — matching `docs/screens/scan-spec.md`'s
 * `scan-corner-handle-tl/-tr/-br/-bl`. */
export type Corners = [Point, Point, Point, Point];

export class InvalidCornersError extends Error {}

// Caps the long edge of the output page — bounds both processing time and
// output file size regardless of how high-resolution the source phone photo
// is; 1800px is comfortably enough for a legible on-screen preview and a
// reasonable print, without the warp loop iterating over a multi-megapixel
// output.
const MAX_OUTPUT_DIMENSION = 1800;
// Below this, the four corners are too close together / too degenerate
// (a mis-tap, or a near-zero-area polygon) to be a real page — reject
// rather than produce a garbage 1x1-ish output.
const MIN_QUAD_AREA = 400;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Shoelace formula.
function quadArea(corners: Corners): number {
  let area = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function sampleBilinear(
  src: Buffer,
  srcWidth: number,
  srcHeight: number,
  channels: number,
  x: number,
  y: number,
): number[] {
  const clampedX = Math.max(0, Math.min(srcWidth - 1.001, x));
  const clampedY = Math.max(0, Math.min(srcHeight - 1.001, y));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = clampedX - x0;
  const fy = clampedY - y0;

  const result: number[] = new Array(channels);
  for (let c = 0; c < channels; c++) {
    const p00 = src[(y0 * srcWidth + x0) * channels + c];
    const p10 = src[(y0 * srcWidth + x1) * channels + c];
    const p01 = src[(y1 * srcWidth + x0) * channels + c];
    const p11 = src[(y1 * srcWidth + x1) * channels + c];
    const top = p00 * (1 - fx) + p10 * fx;
    const bottom = p01 * (1 - fx) + p11 * fx;
    result[c] = top * (1 - fy) + bottom * fy;
  }
  return result;
}

/** Perspective-corrects `rawImageBuffer` to the rectangle implied by
 * `corners`, then cleans it up (contrast normalize + sharpen) and encodes
 * it as a JPEG. Throws InvalidCornersError for a degenerate quad. */
export async function warpAndCleanPage(rawImageBuffer: Buffer, corners: Corners): Promise<Buffer> {
  if (quadArea(corners) < MIN_QUAD_AREA) {
    throw new InvalidCornersError('The marked corners are too small or degenerate.');
  }

  // .rotate() with no args auto-orients from EXIF — phone photos routinely
  // carry rotation as metadata rather than in the pixel data itself; without
  // this the warp would run against a sideways image. removeAlpha() pins the
  // channel count to a known 3 (RGB) regardless of source format.
  const { data: srcData, info: srcInfo } = await sharp(rawImageBuffer)
    .rotate()
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = srcInfo.channels;
  const srcWidth = srcInfo.width;
  const srcHeight = srcInfo.height;

  const [tl, tr, br, bl] = corners;
  const rawOutWidth = Math.round((distance(tl, tr) + distance(bl, br)) / 2);
  const rawOutHeight = Math.round((distance(tl, bl) + distance(tr, br)) / 2);
  const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(rawOutWidth, rawOutHeight, 1));
  const outWidth = Math.max(1, Math.round(rawOutWidth * scale));
  const outHeight = Math.max(1, Math.round(rawOutHeight * scale));

  // Solved once for the whole page — the transform maps output-rectangle
  // coordinates back to the matching point in the source photo
  // (transformInverse), which is what inverse-warping needs: iterate over
  // every output pixel and ask "where does this come from in the source,"
  // rather than iterating the source and hoping every output pixel gets hit.
  const perspT = PerspT(
    [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y],
    [0, 0, outWidth, 0, outWidth, outHeight, 0, outHeight],
  );

  const outData = Buffer.alloc(outWidth * outHeight * channels);
  for (let oy = 0; oy < outHeight; oy++) {
    for (let ox = 0; ox < outWidth; ox++) {
      const [sx, sy] = perspT.transformInverse(ox, oy);
      const pixel = sampleBilinear(srcData, srcWidth, srcHeight, channels, sx, sy);
      const outIdx = (oy * outWidth + ox) * channels;
      for (let c = 0; c < channels; c++) {
        outData[outIdx + c] = Math.max(0, Math.min(255, Math.round(pixel[c])));
      }
    }
  }

  return sharp(outData, { raw: { width: outWidth, height: outHeight, channels } })
    .normalize()
    .sharpen()
    .jpeg({ quality: 92 })
    .toBuffer();
}
