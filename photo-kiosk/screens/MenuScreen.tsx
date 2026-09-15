interface MenuScreenProps {
  onSelectDocumentPhoto: () => void;
  onSelectAiBackground: () => void;
}

// docs/photo-kiosk-requirements.md's revised (2026-08-25) three-item menu — a
// standalone "10×15" button was dropped (it's just "AI бэкграунд" with no effect
// selected). "фотолента" isn't built this pass — see that document's own open
// items (auto multi-shot capture). "AI бэкграунд" got its first real build
// 2026-09-15 (backgrounds only, per that branch's own phased discovery —
// masks/beautify remain a later phase, not started).
export function MenuScreen({ onSelectDocumentPhoto, onSelectAiBackground }: MenuScreenProps) {
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
          onClick={onSelectAiBackground}
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
