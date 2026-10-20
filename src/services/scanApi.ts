import { standHeaders } from './standAuth';

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
    headers: { 'Content-Type': 'application/json', ...standHeaders() },
    body: JSON.stringify({ sessionId }),
  });
  return response.json();
}

/** "Print this scan" — a copy of the delivered PDF joins the Kiosk
 * Session's files (server/scanStore.ts, addScanForPrinting). */
export async function printScan(id: string): Promise<{ fileId: string }> {
  const response = await fetch(`${API_BASE_URL}/api/scan-sessions/${id}/print`, {
    method: 'POST',
    headers: standHeaders(),
  });
  if (!response.ok) throw new Error(`Print scan failed: HTTP ${response.status}`);
  return response.json();
}

export async function getScanSession(id: string): Promise<ScanSession> {
  const response = await fetch(`${API_BASE_URL}/api/scan-sessions/${id}`, {
    headers: standHeaders(),
  });
  return response.json();
}
