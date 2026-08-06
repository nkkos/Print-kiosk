import type { EndSessionReason } from '../types/kiosk';

// Talks to the kiosk_sessions lifecycle backend (server/sessionLifecycle.ts,
// docs/data-privacy-requirements.md). Callers treat any failure (network,
// timeout, non-2xx) the same way: log and proceed anyway — none of these
// calls block the user, and a cleanup failure is never shown to them
// (docs/domain/kiosk-session.md, "Privacy guarantee").
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

// Fired once, when a session is actually created (src/App.tsx's Trigger A/B)
// — so kiosk_sessions' started_at/started_via are real, not just a byproduct
// of whenever the session happens to end.
export async function startSession(
  sessionId: string,
  accountId: string | null,
  startedVia: string,
): Promise<void> {
  await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, startedVia }),
    signal: AbortSignal.timeout(5000),
  });
}

// Bumps last_activity_at — called on a mid-session login (to also record the
// account) and, throttled, on real user activity (src/App.tsx).
export async function touchSessionActivity(
  sessionId: string,
  accountId: string | null,
): Promise<void> {
  await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId }),
    signal: AbortSignal.timeout(5000),
  });
}

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
