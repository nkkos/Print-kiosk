import { useEffect, useState } from 'react';
import { listProducts, listPrintOrders, type Product, type PrintOrder } from '../services/shopApi';
import { formatPrice } from '../formatPrice';
import type { ShopSession } from '../shopSession';

interface CartScreenProps {
  session: ShopSession | null;
  cartItems: Record<string, number>;
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onProceedToCheckout: () => void;
  onGoToCatalog: () => void;
}

// Pending print orders (docs/shop-checkout-requirements.md) already exist as
// 'created'-status printOrders rows from the account's own file upload/configure flow
// (portal/FilesPage.tsx) — this screen surfaces them alongside shop items for one
// combined checkout, it doesn't let you configure a new one (that stays on the portal).
export function CartScreen({
  session,
  cartItems,
  onSetQuantity,
  onRemove,
  onProceedToCheckout,
  onGoToCatalog,
}: CartScreenProps) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [pendingPrintOrders, setPendingPrintOrders] = useState<PrintOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProducts()
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load cart');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setPendingPrintOrders([]);
      return;
    }
    let cancelled = false;
    listPrintOrders(session.sessionToken)
      .then((rows) => {
        if (!cancelled) setPendingPrintOrders(rows.filter((row) => row.status === 'created'));
      })
      .catch(() => {
        // Non-critical — the cart still works for shop items alone.
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const productIds = Object.keys(cartItems);
  const cartRows = (products ?? [])
    .filter((product) => productIds.includes(product.id))
    .map((product) => ({ product, quantity: cartItems[product.id] }));

  const shopTotalCents = cartRows.reduce(
    (sum, row) => sum + row.product.priceCents * row.quantity,
    0,
  );
  const printTotalCents = pendingPrintOrders.reduce(
    (sum, order) => sum + order.unitPriceCents * order.quantity,
    0,
  );
  const isEmpty = cartRows.length === 0 && pendingPrintOrders.length === 0;

  return (
    <section className="shop-view" id="view-cart">
      <div className="shop-view-header">
        <h1>Корзина</h1>
      </div>

      {error && <p className="shop-error">{error}</p>}

      {isEmpty ? (
        <div className="shop-empty-note">
          <p>Корзина пуста.</p>
          <button type="button" className="shop-btn shop-btn-primary" onClick={onGoToCatalog}>
            В каталог
          </button>
        </div>
      ) : (
        <>
          {cartRows.length > 0 && (
            <div className="shop-cart-section">
              <div className="shop-cart-section-head">Товары</div>
              {cartRows.map(({ product, quantity }) => (
                <div className="shop-cart-row" id={`cart-item-${product.id}`} key={product.id}>
                  {product.imageUrl && <img src={product.imageUrl} alt={product.name} />}
                  <span className="shop-cart-row-name">{product.name}</span>
                  <div className="shop-stepper">
                    <button
                      type="button"
                      onClick={() => onSetQuantity(product.id, quantity - 1)}
                      aria-label="Меньше"
                    >
                      –
                    </button>
                    <span className="shop-stepper-value">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => onSetQuantity(product.id, quantity + 1)}
                      aria-label="Больше"
                    >
                      +
                    </button>
                  </div>
                  <span className="shop-cart-row-price">
                    {formatPrice(product.priceCents * quantity)}
                  </span>
                  <button
                    type="button"
                    className="shop-remove-link"
                    onClick={() => onRemove(product.id)}
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          )}

          {pendingPrintOrders.length > 0 && (
            <div className="shop-cart-section">
              <div className="shop-cart-section-head">Печать (готовится сразу)</div>
              {pendingPrintOrders.map((order) => (
                <div className="shop-cart-row" id={`cart-print-order-${order.id}`} key={order.id}>
                  <span className="shop-cart-row-name">
                    {order.fileName} × {order.quantity}
                  </span>
                  <span className="shop-cart-row-price">
                    {formatPrice(order.unitPriceCents * order.quantity)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="shop-cart-total" id="cart-total">
            <span>Итого</span>
            <span>{formatPrice(shopTotalCents + printTotalCents)}</span>
          </div>

          <button
            type="button"
            className="shop-btn shop-btn-primary"
            id="cart-checkout-button"
            onClick={onProceedToCheckout}
          >
            Оформить заказ
          </button>
        </>
      )}
    </section>
  );
}
