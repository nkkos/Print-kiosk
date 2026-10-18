// Whether the pavilion is open and when that changes (server/pavilionDoor.ts,
// GET /api/pavilion-hours) — the stands warn before closing and stop
// starting new orders just before (docs/pavilion-security-requirements.md,
// "Closing sequence").
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export type PavilionHours =
  | { enforced: false }
  | {
      enforced: true;
      mode: 'open' | 'closed';
      changesAt: string | null;
      closureReason: string | null;
      serverTime: string;
    };

/** Null when the backend can't be reached — the stand then keeps whatever
 * it knew last rather than closing itself over a failed request. */
export async function fetchPavilionHours(): Promise<PavilionHours | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/pavilion-hours`);
    if (!response.ok) return null;
    return (await response.json()) as PavilionHours;
  } catch {
    return null;
  }
}
