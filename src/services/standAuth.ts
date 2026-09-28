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
