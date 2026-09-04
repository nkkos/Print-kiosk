// Forked from src/components/PersistentActionBar/PersistentActionBar.tsx (not
// imported — see PhotoKioskLayout.tsx's comment for the full reasoning: no
// i18n/CSS-Modules dependency exists in photo-kiosk today). Left group is
// reference/support actions (no confirmed destination yet, same as the main
// kiosk's own build); right group is user-specific actions. `btn-account` and
// `language-switch` are visual-parity stubs this phase — no real login/i18n
// wired for photo-kiosk yet (confirmed scope cut).
interface PersistentActionBarProps {
  onCartActivate?: () => void;
  cartHasItems?: boolean;
}

export function PersistentActionBar({
  onCartActivate,
  cartHasItems = false,
}: PersistentActionBarProps) {
  return (
    <div className="pk-action-bar">
      <div className="pk-action-group">
        <span className="pk-action-item">Оператор</span>
        <span className="pk-action-item">Инструкция</span>
        <span className="pk-action-item">Тарифы</span>
      </div>
      <div className="pk-action-group">
        <button type="button" id="btn-account" className="pk-action-item pk-action-btn">
          Аккаунт
        </button>
        <button
          type="button"
          id="btn-cart"
          className="pk-action-item pk-action-btn"
          onClick={onCartActivate}
        >
          Корзина
          {cartHasItems && (
            <span className="pk-action-marker" aria-hidden="true">
              ★
            </span>
          )}
        </button>
        <button type="button" id="language-switch" className="pk-action-item pk-action-btn">
          Язык
        </button>
      </div>
    </div>
  );
}
