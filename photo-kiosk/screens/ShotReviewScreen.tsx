import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { finalizeCrop, type CropLandmarks } from '../cropUtil';
import type { CaptureSpec } from '../types';

interface ShotReviewScreenProps {
  rawDataUrl: string;
  rawWidth: number;
  rawHeight: number;
  landmarks: CropLandmarks;
  spec: CaptureSpec;
  onRetake: () => void;
  onAccept: (finalDataUrl: string) => void;
}

type LandmarkKey = keyof CropLandmarks;

// How far one tap of a nudge button moves a line — a fraction of the raw
// (generous, pre-final-crop) image's own dimension, so it scales sensibly
// regardless of camera resolution.
const NUDGE_RATIO = 0.01;

const LINE_CONFIG: { key: LandmarkKey; colorClass: string; label: string }[] = [
  { key: 'eyeLineY', colorClass: 'pk-shot-guide-eyeline', label: 'Линия глаз' },
  { key: 'headTopY', colorClass: 'pk-shot-guide-headband', label: 'Макушка' },
  { key: 'headBottomY', colorClass: 'pk-shot-guide-headband', label: 'Подбородок' },
  { key: 'headLeftX', colorClass: 'pk-shot-guide-widthband', label: 'Левый край головы' },
  { key: 'headRightX', colorClass: 'pk-shot-guide-widthband', label: 'Правый край головы' },
];

function isXAxis(key: LandmarkKey): boolean {
  return key.endsWith('X');
}

// The lines here mark REAL detected face landmarks on this specific photo
// (or, if detection couldn't find one clear face, a heuristic guess —
// cropUtil.ts's estimateFallbackLandmarks) — not a generic template
// (2026-09-09 rework: an earlier version drew the document's target
// positions instead, which didn't correspond to the customer's actual face
// at all). Each line is draggable, plus +/- buttons in the legend for
// precise nudging, so a wrong detection is fixable here rather than baked
// into the final crop or refused outright. The final document-sized crop is
// only cut once the customer confirms (finalizeCrop, via "Далее").
export function ShotReviewScreen({
  rawDataUrl,
  rawWidth,
  rawHeight,
  landmarks,
  spec,
  onRetake,
  onAccept,
}: ShotReviewScreenProps) {
  const [editable, setEditable] = useState<CropLandmarks>(landmarks);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  function setFromRatio(key: LandmarkKey, ratio: number) {
    const dimension = isXAxis(key) ? rawWidth : rawHeight;
    const clamped = Math.min(Math.max(ratio, 0), 1) * dimension;
    setEditable((prev) => ({ ...prev, [key]: clamped }));
  }

  function handlePointerDown(key: LandmarkKey) {
    return (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const wrap = wrapRef.current;
      if (!wrap) return;
      const horizontal = isXAxis(key);

      function apply(clientX: number, clientY: number) {
        const rect = wrap!.getBoundingClientRect();
        const ratio = horizontal
          ? (clientX - rect.left) / rect.width
          : (clientY - rect.top) / rect.height;
        setFromRatio(key, ratio);
      }

      apply(e.clientX, e.clientY);

      function onMove(ev: PointerEvent) {
        apply(ev.clientX, ev.clientY);
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
  }

  function nudge(key: LandmarkKey, direction: 1 | -1) {
    setEditable((prev) => {
      const current = prev[key];
      if (current == null) return prev;
      const dimension = isXAxis(key) ? rawWidth : rawHeight;
      const step = dimension * NUDGE_RATIO * direction;
      return { ...prev, [key]: Math.min(Math.max(current + step, 0), dimension) };
    });
  }

  function handleAccept() {
    const img = imgRef.current;
    if (!img) return;
    onAccept(finalizeCrop(img, rawWidth, rawHeight, editable, spec));
  }

  const visibleLines = LINE_CONFIG.filter((line) => editable[line.key] != null);

  return (
    <div className="pk-screen pk-screen-center" id="view-shot-review">
      <h1 className="pk-title">Подтвердите кадр</h1>
      <p className="pk-form-hint">
        Если линии стоят не по лицу — потяните их или подправьте кнопками рядом с подписью.
      </p>
      <div className="pk-shot-review-body">
        <div className="pk-shot-preview-wrap" ref={wrapRef}>
          <img
            ref={imgRef}
            src={rawDataUrl}
            alt="Captured shot"
            className="pk-shot-preview"
            id="shot-review-image"
          />
          {visibleLines.map((line) => {
            const horizontal = isXAxis(line.key);
            const value = editable[line.key] as number;
            const dimension = horizontal ? rawWidth : rawHeight;
            const percent = (value / dimension) * 100;
            return (
              <div
                key={line.key}
                className={`pk-shot-guide ${line.colorClass} ${horizontal ? 'pk-shot-guide-v' : 'pk-shot-guide-h'}`}
                style={horizontal ? { left: `${percent}%` } : { top: `${percent}%` }}
                onPointerDown={handlePointerDown(line.key)}
                id={`shot-review-line-${line.key}`}
              />
            );
          })}
        </div>
        <ul className="pk-shot-legend" id="shot-review-legend">
          {visibleLines.map((line) => {
            const horizontal = isXAxis(line.key);
            return (
              <li key={line.key}>
                <span className={`pk-shot-legend-swatch ${line.colorClass}`} />
                <span className="pk-shot-legend-label">{line.label}</span>
                <span className="pk-shot-legend-buttons">
                  <button
                    type="button"
                    className="pk-qty-btn"
                    id={`shot-review-nudge-${line.key}-neg`}
                    onClick={() => nudge(line.key, -1)}
                    aria-label={`${line.label}: сдвинуть ${horizontal ? 'влево' : 'вверх'}`}
                  >
                    {horizontal ? '◀' : '▲'}
                  </button>
                  <button
                    type="button"
                    className="pk-qty-btn"
                    id={`shot-review-nudge-${line.key}-pos`}
                    onClick={() => nudge(line.key, 1)}
                    aria-label={`${line.label}: сдвинуть ${horizontal ? 'вправо' : 'вниз'}`}
                  >
                    {horizontal ? '▶' : '▼'}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="pk-hero-actions">
        <button
          type="button"
          className="pk-btn pk-btn-ghost"
          id="shot-review-retake"
          onClick={onRetake}
        >
          Переснять
        </button>
        <button
          type="button"
          className="pk-btn pk-btn-primary"
          id="shot-review-accept"
          onClick={handleAccept}
        >
          Далее
        </button>
      </div>
    </div>
  );
}
