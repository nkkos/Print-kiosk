import { useEffect, useState } from 'react';
import {
  listPrintOrders,
  listShopOrders,
  getMe,
  updateInvoiceDetails,
  type PrintOrder,
  type ShopOrder,
} from '../services/shopApi';
import { formatPrice } from '../formatPrice';
import type { ShopSession } from '../shopSession';

interface OrdersScreenProps {
  session: ShopSession | null;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
}

const PRINT_STATUS_LABEL: Record<string, string> = {
  created: 'Не оплачен',
  paid: 'Готов к печати на киоске',
  issued: 'Напечатан',
};

const SHOP_STATUS_LABEL: Record<string, string> = {
  paid: 'Оплачен, готовим',
  preparing: 'Готовим',
  ready: 'Готов к выдаче',
  'picked-up': 'Выдан',
};

// The personal cabinet — a unified view of both order types
// (docs/shop-checkout-requirements.md's "Order visibility after checkout": print
// orders also show on the kiosk, shop orders never do — but both belong here) plus
// the optional invoice details, editable here independently of checkout too.
export function OrdersScreen({ session, onLogin, onRegister }: OrdersScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [printOrders, setPrintOrders] = useState<PrintOrder[]>([]);
  const [shopOrders, setShopOrders] = useState<ShopOrder[]>([]);
  const [invoiceCompanyName, setInvoiceCompanyName] = useState('');
  const [invoiceTaxId, setInvoiceTaxId] = useState('');
  const [savedNote, setSavedNote] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    Promise.all([
      listPrintOrders(session.sessionToken),
      listShopOrders(session.sessionToken),
      getMe(session.sessionToken),
    ]).then(([prints, shops, profile]) => {
      if (cancelled) return;
      setPrintOrders(prints);
      setShopOrders(shops);
      setInvoiceCompanyName(profile.invoiceCompanyName ?? '');
      setInvoiceTaxId(profile.invoiceTaxId ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      if (mode === 'register') await onRegister(email, password);
      else await onLogin(email, password);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Не удалось войти');
    }
  }

  async function handleSaveInvoice() {
    if (!session) return;
    await updateInvoiceDetails(
      session.sessionToken,
      invoiceCompanyName || null,
      invoiceTaxId || null,
    );
    setSavedNote(true);
    setTimeout(() => setSavedNote(false), 2000);
  }

  if (!session) {
    return (
      <section className="shop-view" id="view-orders">
        <div className="shop-login-card">
          <h1>Вход в личный кабинет</h1>
          <div className="shop-mode-toggle">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              Войти
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Регистрация
            </button>
          </div>
          {authError && <p className="shop-error">{authError}</p>}
          <form onSubmit={handleAuthSubmit}>
            <input
              type="email"
              id="orders-login-email"
              className="shop-input"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              id="orders-login-password"
              className="shop-input"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <button type="submit" className="shop-btn shop-btn-primary" id="orders-login-submit">
              {mode === 'register' ? 'Создать аккаунт' : 'Войти'}
            </button>
          </form>
        </div>
      </section>
    );
  }

  const hasOrders = printOrders.length > 0 || shopOrders.length > 0;

  return (
    <section className="shop-view" id="view-orders">
      <div className="shop-view-header">
        <h1>Мои заказы</h1>
      </div>

      {!hasOrders ? (
        <p className="shop-empty-note">Заказов пока нет.</p>
      ) : (
        <>
          {printOrders.length > 0 && (
            <div className="shop-cart-section">
              <div className="shop-cart-section-head">Печать</div>
              {printOrders.map((order) => (
                <div className="shop-order-row" id={`orders-print-${order.id}`} key={order.id}>
                  <span>
                    {order.fileName} × {order.quantity}
                  </span>
                  <span className="shop-order-status">
                    {PRINT_STATUS_LABEL[order.status] ?? order.status}
                  </span>
                  <span>{formatPrice(order.unitPriceCents * order.quantity)}</span>
                </div>
              ))}
            </div>
          )}

          {shopOrders.length > 0 && (
            <div className="shop-cart-section">
              <div className="shop-cart-section-head">Магазин</div>
              {shopOrders.map((order) => (
                <div className="shop-order-group" id={`orders-shop-${order.id}`} key={order.id}>
                  <div className="shop-order-row">
                    <span>Заказ №{order.id.slice(0, 8)}</span>
                    <span className="shop-order-status">
                      {SHOP_STATUS_LABEL[order.status] ?? order.status}
                    </span>
                  </div>
                  {order.items.map((item, index) => (
                    <div className="shop-order-item-row" key={index}>
                      <span>
                        {item.productName} × {item.quantity}
                      </span>
                      <span>{formatPrice(item.unitPriceCents * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="shop-cart-section" id="orders-invoice-settings">
        <div className="shop-cart-section-head">Реквизиты для счёта</div>
        <div className="shop-invoice-fields">
          <input
            type="text"
            id="orders-invoice-company"
            className="shop-input"
            placeholder="Название компании"
            value={invoiceCompanyName}
            onChange={(e) => setInvoiceCompanyName(e.target.value)}
          />
          <input
            type="text"
            id="orders-invoice-tax-id"
            className="shop-input"
            placeholder="Налоговый номер"
            value={invoiceTaxId}
            onChange={(e) => setInvoiceTaxId(e.target.value)}
          />
          <button
            type="button"
            className="shop-btn shop-btn-ghost"
            id="orders-invoice-save"
            onClick={handleSaveInvoice}
          >
            {savedNote ? 'Сохранено ✓' : 'Сохранить'}
          </button>
        </div>
      </div>
    </section>
  );
}
