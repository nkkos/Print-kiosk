import { useEffect, useState } from 'react';
import { listProducts, type Product } from '../services/shopApi';
import { formatPrice } from '../formatPrice';

interface ProductScreenProps {
  productId: string;
  onAddToCart: (productId: string, quantity: number) => void;
  onBack: () => void;
  onGoToCart: () => void;
}

// Fetches the whole catalog rather than a single-product endpoint — the catalog is
// small (docs/shop-requirements.md) and CatalogScreen already needs the full list, so
// this avoids introducing a second shape of the same data just for one screen.
export function ProductScreen({ productId, onAddToCart, onBack, onGoToCart }: ProductScreenProps) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listProducts().then((rows) => {
      if (!cancelled) setProducts(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const product = products?.find((row) => row.id === productId);

  if (!products) {
    return (
      <section className="shop-view">
        <p className="shop-empty-note">Загрузка…</p>
      </section>
    );
  }
  if (!product) {
    return (
      <section className="shop-view">
        <p className="shop-empty-note">Товар не найден.</p>
        <button type="button" className="shop-btn shop-btn-ghost" onClick={onBack}>
          ← Назад в каталог
        </button>
      </section>
    );
  }

  return (
    <section className="shop-view" id="view-product">
      <button type="button" className="shop-back-link" id="product-back" onClick={onBack}>
        ← Назад в каталог
      </button>
      <div className="shop-product-detail">
        {product.imageUrl && <img src={product.imageUrl} alt={product.name} />}
        <div className="shop-product-detail-body">
          <h1>{product.name}</h1>
          {product.description && <p className="shop-product-description">{product.description}</p>}
          <p className="shop-product-price-large">{formatPrice(product.priceCents)}</p>

          <div className="shop-stepper">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Меньше"
            >
              –
            </button>
            <span className="shop-stepper-value" id="product-quantity-value">
              {quantity}
            </span>
            <button type="button" onClick={() => setQuantity((q) => q + 1)} aria-label="Больше">
              +
            </button>
          </div>

          {!added ? (
            <button
              type="button"
              className="shop-btn shop-btn-primary"
              id="product-add-to-cart"
              onClick={() => {
                onAddToCart(product.id, quantity);
                setAdded(true);
              }}
            >
              Добавить в корзину
            </button>
          ) : (
            <div className="shop-added-confirmation" id="product-added-confirmation">
              <p>Добавлено в корзину.</p>
              <div className="shop-hero-actions">
                <button type="button" className="shop-btn shop-btn-primary" onClick={onGoToCart}>
                  Перейти в корзину
                </button>
                <button type="button" className="shop-btn shop-btn-ghost" onClick={onBack}>
                  Продолжить покупки
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
