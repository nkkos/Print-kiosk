import type { Account } from '../src/services/accountApi';

// Unlike portal/session.ts's sessionStorage (chosen there for single-sitting file
// management), the shop is a storefront a customer returns to across separate visits
// over days/weeks — localStorage matches that expectation (stay signed in), the same
// reasoning admin/adminSession.ts already used for its own, unrelated reason.
const STORAGE_KEY = 'print-kiosk-shop.session';

export interface ShopSession extends Account {
  sessionToken: string;
}

export function saveShopSession(session: ShopSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadShopSession(): ShopSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ShopSession;
  } catch {
    return null;
  }
}

export function clearShopSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
