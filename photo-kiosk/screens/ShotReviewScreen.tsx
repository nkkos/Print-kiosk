interface ShotReviewScreenProps {
  shotDataUrl: string;
  onRetake: () => void;
  onAccept: () => void;
}

export function ShotReviewScreen({ shotDataUrl, onRetake, onAccept }: ShotReviewScreenProps) {
  return (
    <div className="pk-screen pk-screen-center" id="view-shot-review">
      <h1 className="pk-title">Подтвердите кадр</h1>
      <img
        src={shotDataUrl}
        alt="Captured shot"
        className="pk-shot-preview"
        id="shot-review-image"
      />
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
