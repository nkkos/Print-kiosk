import type { EndSessionReason } from '../types/kiosk';

// Tells the backend a Kiosk Session has ended so it can delete the
// session's uploaded files and mark it closed (server/sessionCleanup.ts,
// docs/data-privacy-requirements.md). Callers treat any failure (network,
// timeout, non-2xx) the same way: log and proceed anyway — the TTL sweep is
// the confirmed fallback for a signal that never arrives, and a cleanup
// failure is never shown to the user (docs/domain/kiosk-session.md,
// "Privacy guarantee").
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export async function endSession(
  sessionId: string,
  reason: EndSessionReason,
  accountId: string | null,
): Promise<void> {
  await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, accountId }),
    signal: AbortSignal.timeout(5000),
  });
}
