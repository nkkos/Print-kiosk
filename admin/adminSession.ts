import type { StaffAccount } from './services/adminApi';

// Unlike portal/session.ts's sessionStorage choice (that page navigates
// between separate HTML pages, and its own reasoning was specifically
// about not forcing a re-login on every page load within one visit), this
// admin console is a single page an operator keeps open across a whole
// shift — localStorage so closing/reopening a tab (or the browser
// crashing) doesn't force a re-login, same durability reasoning as the
// kiosk's own sessionId persistence (src/App.tsx).
const STORAGE_KEY = 'print-kiosk-admin.session';

export interface AdminSession extends StaffAccount {
  sessionToken: string;
}

export function saveAdminSession(session: AdminSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadAdminSession(): AdminSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function clearAdminSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
