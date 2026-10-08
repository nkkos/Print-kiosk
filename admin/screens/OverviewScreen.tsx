import { useEffect, useState } from 'react';
import { listIncidents, listStands, type Incident, type StandStatus } from '../services/adminApi';
import type { AdminSession } from '../adminSession';

interface OverviewScreenProps {
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

const SEVERITY_RANK: Record<string, number> = { emergency: 4, critical: 3, warning: 2, info: 1 };
const SEVERITY_LABEL: Record<string, string> = {
  emergency: 'EMERGENCY',
  critical: 'CRITICAL',
  warning: 'WARNING',
  info: 'INFO',
  ok: 'OK',
};

function SevChip({ severity, label }: { severity: string; label?: string }) {
  return (
    <span className={`sev sev-${severity}`}>{label ?? SEVERITY_LABEL[severity] ?? severity}</span>
  );
}

// Ports docs/screens/admin-panel-spec.md's Overview screen from the
// approved HTML mockup — same markup/ids, now driven by real
// GET /api/admin/incidents (openOnly=true) instead of hardcoded data.
// Time only for today's incidents; older ones also get the date — a bare
// "13:25" from weeks ago read as today's.
function formatIncidentTime(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${time}`;
}

export function OverviewScreen({ session, onSelectSource }: OverviewScreenProps) {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stands, setStands] = useState<StandStatus[]>([]);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      listStands(session.sessionToken)
        .then((rows) => {
          if (!cancelled) setStands(rows);
        })
        .catch(() => {
          // The stands row just keeps its last reading — the incident feed
          // above already reports a stand that's gone quiet.
        });
      listIncidents(session.sessionToken, { openOnly: true, limit: 200 })
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

  const sortedIncidents = (incidents ?? []).slice().sort((a, b) => {
    const rankDiff = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  function worstForSource(source: string): Incident | null {
    const matches = sortedIncidents.filter((incident) => incident.source === source);
    return matches[0] ?? null;
  }

  return (
    <section className="view" id="view-overview">
      <div className="view-header">
        <div>
          <h1 className="view-title">Обзор оборудования</h1>
          <p className="view-sub">Один павильон · обновляется каждые 5 секунд</p>
        </div>
      </div>

      {error && <p className="login-error">{error}</p>}

      {sortedIncidents.length > 0 && (
        <div className="incident-feed" id="incident-feed">
          <div className="incident-feed-head" id="incident-feed-head">
            Активные инциденты ({sortedIncidents.length})
          </div>
          {sortedIncidents.map((incident) => (
            <button
              type="button"
              className="incident-row"
              key={incident.id}
              id={`incident-row-${incident.id}`}
              onClick={() => onSelectSource(incident.source)}
            >
              <span className="incident-time">{formatIncidentTime(incident.createdAt)}</span>
              <SevChip severity={incident.severity} />
              <span className="incident-code">{incident.code}</span>
              <span className="incident-target">
                → {SOURCE_NAMES[incident.source] ?? incident.source}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="equipment-grid" id="equipment-grid">
        {SOURCES.map((source) => {
          const worst = worstForSource(source);
          const isPaymentTerminal = source === 'payment-terminal';
          const sev = worst ? worst.severity : isPaymentTerminal ? 'neutral' : 'ok';
          const metric = worst
            ? worst.code
            : isPaymentTerminal
              ? '— не подключён'
              : 'Нет открытых инцидентов';
          return (
            <button
              type="button"
              className="equip-card"
              id={`equipment-card-${source}`}
              data-sev={sev}
              key={source}
              onClick={() => onSelectSource(source)}
            >
              <div className="equip-card-top">
                <span className="equip-name">{SOURCE_NAMES[source]}</span>
                <SevChip severity={sev} label={isPaymentTerminal && !worst ? '—' : undefined} />
              </div>
              <div className="equip-metric">{metric}</div>
            </button>
          );
        })}
      </div>

      {stands.length > 0 && (
        <>
          <h2 className="overview-subtitle">Стойки</h2>
          <div className="equipment-grid" id="stands-grid">
            {stands.map((stand) => {
              const sev = stand.online ? 'ok' : stand.monitored ? 'emergency' : 'neutral';
              return (
                <div
                  className="equip-card"
                  id={`stand-card-${stand.id}`}
                  data-sev={sev}
                  key={stand.id}
                  style={{ cursor: 'default' }}
                >
                  <div className="equip-card-top">
                    <span className="equip-name">Стойка {stand.id}</span>
                    <SevChip severity={sev} label={stand.online ? 'На связи' : 'Нет связи'} />
                  </div>
                  <div className="equip-metric">
                    {stand.lastSeenAt
                      ? `${stand.lastScreen ? `экран ${stand.lastScreen} · ` : ''}отметка ${formatIncidentTime(stand.lastSeenAt)}`
                      : 'ещё не выходила на связь'}
                    {!stand.monitored && ' · не отслеживается'}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
