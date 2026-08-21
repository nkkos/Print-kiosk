import { useEffect, useState } from 'react';
import { listIncidents, type Incident } from '../services/adminApi';
import type { AdminSession } from '../adminSession';

interface OverviewScreenProps {
  session: AdminSession;
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
// GET /api/admin/incidents (openOnly=true) instead of hardcoded data. Card
// click-through to Equipment detail isn't wired yet — that screen doesn't
// exist yet in this pass (see docs/screens/admin-panel-spec.md's own
// sequencing; this is the very next slice).
export function OverviewScreen({ session }: OverviewScreenProps) {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    function poll() {
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
            <div className="incident-row" key={incident.id} id={`incident-row-${incident.id}`}>
              <span className="incident-time">
                {new Date(incident.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <SevChip severity={incident.severity} />
              <span className="incident-code">{incident.code}</span>
              <span className="incident-target">
                → {SOURCE_NAMES[incident.source] ?? incident.source}
              </span>
            </div>
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
            <div className="equip-card" id={`equipment-card-${source}`} data-sev={sev} key={source}>
              <div className="equip-card-top">
                <span className="equip-name">{SOURCE_NAMES[source]}</span>
                <SevChip severity={sev} label={isPaymentTerminal && !worst ? '—' : undefined} />
              </div>
              <div className="equip-metric">{metric}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
