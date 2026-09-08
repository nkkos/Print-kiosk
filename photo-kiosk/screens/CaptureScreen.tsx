import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeGuideRect,
  computeGuideMarkers,
  computeSourceCropRect,
  computeDetectedCropRect,
  cropAndScaleToDataUrl,
} from '../cropUtil';
import { detectFace, preloadFaceDetection } from '../faceDetection';
import type { CaptureSpec } from '../types';

interface CaptureScreenProps {
  spec: CaptureSpec;
  onCaptured: (dataUrl: string) => void;
}

// Real camera capture via getUserMedia — not mocked. The pavilion's actual booth
// camera (docs/photo-kiosk-requirements.md's open hardware item) isn't chosen yet,
// but this uses whatever camera the machine actually has, the same way any other
// real-device integration in this project is tested against real hardware rather
// than faked, even before the final production hardware is picked.
//
// The on-screen guide is a loose self-alignment aid only (cropUtil.ts). For any
// document with a head-height band (headHeightMinMm/MaxMm — every real DB
// PhotoDocument), the actual crop is refined from real MediaPipe face-landmark
// detection run on the captured frame (jiggly-beaming-dragonfly.md) — but
// detection is strictly an opportunistic precision layer, never a gate: the
// kiosk must take whatever photo the customer gives it (confirmed after real
// testing kept getting rejected over ordinary seating distance). If detection
// can't find exactly one face, or the ideal detected-crop geometry doesn't
// fit the frame, capture silently falls back to (or clamps toward) the same
// guide-based crop "Произвольный размер" always uses — the customer never
// sees a retry prompt over any of this.
export function CaptureScreen({ spec, onCaptured }: CaptureScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [processing, setProcessing] = useState(false);

  const hasHeadHeightBand = spec.headHeightMinMm != null && spec.headHeightMaxMm != null;

  useEffect(() => {
    if (hasHeadHeightBand) preloadFaceDetection();
  }, [hasHeadHeightBand]);

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

  const captureWithGuide = useCallback(
    (video: HTMLVideoElement) => {
      const guide =
        frameSize.width > 0 ? computeGuideRect(frameSize.width, frameSize.height, spec) : null;
      if (!guide) return;
      const sourceRect = computeSourceCropRect(video, frameSize, guide);
      onCaptured(cropAndScaleToDataUrl(video, sourceRect, spec));
    },
    [frameSize, spec, onCaptured],
  );

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    if (!hasHeadHeightBand) {
      captureWithGuide(video);
      return;
    }

    setProcessing(true);
    const detected = await detectFace(video);
    setProcessing(false);

    if (!detected.ok) {
      // Couldn't find exactly one face (no-face / multiple-faces) — fall
      // back to the plain guide crop rather than ever refusing the shot.
      captureWithGuide(video);
      return;
    }

    const rect = computeDetectedCropRect(detected, spec, video.videoWidth, video.videoHeight);
    onCaptured(cropAndScaleToDataUrl(video, rect, spec));
  }, [spec, onCaptured, hasHeadHeightBand, captureWithGuide]);

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
