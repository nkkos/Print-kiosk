// Same durability reasoning as admin/adminSession.ts: an employee keeps
// this page open across a work session, so localStorage (not
// sessionStorage) survives closing/reopening the tab.
const STORAGE_KEY = 'print-kiosk-business.session';

export interface BusinessSession {
  id: string;
  email: string;
  sessionToken: string;
}

export function saveBusinessSession(session: BusinessSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadBusinessSession(): BusinessSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BusinessSession;
  } catch {
    return null;
  }
}

export function clearBusinessSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
