// The kiosk stand's API key (server/security.ts, STAND_API_KEYS). Each
// stand's browser is started once on the kiosk URL with
// ?stand=A&key=<key>; the key is remembered in localStorage and removed from
// the address bar straight away, so it isn't left on screen or in history.
// Every request to a stand-only route sends it as X-Stand-Key. Absent (local
// dev, or keys not configured yet) → no header, and the backend doesn't ask.
const STAND_KEY_STORAGE_KEY = 'kioskStandKey';

let cachedKey: string | null | undefined;

export function getStandKey(): string | null {
  if (cachedKey !== undefined) return cachedKey;
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('key');
    if (fromUrl) {
      localStorage.setItem(STAND_KEY_STORAGE_KEY, fromUrl);
      url.searchParams.delete('key');
      window.history.replaceState(null, '', url.toString());
      cachedKey = fromUrl;
      return cachedKey;
    }
    cachedKey = localStorage.getItem(STAND_KEY_STORAGE_KEY);
  } catch {
    cachedKey = null;
  }
  return cachedKey;
}

/** Headers for a stand-only request — merge into fetch's `headers`. */
export function standHeaders(): Record<string, string> {
  const key = getStandKey();
  return key ? { 'X-Stand-Key': key } : {};
}

// A browser without a valid key (never opened its stand link, or the key
// was changed) gets "Unknown kiosk stand" from every stand-only route. The
// kiosk then shows a "temporarily unavailable" screen (src/App.tsx) instead
// of failing screen by screen — a blank page is what that looked like.
const STAND_REJECTED_ERROR = 'Unknown kiosk stand';
let standRejected = false;
const rejectionListeners = new Set<() => void>();

export function isStandRejected(): boolean {
  return standRejected;
}

/** Subscribes to the first rejection; returns the unsubscribe function. */
export function onStandRejected(listener: () => void): () => void {
  rejectionListeners.add(listener);
  return () => rejectionListeners.delete(listener);
}

/** Call with a stand-only route's response before using it. */
export async function noteStandResponse(response: Response): Promise<void> {
  if (response.status !== 401 || standRejected) return;
  const body = (await response
    .clone()
    .json()
    .catch(() => ({}))) as { error?: unknown };
  if (body.error !== STAND_REJECTED_ERROR) return;
  standRejected = true;
  rejectionListeners.forEach((listener) => listener());
}
