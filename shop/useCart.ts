import { useState, useEffect } from 'react';

// The shop's own cart is just catalog items (productId -> quantity) — pending print
// orders (the other half of a checkout, docs/shop-checkout-requirements.md) live
// server-side already as 'created' printOrders rows, fetched separately, not
// duplicated into this local state. No server round trip needed for a plain
// quantity change here, unlike a real order — nothing is paid for yet.
const STORAGE_KEY = 'print-kiosk-shop.cart';

type CartState = Record<string, number>;

function loadCart(): CartState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartState) : {};
  } catch {
    return {};
  }
}

export function useCart() {
  const [items, setItems] = useState<CartState>(() => loadCart());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  function addItem(productId: string, quantity = 1): void {
    setItems((prev) => ({ ...prev, [productId]: (prev[productId] ?? 0) + quantity }));
  }

  function setQuantity(productId: string, quantity: number): void {
    setItems((prev) => {
      if (quantity < 1) {
        const { [productId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: quantity };
    });
  }

  function removeItem(productId: string): void {
    setItems((prev) => {
      const { [productId]: _removed, ...rest } = prev;
      return rest;
    });
  }

  function clear(): void {
    setItems({});
  }

  const totalCount = Object.values(items).reduce((sum, qty) => sum + qty, 0);

  return { items, addItem, setQuantity, removeItem, clear, totalCount };
}
