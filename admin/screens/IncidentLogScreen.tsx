import { useEffect, useState } from 'react';
import { listIncidents, type Incident } from '../services/adminApi';
import type { AdminSession } from '../adminSession';

interface IncidentLogScreenProps {
  session: AdminSession;
  onSelectSource: (source: string) => void;
}

const SOURCE_NAMES: Record<string, string> = {
  pc: 'ПК',
  printer: 'Принтер',
  display: 'Экран',
  network: 'Сеть',
  backend: 'Бэкенд',
  'payment-terminal': 'Платёжный терминал',
};

const SOURCES = Object.keys(SOURCE_NAMES);
const SEVERITIES = ['info', 'warning', 'critical', 'emergency'] as const;
const SEVERITY_LABEL: Record<string, string> = {
  emergency: 'EMERGENCY',
  critical: 'CRITICAL',
  warning: 'WARNING',
  info: 'INFO',
};

type StatusFilter = 'all' | 'open' | 'resolved';

function SevChip({ severity }: { severity: string }) {
  return <span className={`sev sev-${severity}`}>{SEVERITY_LABEL[severity] ?? severity}</span>;
}

// Ports docs/screens/admin-panel-spec.md's Incident log screen. No backend
// query supports multi-select severity/source filters or a resolved-only
// flag (server/adminRoutes.ts's /api/admin/incidents takes one source, one
// severity, and openOnly) — the spec's own Open items already defer
// date-range filtering "until real incident volume exists to design
// against," so a single unfiltered fetch (same limit Overview already
// uses) with all toggle filtering done client-side is consistent with that
// call, not a shortcut around it.
export function IncidentLogScreen({ session, onSelectSource }: IncidentLogScreenProps) {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    let cancelled = false;
    function poll() {
      listIncidents(session.sessionToken, { limit: 500 })
        .then((rows) => {
          if (!cancelled) {
            setIncidents(rows);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load incidents');
        });
    }
    poll();
    const intervalId = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [session.sessionToken]);

  function toggleSeverity(severity: string) {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) next.delete(severity);
      else next.add(severity);
      return next;
    });
  }

  function toggleSource(source: string) {
    setSourceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  function resetFilters() {
    setSeverityFilter(new Set());
    setSourceFilter(new Set());
    setStatusFilter('all');
  }

  const filtered = (incidents ?? []).filter((incident) => {
    if (severityFilter.size > 0 && !severityFilter.has(incident.severity)) return false;
    if (sourceFilter.size > 0 && !sourceFilter.has(incident.source)) return false;
    if (statusFilter === 'open' && incident.resolvedAt) return false;
    if (statusFilter === 'resolved' && !incident.resolvedAt) return false;
    return true;
  });

  return (
    <section className="view" id="view-incident-log">
      <div className="view-header">
        <div>
          <h1 className="view-title">Лог инцидентов</h1>
          <p className="view-sub">
            {incidents ? `${filtered.length} из ${incidents.length}` : 'Загрузка…'}
          </p>
        </div>
      </div>

      {error && <p className="login-error">{error}</p>}

      <div className="log-filters">
        <div className="filter-group">
          {SEVERITIES.map((severity) => (
            <button
              key={severity}
              type="button"
              id={`incident-log-filter-severity-${severity}`}
              className={`filter-chip${severityFilter.has(severity) ? ' active' : ''}`}
              onClick={() => toggleSeverity(severity)}
            >
              {SEVERITY_LABEL[severity]}
            </button>
          ))}
        </div>
        <div className="filter-group">
          {SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              id={`incident-log-filter-source-${source}`}
              className={`filter-chip${sourceFilter.has(source) ? ' active' : ''}`}
              onClick={() => toggleSource(source)}
            >
              {SOURCE_NAMES[source]}
            </button>
          ))}
        </div>
        <div className="filter-group">
          {(['all', 'open', 'resolved'] as const).map((status) => (
            <button
              key={status}
              type="button"
              id={`incident-log-filter-status-${status}`}
              className={`filter-chip${statusFilter === status ? ' active' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {status === 'all' ? 'Все' : status === 'open' ? 'Открытые' : 'Решённые'}
            </button>
          ))}
        </div>
        <button
          type="button"
          id="incident-log-filter-reset"
          className="filter-reset"
          onClick={resetFilters}
        >
          Сбросить фильтры
        </button>
      </div>

      <div className="detail-history" id="incident-log-list">
        {filtered.length === 0 ? (
          <p className="empty-note">Ничего не найдено — попробуйте сбросить фильтры</p>
        ) : (
          filtered.map((incident) => (
            <button
              type="button"
              className="incident-row"
              key={incident.id}
              id={`incident-log-row-${incident.id}`}
              onClick={() => onSelectSource(incident.source)}
            >
              <span className="incident-time">
                {new Date(incident.createdAt).toLocaleString([], {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <SevChip severity={incident.severity} />
              <span className="incident-code">{incident.code}</span>
              <span className="incident-target">
                → {SOURCE_NAMES[incident.source] ?? incident.source}
                {incident.resolvedAt ? ' · решён' : ' · открыт'}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
