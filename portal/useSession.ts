import { useState } from 'react';
import { login as loginRequest } from '../src/services/accountApi';
import {
  savePortalSession,
  loadPortalSession,
  clearPortalSession,
  type PortalSession,
} from './session';

// Shared by every shell page (Start/My files/My orders/Account information)
// — extracted once a fourth real consumer needed the identical
// login/logout/session-loading logic (docs/implementation/project-architecture.md,
// Section 9).
export function usePortalSession() {
  const [session, setSession] = useState<PortalSession | null>(() => loadPortalSession());

  async function login(email: string, password: string): Promise<void> {
    const account = await loginRequest(email, password);
    savePortalSession(account);
    setSession(account);
  }

  function logout(): void {
    clearPortalSession();
    setSession(null);
  }

  return { session, login, logout };
}
