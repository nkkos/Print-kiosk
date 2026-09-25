// Whether the pavilion printer can take a job right now — the cloud answers
// from the print agent's latest health report (server/agentRoutes.ts,
// GET /api/printer-status). Always available in local dev (direct mode).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

/** False only when the backend positively says the printer can't print (agent
 * offline, jam, empty tray, ...). A failed request counts as available: the
 * cart shouldn't lock up over a status check when the backend itself is
 * what's unreachable — the connection-lost notification covers that. */
export async function isPrinterAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/printer-status`);
    if (!response.ok) return true;
    const { available } = (await response.json()) as { available?: unknown };
    return available !== false;
  } catch {
    return true;
  }
}
