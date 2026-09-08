import { computeGuideMarkers, mmToPx, DEFAULT_DPI } from '../cropUtil';
import type { CaptureSpec } from '../types';

interface ShotReviewScreenProps {
  shotDataUrl: string;
  spec: CaptureSpec;
  onRetake: () => void;
  onAccept: () => void;
}

// Guide lines here mark where the DOCUMENT'S OWN requirements say the head
// should sit in the final photo — not a debug view of what MediaPipe
// detected (that was a temporary internal-only overlay, since removed).
// Reusing cropUtil.ts's computeGuideMarkers against the final output's own
// pixel dimensions (rather than the live camera frame) turns the same
// geometry CaptureScreen previews live into a customer-facing "does my
// photo actually line up" check on the shot they're about to accept.
export function ShotReviewScreen({ shotDataUrl, spec, onRetake, onAccept }: ShotReviewScreenProps) {
  const dpi = spec.dpi ?? DEFAULT_DPI;
  const targetW = mmToPx(spec.widthMm, dpi);
  const targetH = mmToPx(spec.heightMm, dpi);
  const markers = computeGuideMarkers({ x: 0, y: 0, width: targetW, height: targetH }, spec);

  const showHeadBand = markers.headTopY !== undefined || markers.headBottomY !== undefined;
  const showWidthBand = markers.headLeftX !== undefined;
  const showAnyGuide = markers.eyeLineY !== undefined || showHeadBand || showWidthBand;

  return (
    <div className="pk-screen pk-screen-center" id="view-shot-review">
      <h1 className="pk-title">Подтвердите кадр</h1>
      <div className="pk-shot-review-body">
        <div className="pk-shot-preview-wrap">
          <img
            src={shotDataUrl}
            alt="Captured shot"
            className="pk-shot-preview"
            id="shot-review-image"
          />
          {markers.eyeLineY !== undefined && (
            <div
              className="pk-shot-guide pk-shot-guide-eyeline"
              style={{ top: `${(markers.eyeLineY / targetH) * 100}%` }}
            />
          )}
          {markers.headTopY !== undefined && (
            <div
              className="pk-shot-guide pk-shot-guide-headband"
              style={{ top: `${(markers.headTopY / targetH) * 100}%` }}
            />
          )}
          {markers.headBottomY !== undefined && (
            <div
              className="pk-shot-guide pk-shot-guide-headband"
              style={{ top: `${(markers.headBottomY / targetH) * 100}%` }}
            />
          )}
          {markers.headLeftX !== undefined && (
            <div
              className="pk-shot-guide pk-shot-guide-widthband"
              style={{ left: `${(markers.headLeftX / targetW) * 100}%` }}
            />
          )}
          {markers.headRightX !== undefined && (
            <div
              className="pk-shot-guide pk-shot-guide-widthband"
              style={{ left: `${(markers.headRightX / targetW) * 100}%` }}
            />
          )}
        </div>
        {showAnyGuide && (
          <ul className="pk-shot-legend" id="shot-review-legend">
            {markers.eyeLineY !== undefined && (
              <li>
                <span className="pk-shot-legend-swatch pk-shot-legend-eyeline" />
                Жёлтая линия — здесь должны быть глаза
              </li>
            )}
            {showHeadBand && (
              <li>
                <span className="pk-shot-legend-swatch pk-shot-legend-headband" />
                Зелёные линии — макушка и подбородок должны быть между ними
              </li>
            )}
            {showWidthBand && (
              <li>
                <span className="pk-shot-legend-swatch pk-shot-legend-widthband" />
                Синие линии — голова по ширине должна помещаться между ними
              </li>
            )}
          </ul>
        )}
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
          onClick={onAccept}
        >
          Далее
        </button>
      </div>
    </div>
  );
}
