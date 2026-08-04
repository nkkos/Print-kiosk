import type { ReceivedEmail } from '../types/kiosk';

// Talks to the dev-only Email upload backend (server/) — see
// docs/email-upload-requirements.md. Mirrors qrUploadApi.ts.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export async function listEmailMessages(prefix: string): Promise<ReceivedEmail[]> {
  const response = await fetch(`${API_BASE_URL}/api/email-sessions/${prefix}/messages`);
  return response.json();
}
