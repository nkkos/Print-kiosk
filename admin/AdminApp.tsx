import { useState } from 'react';
import { useAdminSession } from './useAdminSession';
import { LoginScreen } from './LoginScreen';
import { AdminShell, type AdminScreen } from './AdminShell';
import { OverviewScreen } from './screens/OverviewScreen';
import { EquipmentDetailScreen } from './screens/EquipmentDetailScreen';
import { IncidentLogScreen } from './screens/IncidentLogScreen';
import { AlertsScreen } from './screens/AlertsScreen';

// Composition root — same "no router yet" pattern as src/App.tsx (a plain
// Screen union + useState), appropriate here for the same reason: five
// screens total, no genuine need for URL-addressable routing yet
// (docs/implementation/project-architecture.md's own reasoning, reused
// rather than reinvented for this second app in the same repo).
export function AdminApp() {
  const { session, isValidating, login, logout } = useAdminSession();
  const [screen, setScreen] = useState<AdminScreen>('overview');
  const [equipmentSource, setEquipmentSource] = useState<string | null>(null);

  if (isValidating) {
    return <div className="login-wrap">Загрузка…</div>;
  }

  if (!session) {
    return <LoginScreen onLogin={login} />;
  }

  function selectSource(source: string) {
    setEquipmentSource(source);
    setScreen('equipment-detail');
  }

  return (
    <div className="app">
      <AdminShell session={session} screen={screen} onNavigate={setScreen} onLogout={logout} />
      {screen === 'overview' && <OverviewScreen session={session} onSelectSource={selectSource} />}
      {screen === 'incident-log' && (
        <IncidentLogScreen session={session} onSelectSource={selectSource} />
      )}
      {screen === 'alerts' && <AlertsScreen session={session} />}
      {screen === 'equipment-detail' && equipmentSource && (
        <EquipmentDetailScreen
          session={session}
          source={equipmentSource}
          onBack={() => setScreen('overview')}
        />
      )}
    </div>
  );
}
