// Talks to the real accounts backend (server/) — see
// docs/personal-account-requirements.md, "Kiosk-side login." Mirrors
// qrUploadApi.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export interface Account {
  id: string;
  username: string;
}

export async function login(username: string, password: string): Promise<Account> {
  const response = await fetch(`${API_BASE_URL}/api/accounts/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error('Incorrect username or password');
  }
  return response.json();
}
