import { useEffect, useMemo, useState } from 'react';
import { listProducts, type Product } from '../services/shopApi';
import { formatPrice } from '../formatPrice';

interface CatalogScreenProps {
  onSelectProduct: (productId: string) => void;
}

type SortOrder = 'default' | 'price-asc' | 'price-desc';

export function CatalogScreen({ onSelectProduct }: CatalogScreenProps) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOrder>('default');

  useEffect(() => {
    let cancelled = false;
    listProducts()
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load catalog');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    if (!products) return [];
    return Array.from(new Set(products.map((product) => product.category)));
  }, [products]);

  const visibleProducts = useMemo(() => {
    let rows = products ?? [];
    if (category !== 'all') rows = rows.filter((product) => product.category === category);
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      rows = rows.filter((product) => product.name.toLowerCase().includes(query));
    }
    if (sort === 'price-asc') rows = [...rows].sort((a, b) => a.priceCents - b.priceCents);
    if (sort === 'price-desc') rows = [...rows].sort((a, b) => b.priceCents - a.priceCents);
    return rows;
  }, [products, category, search, sort]);

  return (
    <section className="shop-view" id="view-catalog">
      <div className="shop-view-header">
        <h1>Каталог</h1>
        <p>Сувениры и подарки — печать документов оформляется в личном кабинете.</p>
      </div>

      {error && <p className="shop-error">{error}</p>}

      <div className="shop-filters" id="catalog-filters">
        <input
          type="text"
          id="catalog-search"
          className="shop-input"
          placeholder="Поиск по названию…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="shop-filter-chips" id="catalog-category-filter">
          <button
            type="button"
            className={`shop-chip${category === 'all' ? ' active' : ''}`}
            onClick={() => setCategory('all')}
          >
            Все
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`shop-chip${category === cat ? ' active' : ''}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        <select
          id="catalog-sort"
          className="shop-input"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOrder)}
        >
          <option value="default">По умолчанию</option>
          <option value="price-asc">Сначала дешевле</option>
          <option value="price-desc">Сначала дороже</option>
        </select>
      </div>

      {!products ? (
        <p className="shop-empty-note">Загрузка…</p>
      ) : visibleProducts.length === 0 ? (
        <p className="shop-empty-note">Ничего не найдено — попробуйте другой фильтр.</p>
      ) : (
        <div className="shop-product-grid" id="catalog-grid">
          {visibleProducts.map((product) => (
            <button
              type="button"
              className="shop-product-card"
              id={`catalog-product-${product.id}`}
              key={product.id}
              onClick={() => onSelectProduct(product.id)}
            >
              {product.imageUrl && <img src={product.imageUrl} alt={product.name} />}
              <div className="shop-product-card-body">
                <span className="shop-product-name">{product.name}</span>
                <span className="shop-product-price">{formatPrice(product.priceCents)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
