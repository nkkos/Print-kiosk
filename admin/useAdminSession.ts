import { useEffect, useState } from 'react';
import { login as loginRequest, getMe } from './services/adminApi';
import {
  saveAdminSession,
  loadAdminSession,
  clearAdminSession,
  type AdminSession,
} from './adminSession';

// Mirrors portal/useSession.ts's shape (login/logout/session-loading), plus
// a one-time validation against GET /api/admin/me on mount — a stored
// session token could be expired (7-day expiry, server/adminRoutes.ts) or
// revoked, and every screen here immediately fetches real data with it, so
// silently trusting localStorage the way portal/useSession.ts does isn't
// enough on its own.
export function useAdminSession() {
  const [session, setSession] = useState<AdminSession | null>(() => loadAdminSession());
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    const stored = loadAdminSession();
    if (!stored) {
      setIsValidating(false);
      return;
    }
    let cancelled = false;
    getMe(stored.sessionToken)
      .then(() => {
        if (!cancelled) setIsValidating(false);
      })
      .catch(() => {
        if (cancelled) return;
        clearAdminSession();
        setSession(null);
        setIsValidating(false);
      });
    return () => {
      cancelled = true;
    };
    // Deliberately runs once, on mount only — re-validating on every
    // re-render would defeat the point of persisting the session at all.
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const account = await loginRequest(email, password);
    saveAdminSession(account);
    setSession(account);
  }

  function logout(): void {
    clearAdminSession();
    setSession(null);
  }

  return { session, isValidating, login, logout };
}
