import { useEffect, useState } from 'react';
import { useShopSession } from './useShopSession';
import { useCart } from './useCart';
import { ShopNav } from './ShopNav';
import { CatalogScreen } from './screens/CatalogScreen';
import { ProductScreen } from './screens/ProductScreen';
import { CartScreen } from './screens/CartScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { ConfirmationScreen } from './screens/ConfirmationScreen';
import { OrdersScreen } from './screens/OrdersScreen';
import { waitForOnlinePayment, type CheckoutResult } from './services/shopApi';

export type ShopScreen = 'catalog' | 'product' | 'cart' | 'checkout' | 'confirmation' | 'orders';

// Composition root — same "no router yet" Screen-union pattern as src/App.tsx and
// admin/AdminApp.tsx, appropriate here for the same reason (docs/implementation/
// project-architecture.md): a handful of screens, no genuine need for
// URL-addressable routing yet.
export function ShopApp() {
  const { session, login, register, logout } = useShopSession();
  const cart = useCart();
  const [screen, setScreen] = useState<ShopScreen>('catalog');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);

  function selectProduct(productId: string) {
    setSelectedProductId(productId);
    setScreen('product');
  }

  // Back from the payment page (server/routes.ts's GET /payments/return adds
  // ?payment=<id>): wait for the server to confirm it with the provider.
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  useEffect(() => {
    const paymentId = new URLSearchParams(window.location.search).get('payment');
    if (!paymentId || !session) return;
    window.history.replaceState(null, '', window.location.pathname);
    setPaymentNotice('Проверяем оплату…');
    waitForOnlinePayment(session.sessionToken, paymentId)
      .then((payment) => {
        if (payment.status === 'paid' && payment.result) {
          setPaymentNotice(null);
          handleCheckoutComplete(payment.result);
        } else {
          setPaymentNotice(
            payment.status === 'awaiting-payment'
              ? 'Оплата ещё подтверждается — заказ появится в «Моих заказах», как только она пройдёт.'
              : 'Оплата не прошла, деньги не списаны. Можно попробовать ещё раз.',
          );
          setScreen('cart');
        }
      })
      .catch(() => setPaymentNotice(null));
    // Runs once the session is known; the payment id is read from the URL once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionToken]);

  function handleCheckoutComplete(result: CheckoutResult) {
    cart.clear();
    setCheckoutResult(result);
    setScreen('confirmation');
  }

  return (
    <div className="shop-app">
      <ShopNav
        screen={screen}
        onNavigate={setScreen}
        cartCount={cart.totalCount}
        session={session}
        onLogout={() => {
          logout();
          setScreen('catalog');
        }}
      />
      <div className="shop-content">
        {paymentNotice && (
          <p className="shop-error" id="shop-payment-notice">
            {paymentNotice}
          </p>
        )}
        {screen === 'catalog' && <CatalogScreen onSelectProduct={selectProduct} />}
        {screen === 'product' && selectedProductId && (
          <ProductScreen
            productId={selectedProductId}
            onAddToCart={cart.addItem}
            onBack={() => setScreen('catalog')}
            onGoToCart={() => setScreen('cart')}
          />
        )}
        {screen === 'cart' && (
          <CartScreen
            session={session}
            cartItems={cart.items}
            onSetQuantity={cart.setQuantity}
            onRemove={cart.removeItem}
            onProceedToCheckout={() => setScreen('checkout')}
            onGoToCatalog={() => setScreen('catalog')}
          />
        )}
        {screen === 'checkout' && (
          <CheckoutScreen
            session={session}
            cartItems={cart.items}
            onLogin={login}
            onRegister={register}
            onComplete={handleCheckoutComplete}
          />
        )}
        {screen === 'confirmation' && checkoutResult && (
          <ConfirmationScreen
            result={checkoutResult}
            onGoToOrders={() => setScreen('orders')}
            onGoToCatalog={() => setScreen('catalog')}
          />
        )}
        {screen === 'orders' && (
          <OrdersScreen session={session} onLogin={login} onRegister={register} />
        )}
      </div>
    </div>
  );
}
