import { AI_BACKGROUND_LOOKS, type AiBackgroundLook } from '../aiBackgroundLooks';

interface AiBackgroundGalleryScreenProps {
  onSelectLook: (look: AiBackgroundLook) => void;
}

// Shown BEFORE the camera (2026-09-15 discovery decision, revising the
// branch's earlier "capture, then pick a look" plan): the customer needs
// to see what's actually on offer and decide it's worth their time before
// committing to the capture steps, not discover the catalog only after
// already posing for a photo. This only reorders the SCREEN sequence —
// the actual pixel compositing (portraitMatting.ts's
// compositeOntoImageBackground) still happens after capture, once
// ShotReviewScreen's crop is confirmed, same as it always was going to.
export function AiBackgroundGalleryScreen({ onSelectLook }: AiBackgroundGalleryScreenProps) {
  return (
    <div className="pk-screen" id="view-ai-background-gallery">
      <h1 className="pk-title">Выберите фон</h1>
      <p className="pk-form-hint">
        Снимок сделаете на следующем шаге — сейчас просто выберите фон.
      </p>
      <div className="pk-menu-grid">
        {AI_BACKGROUND_LOOKS.map((look) => (
          <button
            key={look.id}
            type="button"
            className="pk-menu-card pk-look-card"
            id={`ai-background-look-${look.id}`}
            onClick={() => onSelectLook(look)}
          >
            <img src={look.imageUrl} alt={look.label} className="pk-look-thumb" />
            <span>{look.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
