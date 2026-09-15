// Background replacement via a dedicated ML portrait-matting model —
// distinct from both chromaKey.ts (colour-based, requires a controlled
// backdrop) and backgroundSegmentation.ts (a lightweight general-purpose
// segmentation model, already tried and rejected: worse on a contrasting
// backdrop, and documented by Google as weak on fine hair detail).
//
// MODNet (Apache-2.0, https://github.com/ZHKKKe/MODNet) is a different
// class of model — trained and benchmarked specifically for hair-level
// alpha detail, not just a person/not-person mask — and, unlike chroma-
// key, needs no known backdrop colour at all, so it's a candidate for
// BOTH "Фото на документы" and "AI бэкграунд", not just the former.
//
// 2026-09-15: NOT yet validated against our real camera/lighting — this
// is a first implementation to test, following the same real-capture
// verification discipline this session already applied to chroma-key,
// not a claim that it's already proven better. See the "Способы замены
// фона" research artifact for the full comparison and why MODNet was
// picked over RobustVideoMatting (better hair benchmarks, but GPL-3.0 —
// a real licensing risk for a closed commercial product) and
// BackgroundMattingV2 (comparable, but needs an extra captured
// empty-backdrop reference frame that MODNet doesn't).
//
// Model: DavG25/modnet-pretrained-models on Hugging Face (Apache-2.0),
// self-hosted at public/models/modnet.onnx (~25MB) rather than fetched
// from a CDN, same self-hosting convention as the MediaPipe assets next
// to it — this is a one-time download cached on the kiosk's own fixed
// PC, not shipped to arbitrary visitors. Runs via onnxruntime-web's WASM
// backend — CPU/WASM chosen over WebGL/WebGPU execution providers for
// the same reason faceDetection.ts uses MediaPipe's CPU delegate: a
// one-shot still-image pipeline, not worth juggling GPU context
// ownership across multiple libraries.
//
// The runtime's own .wasm/.mjs files are imported here (with `?url`)
// straight from node_modules rather than copied into public/models/ —
// unlike the MediaPipe assets, onnxruntime-web's WASM loader does a
// genuine runtime `import()` of its .mjs glue file, and Vite's dev
// server explicitly refuses to serve anything under public/ that way
// ("should not be imported from source code... can only be referenced
// via HTML tags") — confirmed by hitting exactly that error first.
// Importing via Vite's asset pipeline instead sidesteps it entirely and
// still keeps everything self-hosted, no CDN involved.
import * as ort from 'onnxruntime-web/wasm';
import onnxWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import onnxMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

ort.env.wasm.wasmPaths = { wasm: onnxWasmUrl, mjs: onnxMjsUrl };

const MODEL_URL = '/models/modnet.onnx';

// MODNet's own published preprocessing (ZHKKKe/MODNet, onnx/onnx_inference.py):
// resize so the frame's long side is ~512px (skip resizing if it's already
// within a sensible range of that), then round both dimensions down to a
// multiple of 32 — the network's conv/pooling stack requires that.
const REF_SIZE = 512;

function computeResizeDims(width: number, height: number): { rw: number; rh: number } {
  let rw = width;
  let rh = height;
  if (Math.max(width, height) < REF_SIZE || Math.min(width, height) > REF_SIZE) {
    if (width >= height) {
      rh = REF_SIZE;
      rw = Math.round((width / height) * REF_SIZE);
    } else {
      rw = REF_SIZE;
      rh = Math.round((height / width) * REF_SIZE);
    }
  }
  rw -= rw % 32;
  rh -= rh % 32;
  return { rw: Math.max(rw, 32), rh: Math.max(rh, 32) };
}

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] });
  }
  return sessionPromise;
}

// Unlike chromaKey.ts's no-op version of this name, loading a ~25MB model
// genuinely benefits from starting early — CaptureScreen.tsx's mount
// effect already calls this when spec.backgroundColorHex is set.
export function preloadBackgroundRemoval(): void {
  void getSession();
}

/** Replaces everything MODNet doesn't classify as the person with a solid
 * `targetHex` background — returns a new canvas. Async signature matches
 * chromaKey.ts/backgroundSegmentation.ts's same-named export so
 * CaptureScreen.tsx can swap between them by changing one import line. */
export async function recolorBackground(
  source: HTMLVideoElement | HTMLCanvasElement,
  targetHex: string,
): Promise<HTMLCanvasElement> {
  const width = 'videoWidth' in source ? source.videoWidth : source.width;
  const height = 'videoHeight' in source ? source.videoHeight : source.height;

  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = width;
  fullCanvas.height = height;
  const fullCtx = fullCanvas.getContext('2d');
  if (!fullCtx) return fullCanvas;
  fullCtx.drawImage(source, 0, 0, width, height);

  // Inference runs at MODNet's expected (smaller) resolution — the model
  // itself decides how much detail it can extract, running it at full
  // capture resolution wouldn't add matte quality, only latency.
  const { rw, rh } = computeResizeDims(width, height);
  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = rw;
  smallCanvas.height = rh;
  const smallCtx = smallCanvas.getContext('2d');
  if (!smallCtx) return fullCanvas;
  smallCtx.drawImage(fullCanvas, 0, 0, rw, rh);
  const smallData = smallCtx.getImageData(0, 0, rw, rh).data;

  // NCHW float32, normalized to [-1, 1] (mean=0.5, std=0.5 per channel) —
  // MODNet's own published normalization, not a guess.
  const plane = rw * rh;
  const inputData = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const srcIdx = i * 4;
    inputData[i] = smallData[srcIdx] / 127.5 - 1;
    inputData[plane + i] = smallData[srcIdx + 1] / 127.5 - 1;
    inputData[2 * plane + i] = smallData[srcIdx + 2] / 127.5 - 1;
  }

  const session = await getSession();
  const inputTensor = new ort.Tensor('float32', inputData, [1, 3, rh, rw]);
  const results = await session.run({ [session.inputNames[0]]: inputTensor });
  const matteData = results[session.outputNames[0]].data as Float32Array;

  // Paint the (small-resolution) alpha matte into a canvas, then let the
  // browser's own bilinear scaling upsize it back to capture resolution —
  // simpler than hand-rolling a resampler, and good enough for a soft
  // alpha edge that's already been smoothed by the network itself.
  const matteCanvas = document.createElement('canvas');
  matteCanvas.width = rw;
  matteCanvas.height = rh;
  const matteCtx = matteCanvas.getContext('2d');
  if (!matteCtx) return fullCanvas;
  const matteImageData = matteCtx.createImageData(rw, rh);
  for (let i = 0; i < plane; i++) {
    const alpha = Math.min(Math.max(matteData[i], 0), 1) * 255;
    matteImageData.data[i * 4] = alpha;
    matteImageData.data[i * 4 + 1] = alpha;
    matteImageData.data[i * 4 + 2] = alpha;
    matteImageData.data[i * 4 + 3] = 255;
  }
  matteCtx.putImageData(matteImageData, 0, 0);

  const upscaledMatteCanvas = document.createElement('canvas');
  upscaledMatteCanvas.width = width;
  upscaledMatteCanvas.height = height;
  const upscaledCtx = upscaledMatteCanvas.getContext('2d');
  if (!upscaledCtx) return fullCanvas;
  // A small blur while upscaling (2026-09-15, added after a real test showed
  // a blocky/"staircase" edge) softens exactly that: the matte was computed
  // at MODNet's own much lower inference resolution, so scaling it back up
  // to full capture resolution can show the individual low-res matte pixels
  // as visible steps along the boundary. Radius scales with image width so
  // it stays proportionate across different camera resolutions, rather than
  // a fixed pixel count that would be too strong or too weak depending on
  // capture size.
  upscaledCtx.filter = `blur(${Math.max(2, Math.round(width / 250))}px)`;
  upscaledCtx.drawImage(matteCanvas, 0, 0, width, height);
  upscaledCtx.filter = 'none';
  const upscaledMatte = upscaledCtx.getImageData(0, 0, width, height).data;

  // Spill suppression (2026-09-15, added after a real test): a partially-
  // transparent edge pixel (a hair strand, say) was itself already a mix of
  // real foreground colour and whatever the ORIGINAL backdrop was — naively
  // blending that mixed pixel straight onto the new target still carries a
  // trace of the old backdrop's colour. Invisible against a strongly
  // contrasting target (confirmed fine against red), but visible as a
  // muddy/off tint against a neutral one (confirmed on light grey). Fix:
  // estimate the real backdrop colour from THIS capture's own confidently-
  // background pixels (matte alpha ~0), then un-mix it out of each edge
  // pixel before recompositing onto the target — the same "spill removal"
  // idea real matting/chroma-key pipelines use, just derived from data
  // instead of a hardcoded key colour (nothing here assumes a specific
  // backdrop, matching MODNet's whole point).
  let bgSumR = 0;
  let bgSumG = 0;
  let bgSumB = 0;
  let bgCount = 0;
  for (let i = 0; i < plane; i++) {
    if (matteData[i] < 0.05) {
      const srcIdx = i * 4;
      bgSumR += smallData[srcIdx];
      bgSumG += smallData[srcIdx + 1];
      bgSumB += smallData[srcIdx + 2];
      bgCount++;
    }
  }
  const bgR = bgCount > 0 ? bgSumR / bgCount : 0;
  const bgG = bgCount > 0 ? bgSumG / bgCount : 0;
  const bgB = bgCount > 0 ? bgSumB / bgCount : 0;

  const fullImageData = fullCtx.getImageData(0, 0, width, height);
  const fullPixels = fullImageData.data;
  const targetR = parseInt(targetHex.slice(1, 3), 16);
  const targetG = parseInt(targetHex.slice(3, 5), 16);
  const targetB = parseInt(targetHex.slice(5, 7), 16);

  // The un-mix division below amplifies whatever it's given by 1/alpha, so
  // at the low-to-mid alpha values a real hair strand's edge actually sits
  // at, a none-too-accurate backdrop estimate or an imperfect matte value
  // could overshoot into a wrong colour rather than a merely imperfect one
  // — a real risk noted when this correction was first added, and worth
  // capping now that a real test showed exactly that overshoot as a visible
  // tint. Clamping how far the correction may move a pixel from what the
  // camera actually captured keeps the fix directional without letting it
  // run away.
  const SPILL_CORRECTION_LIMIT = 60;
  function correctChannel(original: number, bg: number, alpha: number, safeAlpha: number): number {
    const raw = (original - (1 - alpha) * bg) / safeAlpha;
    const delta = Math.min(
      Math.max(raw - original, -SPILL_CORRECTION_LIMIT),
      SPILL_CORRECTION_LIMIT,
    );
    return Math.min(Math.max(original + delta, 0), 255);
  }

  for (let i = 0; i < fullPixels.length; i += 4) {
    const alpha = upscaledMatte[i] / 255;
    // Below ~2%, the un-mix division would amplify noise for no visible
    // benefit — at that little foreground weight the composited result is
    // already almost entirely the target colour regardless.
    const safeAlpha = Math.max(alpha, 0.02);
    const fgR = correctChannel(fullPixels[i], bgR, alpha, safeAlpha);
    const fgG = correctChannel(fullPixels[i + 1], bgG, alpha, safeAlpha);
    const fgB = correctChannel(fullPixels[i + 2], bgB, alpha, safeAlpha);

    fullPixels[i] = fgR * alpha + targetR * (1 - alpha);
    fullPixels[i + 1] = fgG * alpha + targetG * (1 - alpha);
    fullPixels[i + 2] = fgB * alpha + targetB * (1 - alpha);
  }
  fullCtx.putImageData(fullImageData, 0, 0);
  return fullCanvas;
}
