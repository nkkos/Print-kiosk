interface MenuScreenProps {
  onSelectDocumentPhoto: () => void;
}

// docs/photo-kiosk-requirements.md's revised (2026-08-25) three-item menu — a
// standalone "10×15" button was dropped (it's just "AI бэкграунд" with no effect
// selected). "AI бэкграунд" and "фотолента" aren't built this pass — see that
// document's own open items (MediaPipe+OpenCV experiment, auto multi-shot capture).
export function MenuScreen({ onSelectDocumentPhoto }: MenuScreenProps) {
  return (
    <div className="pk-screen" id="view-menu">
      <h1 className="pk-title">Сделать фото</h1>
      <div className="pk-menu-grid">
        <button
          type="button"
          className="pk-menu-card"
          id="menu-document-photo"
          onClick={onSelectDocumentPhoto}
        >
          Фото на документы
        </button>
        <button
          type="button"
          className="pk-menu-card"
          id="menu-ai-background"
          disabled
          title="Скоро"
        >
          AI бэкграунд
        </button>
        <button type="button" className="pk-menu-card" id="menu-photo-strip" disabled title="Скоро">
          Фото-лента
        </button>
      </div>
    </div>
  );
}
