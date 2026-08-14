// Talks to the dev-only Phone-Camera Scan backend (server/) — see
// docs/scan-upload-requirements.md, docs/screens/scan-spec.md. Mirrors
// src/services/qrUploadApi.ts's shape (same architecture, reused).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export interface ScanPage {
  id: string;
  pageNumber: number;
  status: 'processing' | 'ready' | 'failed';
}

export interface ScanSession {
  id: string;
  deliveryMethods: string[] | null;
  deliveredToEmail: string | null;
  accountFileId: string | null;
  deliveredAt: string | null;
  pages: ScanPage[];
}

export async function createScanSession(sessionId: string): Promise<{ id: string }> {
  const response = await fetch(`${API_BASE_URL}/api/scan-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  return response.json();
}

export async function getScanSession(id: string): Promise<ScanSession> {
  const response = await fetch(`${API_BASE_URL}/api/scan-sessions/${id}`);
  return response.json();
}
