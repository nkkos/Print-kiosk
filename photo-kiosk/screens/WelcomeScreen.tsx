interface WelcomeScreenProps {
  onStartPhoto: () => void;
}

// docs/photo-kiosk-requirements.md's wireframe walkthrough, screen 1. "Распечатать
// ваше фото" (print an already-taken photo) isn't built this pass — every branch
// discovered so far starts from a fresh capture.
export function WelcomeScreen({ onStartPhoto }: WelcomeScreenProps) {
  return (
    <div className="pk-screen pk-screen-center" id="view-welcome">
      <h1 className="pk-title">Добро пожаловать в фото-киоск</h1>
      <div className="pk-hero-actions">
        <button
          type="button"
          className="pk-btn pk-btn-primary"
          id="welcome-take-photo"
          onClick={onStartPhoto}
        >
          Сделать фото
        </button>
        <button
          type="button"
          className="pk-btn pk-btn-ghost"
          id="welcome-print-photo"
          disabled
          title="Скоро"
        >
          Распечатать ваше фото
        </button>
      </div>
    </div>
  );
}
