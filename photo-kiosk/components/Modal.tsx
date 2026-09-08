import type { ReactNode } from 'react';

// Forked from src/components/Modal/Modal.tsx (not imported — photo-kiosk has
// no CSS-Modules build/i18n dependency, and no other mini-app cross-imports a
// composite component; see photo-kiosk's own layout comment for the full
// reasoning). Same CSS contract: non-dimming overlay bounded to the nearest
// `position: relative` ancestor (.pk-content), not the viewport — a popup
// must never cover the header/footer.
interface ModalProps {
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ onClose, children }: ModalProps) {
  return (
    <div className="pk-modal-overlay">
      <div className="pk-modal-content">
        <button
          type="button"
          className="pk-modal-close"
          id="modal-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
