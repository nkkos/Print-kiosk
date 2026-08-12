import type { ReceivedFile } from '../types/kiosk';

// Talks to the dev-only QR upload backend (server/) — see
// docs/qr-upload-requirements.md. VITE_API_BASE_URL lets this point
// elsewhere later; defaults to the backend's own default port.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export async function getUploadConfig(): Promise<{ lanUploadUrl: string; portalUrl: string }> {
  const response = await fetch(`${API_BASE_URL}/api/config`);
  return response.json();
}

export async function listQrFiles(sessionId: string): Promise<ReceivedFile[]> {
  const response = await fetch(`${API_BASE_URL}/api/qr-sessions/${sessionId}/files`);
  return response.json();
}
