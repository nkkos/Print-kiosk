import { useEffect, useState } from 'react';
import {
  listProducts,
  createProduct,
  updateProduct,
  type Product,
  type ProductFormFields,
} from '../services/adminApi';
import type { AdminSession } from '../adminSession';

interface ShopCatalogScreenProps {
  session: AdminSession;
}

const EMPTY_FORM: ProductFormFields = {
  name: '',
  description: '',
  category: '',
  fulfillmentType: 'staff-fulfilled',
  priceCents: 0,
  variantLabel: '',
  imageUrl: '',
};

function centsToEuroInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
function euroInputToCents(value: string): number {
  return Math.round(parseFloat(value || '0') * 100);
}

// Shop catalog management (docs/shop-requirements.md's "Back office / admin" —
// confirmed 2026-08-25: a real form here, not a script-only workaround, since the
// catalog is small enough not to need a full inventory system).
export function ShopCatalogScreen({ session }: ShopCatalogScreenProps) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormFields>(EMPTY_FORM);
  const [priceInput, setPriceInput] = useState('0.00');
  const [saving, setSaving] = useState(false);

  function reload() {
    listProducts(session.sessionToken)
      .then(setProducts)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }

  useEffect(reload, [session.sessionToken]);

  function startEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description ?? '',
      category: product.category,
      fulfillmentType: product.fulfillmentType,
      priceCents: product.priceCents,
      variantLabel: product.variantLabel ?? '',
      imageUrl: product.imageUrl ?? '',
    });
    setPriceInput(centsToEuroInput(product.priceCents));
  }

  function startNew() {
    setEditingId('new');
    setForm(EMPTY_FORM);
    setPriceInput('0.00');
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const fields: ProductFormFields = { ...form, priceCents: euroInputToCents(priceInput) };
    try {
      if (editingId === 'new') {
        await createProduct(session.sessionToken, fields);
      } else if (editingId) {
        await updateProduct(session.sessionToken, editingId, fields);
      }
      cancelEdit();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    try {
      await updateProduct(session.sessionToken, product.id, { active: !product.active });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  const isEditing = editingId !== null;

  return (
    <section className="view" id="view-shop-catalog">
      <div className="view-header">
        <div>
          <h1 className="view-title">Каталог магазина</h1>
          <p className="view-sub">Товары для интернет-магазина (docs/shop-requirements.md)</p>
        </div>
        {!isEditing && (
          <button
            type="button"
            className="btn btn-primary"
            id="shop-catalog-new"
            onClick={startNew}
            style={{ width: 'auto' }}
          >
            + Новый товар
          </button>
        )}
      </div>

      {error && <p className="login-error">{error}</p>}

      {isEditing && (
        <form className="calc" onSubmit={handleSave} style={{ marginBottom: '1.5rem' }}>
          <div className="calc-form">
            <input
              type="text"
              className="admin-input"
              placeholder="Название"
              id="shop-catalog-form-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              type="text"
              className="admin-input"
              placeholder="Описание"
              id="shop-catalog-form-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <input
              type="text"
              className="admin-input"
              placeholder="Категория (например, souvenir, gifts)"
              id="shop-catalog-form-category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              required
            />
            <select
              className="admin-input"
              id="shop-catalog-form-fulfillment-type"
              value={form.fulfillmentType}
              onChange={(e) =>
                setForm({
                  ...form,
                  fulfillmentType: e.target.value as ProductFormFields['fulfillmentType'],
                })
              }
            >
              <option value="staff-fulfilled">Делаем сами (staff-fulfilled)</option>
              <option value="self-service">Самообслуживание (self-service)</option>
            </select>
            <input
              type="text"
              className="admin-input"
              placeholder="Цена, €"
              id="shop-catalog-form-price"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              required
            />
            <input
              type="text"
              className="admin-input"
              placeholder="Вариант (необязательно)"
              id="shop-catalog-form-variant"
              value={form.variantLabel}
              onChange={(e) => setForm({ ...form, variantLabel: e.target.value })}
            />
            <input
              type="text"
              className="admin-input"
              placeholder="Ссылка на картинку"
              id="shop-catalog-form-image"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            />
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button
                type="submit"
                className="btn btn-primary"
                id="shop-catalog-form-save"
                disabled={saving}
              >
                {saving ? 'Сохраняем…' : editingId === 'new' ? 'Добавить' : 'Сохранить'}
              </button>
              <button type="button" className="btn" onClick={cancelEdit}>
                Отмена
              </button>
            </div>
          </div>
        </form>
      )}

      {!products ? (
        <p className="empty-note">Загрузка…</p>
      ) : (
        <div className="incident-feed" id="shop-catalog-list">
          {products.map((product) => (
            <div className="incident-row incident-row-static" key={product.id}>
              <span className="incident-time" style={{ width: 'auto' }}>
                {product.category}
              </span>
              <span className="incident-code">{product.name}</span>
              <span className="incident-target">{(product.priceCents / 100).toFixed(2)} €</span>
              <span className="incident-target">{product.active ? 'активен' : 'скрыт'}</span>
              <button
                type="button"
                className="filter-reset"
                id={`shop-catalog-edit-${product.id}`}
                onClick={() => startEdit(product)}
              >
                Изменить
              </button>
              <button
                type="button"
                className="filter-reset"
                id={`shop-catalog-toggle-${product.id}`}
                onClick={() => toggleActive(product)}
              >
                {product.active ? 'Скрыть' : 'Показать'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
