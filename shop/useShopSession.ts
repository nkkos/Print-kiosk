import { useState } from 'react';
import { login as loginRequest, register as registerRequest } from '../src/services/accountApi';
import {
  saveShopSession,
  loadShopSession,
  clearShopSession,
  type ShopSession,
} from './shopSession';

// Deliberately no mount-time re-validation against the backend (unlike
// admin/useAdminSession.ts) — a stale/expired shop session just fails the next real
// request (checkout, order history) with a normal 401, which the calling screen
// already has to handle anyway; re-validating on every load would cost a round trip
// for the common case of a perfectly valid session.
export function useShopSession() {
  const [session, setSession] = useState<ShopSession | null>(() => loadShopSession());

  async function login(email: string, password: string): Promise<void> {
    const account = await loginRequest(email, password);
    saveShopSession(account);
    setSession(account);
  }

  /** Registers a brand-new account, then immediately logs in — login doesn't
   * require a verified email (docs/personal-account-requirements.md's existing
   * behavior), so the customer gets a working session right away; the shop
   * checkout's own email-verification gate (docs/shop-checkout-requirements.md)
   * is what actually blocks payment until they verify. */
  async function register(email: string, password: string): Promise<void> {
    await registerRequest(email, password);
    await login(email, password);
  }

  function logout(): void {
    clearShopSession();
    setSession(null);
  }

  return { session, login, register, logout };
}
