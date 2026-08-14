// Talks to the dev-only Copy backend (server/) — see
// docs/copy-upload-requirements.md, docs/screens/copy-spec.md. Mirrors
// src/services/scanApi.ts's shape (same architecture, reused).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export interface CopyPage {
  id: string;
  pageNumber: number;
  status: 'processing' | 'ready' | 'failed';
}

export interface CopySession {
  id: string;
  sessionId: string;
  resultFileId: string | null;
  /** Set alongside resultFileId once finished — the real per-page rows are
   * deleted at that point (server/copyStore.ts), so this is the only
   * surviving page count for the "Document ready (N pages)" status. */
  resultPageCount: number | null;
  pages: CopyPage[];
}

export async function createCopySession(sessionId: string): Promise<{ id: string }> {
  const response = await fetch(`${API_BASE_URL}/api/copy-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  return response.json();
}

export async function getCopySession(id: string): Promise<CopySession> {
  const response = await fetch(`${API_BASE_URL}/api/copy-sessions/${id}`);
  return response.json();
}
