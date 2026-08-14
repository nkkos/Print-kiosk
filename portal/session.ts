import type { Account } from '../src/services/accountApi';

// The shared shell (docs/screens/portal-personal-account-spec.md) navigates
// between separate HTML pages (files.html, orders.html, account.html,
// start.html) with real page loads, not client-side routing — so the
// session token can no longer live only in React component state (the
// original design, "kept in memory only, never persisted") without forcing
// a re-login on every sidebar click. sessionStorage is the minimal fix: it
// survives navigation within the same tab but is still cleared on tab/window
// close and never sent over the network like a cookie would be — not the
// same as the "permanently persisted" case the original design was avoiding.
const STORAGE_KEY = 'print-kiosk-portal.session';

export interface PortalSession extends Account {
  sessionToken: string;
}

export function savePortalSession(session: PortalSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadPortalSession(): PortalSession | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PortalSession;
  } catch {
    return null;
  }
}

export function clearPortalSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
