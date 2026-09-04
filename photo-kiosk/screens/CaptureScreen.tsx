import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeGuideRect,
  computeGuideMarkers,
  computeSourceCropRect,
  cropAndScaleToDataUrl,
} from '../cropUtil';
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
// Crop is frame-guide + geometry only this pass (cropUtil.ts) — the customer
// self-aligns against an on-screen guide box, no face detection. Automatic
// face-centered cropping (MediaPipe) is a deliberate, separate follow-up.
export function CaptureScreen({ spec, onCaptured }: CaptureScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

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

  const capture = useCallback(() => {
    const video = videoRef.current;
    const guide =
      frameSize.width > 0 ? computeGuideRect(frameSize.width, frameSize.height, spec) : null;
    if (!video || !guide) return;
    const sourceRect = computeSourceCropRect(video, frameSize, guide);
    onCaptured(cropAndScaleToDataUrl(video, sourceRect, spec));
  }, [frameSize, spec, onCaptured]);

  // Capture fires from an effect (not inside the setCountdown updater below) —
  // calling onCaptured's parent setState directly from a functional state
  // updater is a cross-component setState-during-render, which React warns
  // about even though it "works."
  useEffect(() => {
    if (countdown === 0) {
      capture();
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
            {guideMarkers && (
              <div className="pk-guide-eyeline" style={{ top: guideMarkers.eyeLineY }} />
            )}
            {guideMarkers?.headTopY !== undefined && (
              <div className="pk-guide-headband" style={{ top: guideMarkers.headTopY }} />
            )}
            {guideMarkers?.headBottomY !== undefined && (
              <div className="pk-guide-headband" style={{ top: guideMarkers.headBottomY }} />
            )}
            {countdown !== null && (
              <div className="pk-countdown" id="capture-countdown">
                {countdown}
              </div>
            )}
          </div>
          <button
            type="button"
            className="pk-btn pk-btn-primary"
            id="capture-start"
            onClick={startCountdown}
            disabled={!ready || countdown !== null}
          >
            {ready ? 'Снять кадр (3-2-1)' : 'Подключаем камеру…'}
          </button>
        </>
      )}
    </div>
  );
}
