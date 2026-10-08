import { standHeaders } from './standAuth';

// The stand's minutely "I'm alive" (server/standMonitor.ts) — a frozen
// browser or a dead stand stops sending it, and the backend raises pc.dead.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export async function sendStandHeartbeat(standId: string, screen: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/stands/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...standHeaders() },
    body: JSON.stringify({ standId, screen }),
  });
}
