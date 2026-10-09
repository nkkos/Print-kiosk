import { standHeaders } from './standAuth';

// The stand's minutely "I'm alive" (server/standMonitor.ts) — a frozen
// browser or a dead stand stops sending it, and the backend raises pc.dead.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

// The reload this page was started by (reloadForStaff below), reported back
// with the next heartbeat so the backend can clear the request.
const HANDLED_RELOAD_STORAGE_KEY = 'kioskHandledReload';

/** A reload staff asked for from the admin panel. */
export interface StandReloadRequest {
  id: string;
  force: boolean;
}

export async function sendStandHeartbeat(
  standId: string,
  screen: string,
): Promise<StandReloadRequest | null> {
  const handledReload = readHandledReload();
  const response = await fetch(`${API_BASE_URL}/api/stands/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...standHeaders() },
    body: JSON.stringify({ standId, screen, handledReload }),
  });
  if (!response.ok) return null;
  if (handledReload) writeHandledReload(null);
  if (response.status !== 200) return null;
  const data = (await response.json()) as { reload?: StandReloadRequest };
  return data.reload ?? null;
}

/** Reloads the page for a staff request, remembering which one it was. */
export function reloadForStaff(reloadId: string): void {
  writeHandledReload(reloadId);
  window.location.reload();
}

function readHandledReload(): string | null {
  try {
    return localStorage.getItem(HANDLED_RELOAD_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeHandledReload(value: string | null): void {
  try {
    if (value) localStorage.setItem(HANDLED_RELOAD_STORAGE_KEY, value);
    else localStorage.removeItem(HANDLED_RELOAD_STORAGE_KEY);
  } catch {
    // Without storage the request is never cleared and the stand would
    // reload on every heartbeat — not a case for a kiosk profile, which
    // always has storage (the stand key lives there too).
  }
}
