import type { ShopSession } from './shopSession';
import type { ShopScreen } from './ShopApp';

interface ShopNavProps {
  screen: ShopScreen;
  onNavigate: (screen: ShopScreen) => void;
  cartCount: number;
  session: ShopSession | null;
  onLogout: () => void;
}

export function ShopNav({ screen, onNavigate, cartCount, session, onLogout }: ShopNavProps) {
  return (
    <div className="shop-nav">
      <div className="shop-nav-inner">
        <button
          type="button"
          className="shop-brand"
          id="shop-nav-catalog"
          onClick={() => onNavigate('catalog')}
        >
          Kiosk Shop
        </button>
        <nav className="shop-nav-links">
          <button
            type="button"
            id="shop-nav-orders"
            className={`shop-nav-link${screen === 'orders' ? ' current' : ''}`}
            onClick={() => onNavigate('orders')}
          >
            Мои заказы
          </button>
          <button
            type="button"
            id="shop-nav-cart"
            className={`shop-nav-link${screen === 'cart' ? ' current' : ''}`}
            onClick={() => onNavigate('cart')}
          >
            Корзина{cartCount > 0 && <span className="shop-cart-badge">{cartCount}</span>}
          </button>
          {session ? (
            <button type="button" id="shop-nav-logout" className="shop-nav-link" onClick={onLogout}>
              {session.email} · Выйти
            </button>
          ) : (
            <button
              type="button"
              id="shop-nav-login"
              className="shop-nav-link"
              onClick={() => onNavigate('orders')}
            >
              Войти
            </button>
          )}
        </nav>
      </div>
    </div>
  );
}
