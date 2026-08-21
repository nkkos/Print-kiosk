import { useEffect, useState } from 'react';
import { getRoster, type RosterEntry } from './services/adminApi';
import type { AdminSession } from './adminSession';

export type AdminScreen = 'overview' | 'equipment-detail' | 'incident-log' | 'alerts' | 'catalog';

interface AdminShellProps {
  session: AdminSession;
  screen: AdminScreen;
  onNavigate: (screen: AdminScreen) => void;
  onLogout: () => void;
}

// Ports docs/screens/admin-panel-spec.md's shared elements (`admin-nav-*`,
// `admin-oncall-indicator`) from the approved HTML mockup — same markup
// shape, now driven by GET /api/admin/roster instead of hardcoded data.
export function AdminShell({ session, screen, onNavigate, onLogout }: AdminShellProps) {
  const [onCall, setOnCall] = useState<RosterEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRoster(session.sessionToken)
      .then(({ current }) => {
        if (!cancelled) setOnCall(current);
      })
      .catch(() => {
        // Non-critical — the topbar just shows nothing rather than an error
        // banner for a live-status indicator, same convention as
        // Overview's own equipment cards.
      });
    return () => {
      cancelled = true;
    };
  }, [session.sessionToken]);

  return (
    <div className="topbar">
      <div className="brand">
        <span className="mark">KO</span>
        <span>Kiosk Ops Console</span>
      </div>
      <nav className="topbar-nav">
        <button
          id="admin-nav-overview"
          className={`nav-link${screen === 'overview' ? ' current' : ''}`}
          onClick={() => onNavigate('overview')}
        >
          Обзор
        </button>
        <button
          id="admin-nav-log"
          className={`nav-link${screen === 'incident-log' ? ' current' : ''}`}
          onClick={() => onNavigate('incident-log')}
        >
          Лог инцидентов
        </button>
        <button
          id="admin-nav-alerts"
          className={`nav-link${screen === 'alerts' ? ' current' : ''}`}
          onClick={() => onNavigate('alerts')}
        >
          Алерты и дежурства
        </button>
        {/* Failure catalog isn't built yet in this pass (see
            docs/screens/admin-panel-spec.md's sequencing) — disabled the
            same way "Статистика" already is below, not hidden, so the
            panel's eventual full scope stays visible. */}
        <button id="admin-nav-catalog" className="nav-link" disabled title="Ещё не реализовано">
          Справочник неисправностей
        </button>
        <button
          id="admin-nav-stats"
          className="nav-link"
          disabled
          title="Отложено до накопления данных"
        >
          Статистика
        </button>
      </nav>
      <div className="topbar-spacer" />
      {onCall && (
        <div className="oncall" id="admin-oncall-indicator">
          Дежурит: <b>{onCall.email}</b>
          <span className="role-pill">{onCall.role}</span>
        </div>
      )}
      <button className="logout-btn" onClick={onLogout}>
        {session.email} · Выйти
      </button>
    </div>
  );
}
