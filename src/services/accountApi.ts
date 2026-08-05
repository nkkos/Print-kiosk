// Talks to the real accounts backend (server/) — see
// docs/personal-account-requirements.md, "Kiosk-side login," and the portal
// (portal/) for registration/verification/reset. Shared by both the kiosk
// (only login/requestPasswordReset) and the portal (all of these).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export interface Account {
  id: string;
  email: string;
}

async function postJson<T>(path: string, body: unknown, sessionToken?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? 'Request failed');
  }
  return data as T;
}

// The kiosk ignores `sessionToken` — no session/change-password there today,
// only the portal's account page uses it (docs/personal-account-requirements.md).
export async function login(
  email: string,
  password: string,
): Promise<Account & { sessionToken: string }> {
  return postJson('/api/accounts/login', { email, password });
}

export async function register(email: string, password: string): Promise<Account> {
  return postJson('/api/accounts/register', { email, password });
}

export async function verifyEmail(token: string): Promise<void> {
  await postJson('/api/accounts/verify-email', { token });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await postJson('/api/accounts/request-password-reset', { email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await postJson('/api/accounts/reset-password', { token, newPassword });
}

export async function changePassword(
  sessionToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await postJson('/api/accounts/change-password', { currentPassword, newPassword }, sessionToken);
}
