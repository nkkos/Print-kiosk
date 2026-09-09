import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeGuideRect,
  computeGuideMarkers,
  computeGenerousCropRect,
  drawMirroredCrop,
  estimateFallbackLandmarks,
} from '../cropUtil';
import { detectFace, preloadFaceDetection } from '../faceDetection';
import { recolorBackground, preloadBackgroundRemoval } from '../chromaKey';
import type { CaptureSpec, PendingShot } from '../types';

interface CaptureScreenProps {
  spec: CaptureSpec;
  onCaptured: (shot: PendingShot) => void;
}

// Real camera capture via getUserMedia — not mocked. The pavilion's actual booth
// camera (docs/photo-kiosk-requirements.md's open hardware item) isn't chosen yet,
// but this uses whatever camera the machine actually has, the same way any other
// real-device integration in this project is tested against real hardware rather
// than faked, even before the final production hardware is picked.
//
// The on-screen guide here is a loose self-alignment aid only (cropUtil.ts) — the
// real crop is decided after capture, on ShotReviewScreen. This screen's only job
// is to produce a GENEROUS crop (wider than the final document size) around
// either real MediaPipe-detected face landmarks or, if detection couldn't find
// exactly one clear face, a heuristic estimate (estimateFallbackLandmarks) —
// detection never blocks the shot (confirmed after real testing kept getting
// rejected over ordinary seating distance). The customer adjusts those landmarks
// on the review screen before the actual document-sized crop is cut.
//
// When the document specifies a backgroundColorHex, the RAW captured frame is
// recolored (chromaKey.ts — classical colour-distance keying against the
// booth's own known backdrop, not ML segmentation; see that file for why)
// before any of the above, so both the generous preview and the final crop
// already show the replaced background; face detection then runs on the
// recolored frame (background replacement doesn't touch foreground pixels,
// so this doesn't affect it).
export function CaptureScreen({ spec, onCaptured }: CaptureScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    preloadFaceDetection();
    if (spec.backgroundColorHex) preloadBackgroundRemoval();
  }, [spec.backgroundColorHex]);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не удалось получить доступ к камере');
        }
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      setFrameSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const guideRect =
    frameSize.width > 0 ? computeGuideRect(frameSize.width, frameSize.height, spec) : null;
  const guideMarkers = guideRect ? computeGuideMarkers(guideRect, spec) : null;

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    setProcessing(true);
    const source = spec.backgroundColorHex
      ? await recolorBackground(video, spec.backgroundColorHex)
      : video;
    const detected = await detectFace(source);
    setProcessing(false);

    const landmarks = detected.ok
      ? {
          eyeLineY: detected.eyeLineY,
          headTopY: detected.headTopY,
          headBottomY: detected.chinY,
          headLeftX: detected.headLeftX,
          headRightX: detected.headRightX,
        }
      : estimateFallbackLandmarks(spec, video.videoWidth, video.videoHeight);

    const generousRect = computeGenerousCropRect(
      landmarks,
      spec,
      video.videoWidth,
      video.videoHeight,
    );
    const { canvas, landmarks: rawLandmarks } = drawMirroredCrop(source, generousRect, landmarks);

    onCaptured({
      rawDataUrl: canvas.toDataURL('image/jpeg', 0.92),
      rawWidth: canvas.width,
      rawHeight: canvas.height,
      landmarks: rawLandmarks,
    });
  }, [spec, onCaptured]);

  // Capture fires from an effect (not inside the setCountdown updater below) —
  // calling onCaptured's parent setState directly from a functional state
  // updater is a cross-component setState-during-render, which React warns
  // about even though it "works."
  useEffect(() => {
    if (countdown === 0) {
      void capture();
      setCountdown(null);
    }
  }, [countdown, capture]);

  function startCountdown() {
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((current) => {
        if (current === null) return null;
        if (current <= 1) {
          clearInterval(interval);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  return (
    <div className="pk-screen pk-screen-center" id="view-capture">
      {error ? (
        <p className="pk-error" id="capture-camera-error">
          {error}
        </p>
      ) : (
        <>
          <div className="pk-camera-frame" ref={frameRef}>
            <video ref={videoRef} id="capture-video" autoPlay playsInline muted />
            {guideRect && (
              <div
                className="pk-guide-frame"
                id="capture-guide"
                style={{
                  left: guideRect.x,
                  top: guideRect.y,
                  width: guideRect.width,
                  height: guideRect.height,
                }}
              />
            )}
            {guideMarkers?.eyeLineY !== undefined && (
              <div className="pk-guide-eyeline" style={{ top: guideMarkers.eyeLineY }} />
            )}
            {guideMarkers?.headTopY !== undefined && (
              <div className="pk-guide-headband" style={{ top: guideMarkers.headTopY }} />
            )}
            {guideMarkers?.headBottomY !== undefined && (
              <div className="pk-guide-headband" style={{ top: guideMarkers.headBottomY }} />
            )}
            {guideMarkers?.headLeftX !== undefined && (
              <div className="pk-guide-widthband" style={{ left: guideMarkers.headLeftX }} />
            )}
            {guideMarkers?.headRightX !== undefined && (
              <div className="pk-guide-widthband" style={{ left: guideMarkers.headRightX }} />
            )}
            {countdown !== null && (
              <div className="pk-countdown" id="capture-countdown">
                {countdown}
              </div>
            )}
            {processing && (
              <div className="pk-countdown" id="capture-processing">
                Обрабатываем…
              </div>
            )}
          </div>
          <button
            type="button"
            className="pk-btn pk-btn-primary"
            id="capture-start"
            onClick={startCountdown}
            disabled={!ready || countdown !== null || processing}
          >
            {processing ? 'Обрабатываем…' : ready ? 'Снять кадр (3-2-1)' : 'Подключаем камеру…'}
          </button>
        </>
      )}
    </div>
  );
}
