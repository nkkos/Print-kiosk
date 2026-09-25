// Which physical kiosk stand this browser is (docs/pavilion-launch-checklist.md,
// "Target architecture") — two stands share one printer, and staff need to
// know which one a job came from. Each stand's browser is started on the
// kiosk URL with ?stand=A (or B); the value is remembered in localStorage so
// it survives navigation and reloads that drop the query string.
const STAND_ID_STORAGE_KEY = 'kioskStandId';
const STAND_ID_PATTERN = /^[A-Za-z0-9-]{1,16}$/;

export function getStandId(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('stand');
    if (fromUrl && STAND_ID_PATTERN.test(fromUrl)) {
      localStorage.setItem(STAND_ID_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return localStorage.getItem(STAND_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}
