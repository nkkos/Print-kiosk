import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { EndSessionReason } from '../src/types/kiosk';
import { Modal } from './components/Modal';
import { PersistentActionBar } from './components/PersistentActionBar';
import type { PhotoCartItem } from './types';

// Mirrors src/layouts/KioskScreenLayout/KioskScreenLayout.tsx's structure at a
// much smaller prop surface — forked, not imported (see PersistentActionBar's
// comment for the full reasoning: photo-kiosk has no i18n/CSS-Modules
// dependency, and no other mini-app cross-imports a composite component).
// `EndSessionReason` alone is imported directly from src/types/kiosk.ts — it's
// already fully generic ('manual' | 'timeout'), a plain type import, no
// runtime/bundle coupling.
//
// Scope cut, deliberate (none of these were requested this phase): no
// connection-lost simulation, no real login/account popup, no language
// picker — btn-account/language-switch render as inert stubs in the forked
// PersistentActionBar.
const IDLE_WARNING_DELAY_MS = 5 * 60 * 1000;
const IDLE_END_DELAY_MS = 60 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

interface PhotoKioskLayoutProps {
  /** Defaults true; Welcome passes false explicitly before a session starts,
   * same "hidden when no active session" rule as KioskScreenLayout. */
  sessionActive?: boolean;
  onEndSession: (reason: EndSessionReason) => void;
  onBack?: () => void;
  onHome?: () => void;
  cartItems: PhotoCartItem[];
  onRemoveCartItem: (id: string) => void;
  /** No per-item selection this phase — pays for the whole cart at once. */
  onProceedToPayment: () => void;
  initialCartOpen?: boolean;
  children: ReactNode;
}

export function PhotoKioskLayout({
  sessionActive = true,
  onEndSession,
  onBack,
  onHome,
  cartItems,
  onRemoveCartItem,
  onProceedToPayment,
  initialCartOpen = false,
  children,
}: PhotoKioskLayoutProps) {
  const [isCartOpen, setIsCartOpen] = useState(initialCartOpen);
  const [isEndConfirmOpen, setIsEndConfirmOpen] = useState(false);
  const [isIdleWarningOpen, setIsIdleWarningOpen] = useState(false);

  // Same 5-min-warn/1-min-end/pointerdown+keydown+touchstart pattern as
  // KioskScreenLayout's own idle timer.
  useEffect(() => {
    if (!sessionActive) {
      setIsIdleWarningOpen(false);
      return;
    }

    let warningTimeoutId: ReturnType<typeof setTimeout>;
    let endTimeoutId: ReturnType<typeof setTimeout>;

    function scheduleWarning() {
      warningTimeoutId = setTimeout(() => {
        setIsIdleWarningOpen(true);
        endTimeoutId = setTimeout(() => onEndSession('timeout'), IDLE_END_DELAY_MS);
      }, IDLE_WARNING_DELAY_MS);
    }

    function handleActivity() {
      setIsIdleWarningOpen(false);
      clearTimeout(warningTimeoutId);
      clearTimeout(endTimeoutId);
      scheduleWarning();
    }

    scheduleWarning();
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, handleActivity));

    return () => {
      clearTimeout(warningTimeoutId);
      clearTimeout(endTimeoutId);
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
    };
  }, [sessionActive, onEndSession]);

  function handleCartActivate() {
    setIsEndConfirmOpen(false);
    setIsCartOpen(true);
  }

  // Confirmation rule (docs/domain/kiosk-session.md): a genuinely empty
  // session ends immediately; a non-empty one always shows the same generic
  // confirmation first.
  function handleEndSessionClick() {
    if (cartItems.length === 0) {
      onEndSession('manual');
    } else {
      setIsCartOpen(false);
      setIsEndConfirmOpen(true);
    }
  }

  function handleConfirmEndSession() {
    setIsEndConfirmOpen(false);
    onEndSession('manual');
  }

  return (
    <div className="pk-shell">
      <header className="pk-header">
        <div className="pk-brand">Фото-киоск</div>
        <div className="pk-header-actions">
          {sessionActive && (
            <button
              type="button"
              className="pk-btn pk-btn-ghost"
              id="end-session"
              onClick={handleEndSessionClick}
            >
              Завершить и очистить данные
            </button>
          )}
        </div>
      </header>

      {(onBack || onHome) && (
        <div className="pk-nav-row">
          {onBack && (
            <button type="button" className="pk-back-link" id="navigation-back" onClick={onBack}>
              ← Назад
            </button>
          )}
          {onHome && (
            <button type="button" className="pk-back-link" id="navigation-home" onClick={onHome}>
              На главную
            </button>
          )}
        </div>
      )}

      <main className="pk-content">
        {children}

        {isCartOpen && (
          <Modal onClose={() => setIsCartOpen(false)}>
            <h2>Корзина</h2>
            {cartItems.length === 0 ? (
              <p className="pk-empty-note">Корзина пуста.</p>
            ) : (
              <>
                <ul className="pk-cart-list" id="cart-items">
                  {cartItems.map((item) => (
                    <li key={item.id} className="pk-cart-item">
                      <img
                        src={item.sheetPreviewDataUrl}
                        alt={item.spec.label}
                        className="pk-cart-thumb"
                      />
                      <span>
                        {item.spec.label} — {item.copies} копий
                      </span>
                      <button
                        type="button"
                        className="pk-btn pk-btn-ghost"
                        id={`cart-item-${item.id}-remove`}
                        onClick={() => onRemoveCartItem(item.id)}
                      >
                        Удалить
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="pk-btn pk-btn-primary"
                  id="cart-proceed-to-payment"
                  onClick={() => {
                    setIsCartOpen(false);
                    onProceedToPayment();
                  }}
                >
                  Оплатить
                </button>
              </>
            )}
          </Modal>
        )}

        {isEndConfirmOpen && (
          <Modal onClose={() => setIsEndConfirmOpen(false)}>
            <p>Вы уверены, что хотите завершить сеанс и очистить все данные?</p>
            <button
              type="button"
              className="pk-btn pk-btn-primary"
              id="end-session-confirm"
              onClick={handleConfirmEndSession}
            >
              Подтвердить
            </button>
          </Modal>
        )}

        {isIdleWarningOpen && (
          <Modal onClose={() => setIsIdleWarningOpen(false)}>
            <p>Сеанс скоро завершится из-за бездействия…</p>
          </Modal>
        )}
      </main>

      <footer className="pk-footer">
        <PersistentActionBar
          onCartActivate={handleCartActivate}
          cartHasItems={cartItems.length > 0}
        />
      </footer>
    </div>
  );
}
