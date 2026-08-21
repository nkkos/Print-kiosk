import { useState } from 'react';
import { useAdminSession } from './useAdminSession';
import { LoginScreen } from './LoginScreen';
import { AdminShell, type AdminScreen } from './AdminShell';
import { OverviewScreen } from './screens/OverviewScreen';

// Composition root — same "no router yet" pattern as src/App.tsx (a plain
// Screen union + useState), appropriate here for the same reason: five
// screens total, no genuine need for URL-addressable routing yet
// (docs/implementation/project-architecture.md's own reasoning, reused
// rather than reinvented for this second app in the same repo).
export function AdminApp() {
  const { session, isValidating, login, logout } = useAdminSession();
  const [screen, setScreen] = useState<AdminScreen>('overview');

  if (isValidating) {
    return <div className="login-wrap">Загрузка…</div>;
  }

  if (!session) {
    return <LoginScreen onLogin={login} />;
  }

  return (
    <div className="app">
      <AdminShell session={session} screen={screen} onNavigate={setScreen} onLogout={logout} />
      {screen === 'overview' && <OverviewScreen session={session} />}
    </div>
  );
}
