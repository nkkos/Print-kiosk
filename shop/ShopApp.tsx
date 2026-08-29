import { useState } from 'react';
import { useShopSession } from './useShopSession';
import { useCart } from './useCart';
import { ShopNav } from './ShopNav';
import { CatalogScreen } from './screens/CatalogScreen';
import { ProductScreen } from './screens/ProductScreen';
import { CartScreen } from './screens/CartScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { ConfirmationScreen } from './screens/ConfirmationScreen';
import { OrdersScreen } from './screens/OrdersScreen';
import type { CheckoutResult } from './services/shopApi';

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
