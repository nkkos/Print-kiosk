// A corner label on every screen of the test environment (README.md,
// "Staging environment"), so nobody takes staging for the live kiosk, admin
// panel or portal. Asks the backend which environment it is (GET /api/config
// → appEnv, server/appEnv.ts) rather than trusting a build flag, so a
// frontend pointed at the staging backend is always marked. Plain DOM, no
// React: called once from every app's entry point, whatever its framework
// setup. Click-through and out of the way — it never covers anything a
// customer taps (docs/domain/kiosk-session.md's popup rules stay intact).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export function showEnvironmentBanner(): void {
  fetch(`${API_BASE_URL}/api/config`)
    .then((response) => (response.ok ? response.json() : null))
    .then((config: { appEnv?: string } | null) => {
      if (config?.appEnv !== 'staging' || document.getElementById('environment-banner')) return;
      const banner = document.createElement('div');
      banner.id = 'environment-banner';
      banner.textContent = 'ТЕСТОВАЯ СРЕДА · STAGING';
      banner.setAttribute('role', 'note');
      Object.assign(banner.style, {
        position: 'fixed',
        left: '0',
        bottom: '0',
        zIndex: '2147483647',
        padding: '4px 10px',
        background: '#b3261e',
        color: '#ffffff',
        font: '700 12px/1.4 system-ui, sans-serif',
        letterSpacing: '0.06em',
        borderTopRightRadius: '6px',
        pointerEvents: 'none',
        opacity: '0.9',
      });
      document.body.appendChild(banner);
    })
    .catch(() => {
      // No backend reachable — nothing to mark.
    });
}
