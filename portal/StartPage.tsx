import { usePortalSession } from './useSession';
import { PortalShell } from './PortalShell';
import { LoginForm } from './LoginForm';

// The portal's landing screen after login (docs/screens/portal-personal-account-spec.md,
// "Start screen") — reached immediately on successful login from any shell
// page's own login form. The content/promo block ships empty for this pass
// — no content is confirmed for it (see that spec's "Content/promo block —
// open item").
export function StartPage() {
  const { session, login, logout } = usePortalSession();

  if (!session) {
    return (
      <LoginForm
        onLogin={async (email, password) => {
          await login(email, password);
          window.location.href = './start.html';
        }}
      />
    );
  }

  return (
    <PortalShell email={session.email} active={null} onLogout={logout}>
      <div className="promoBlock" />
    </PortalShell>
  );
}
