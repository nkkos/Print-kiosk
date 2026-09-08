import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

// Real face-landmark detection (docs/photo-kiosk-requirements.md's "Confirmed
// technical approach: document-photo cropping," layer 1) — self-hosted, not
// Google's CDN, so the kiosk never depends on live internet at capture time
// (public/models/, copied from the npm package's own wasm/ dir plus the two
// downloaded .task/.tflite models — see photo-kiosk/backgroundSegmentation.ts
// for the segmentation half of the same pipeline).
const MODEL_BASE_PATH = '/models';

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(`${MODEL_BASE_PATH}/wasm`).then((fileset) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: `${MODEL_BASE_PATH}/face_landmarker.task`,
          // CPU (WASM), not GPU — this is a one-shot still-image pipeline
          // (one photo per capture, not video), so GPU's latency win isn't
          // worth two MediaPipe tasks (this + ImageSegmenter) fighting over
          // WebGL context ownership on unknown kiosk-PC graphics drivers.
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        // 2, not 1 — specifically so a second face in frame is something we
        // can detect and reject, rather than silently picking face #1.
        numFaces: 2,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
      }),
    );
  }
  return landmarkerPromise;
}

/** Starts loading the model in the background — call on mount (e.g.
 * CaptureScreen) so the one-time ~15MB download/init latency is hidden
 * behind idle kiosk time rather than the capture flow itself. */
export function preloadFaceDetection(): void {
  void getLandmarker();
}

// Canonical face-mesh landmark indices — stable across MediaPipe's published
// topology (478 points, present because the bundled model includes the iris
// sub-model). Iris centers are the most stable, least expression-dependent
// points available; the face-oval's lowest point is a reliable chin proxy.
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;
const CHIN = 152;
const FACE_OVAL_LEFT = 234;
const FACE_OVAL_RIGHT = 454;

// Standard facial-proportion constant: the eye-line typically sits ~52% of
// the way up from chin to crown. No face-mesh model has a hairline landmark
// at all (docs/photo-kiosk-requirements.md's own acknowledged "top of head
// is always an approximation, even in commercial tools" limitation) — this
// extrapolates crown position from a REAL measured eye-to-chin distance
// instead of an assumed head-height average, which is strictly better than
// the fully-static guide this replaces, while staying an approximation.
const EYE_LINE_TO_HEAD_HEIGHT_RATIO = 0.52;

export type FaceDetectionResult =
  | {
      ok: true;
      /** All in native video pixel coordinates (the canvas passed in),
       * unmirrored — the same coordinate space cropUtil.ts's crop math
       * already works in. */
      chinY: number;
      eyeLineY: number;
      headTopY: number;
      headLeftX: number;
      headRightX: number;
    }
  | { ok: false; reason: 'no-face' | 'multiple-faces' };

/** Runs detection on a single frame — either the live video element at the
 * instant of capture (CaptureScreen), or a still canvas snapshot
 * (ShotReviewScreen's debug overlay). One `detect()` call reads whatever
 * pixels the source holds right now, matching the "one-shot still-image
 * pipeline" reasoning above even when the source happens to be a <video>. */
export async function detectFace(
  source: HTMLVideoElement | HTMLCanvasElement,
): Promise<FaceDetectionResult> {
  const landmarker = await getLandmarker();
  const result = landmarker.detect(source);

  if (result.faceLandmarks.length === 0) {
    return { ok: false, reason: 'no-face' };
  }
  if (result.faceLandmarks.length > 1) {
    return { ok: false, reason: 'multiple-faces' };
  }

  const landmarks = result.faceLandmarks[0];
  const w = 'videoWidth' in source ? source.videoWidth : source.width;
  const h = 'videoHeight' in source ? source.videoHeight : source.height;

  const leftIris = landmarks[LEFT_IRIS_CENTER];
  const rightIris = landmarks[RIGHT_IRIS_CENTER];
  const chin = landmarks[CHIN];
  const ovalLeft = landmarks[FACE_OVAL_LEFT];
  const ovalRight = landmarks[FACE_OVAL_RIGHT];

  const eyeLineY = ((leftIris.y + rightIris.y) / 2) * h;
  const chinY = chin.y * h;
  const eyeToChinPx = chinY - eyeLineY;
  const estimatedHeadHeightPx = eyeToChinPx / EYE_LINE_TO_HEAD_HEIGHT_RATIO;
  const headTopY = eyeLineY - (estimatedHeadHeightPx - eyeToChinPx);

  // Numeric left/right, not anatomical — the raw (unmirrored) capture means
  // index order isn't guaranteed to match screen-left/screen-right.
  const ovalLeftX = ovalLeft.x * w;
  const ovalRightX = ovalRight.x * w;

  return {
    ok: true,
    chinY,
    eyeLineY,
    headTopY,
    headLeftX: Math.min(ovalLeftX, ovalRightX),
    headRightX: Math.max(ovalLeftX, ovalRightX),
  };
}
