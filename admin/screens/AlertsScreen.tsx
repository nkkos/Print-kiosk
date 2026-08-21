import { useEffect, useState } from 'react';
import { getRoster, type RosterEntry } from '../services/adminApi';
import type { AdminSession } from '../adminSession';

interface AlertsScreenProps {
  session: AdminSession;
}

const DAY_LABELS: Record<string, string> = {
  monday: 'Понедельник',
  tuesday: 'Вторник',
  wednesday: 'Среда',
  thursday: 'Четверг',
  friday: 'Пятница',
  saturday: 'Суббота',
  sunday: 'Воскресенье',
};

const DAY_ORDER = Object.keys(DAY_LABELS);

// Static reference, not backend-served — no /api/admin/thresholds route
// exists (there's nothing to serve; most of these aren't tuned values, per
// docs/equipment-monitoring-requirements.md's own Open items). The two
// marked "Реализовано" are the ones actually live in code today
// (server/telegramNotifier.ts's NOTIFY_COOLDOWN_MS, server/sessionLifecycle.ts's
// STALE_SESSION_THRESHOLD_MS) — everything else is illustrative/unconfirmed,
// per docs/screens/admin-panel-spec.md's own wording for this table.
const THRESHOLDS = [
  {
    name: 'Антидубли Telegram-уведомлений',
    value: '10 минут',
    status: 'Реализовано',
  },
  {
    name: 'Проверка активной сессии клиента (устаревание)',
    value: '10 минут',
    status: 'Реализовано',
  },
  {
    name: 'Эскалация в общий чат при отсутствии подтверждения',
    value: 'не определено',
    status: 'Не реализовано',
  },
  {
    name: 'Защита от цикла перезагрузок (boot-loop guard)',
    value: '1 автопопытка, затем нужно подтверждение оператора',
    status: 'Иллюстративно',
  },
];

// Ports docs/screens/admin-panel-spec.md's Alerts & on-call screen —
// entirely view-only in this pass (roster is edited only via
// server/scripts/setRosterDay.ts, no UI). alerts-escalation-history is
// always empty right now: escalation-to-group-chat-on-timeout isn't
// implemented yet (this document's own Open items), so there's nothing to
// have crossed that threshold — the empty-table state IS the honest state,
// not a placeholder waiting on wiring.
export function AlertsScreen({ session }: AlertsScreenProps) {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [current, setCurrent] = useState<RosterEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRoster(session.sessionToken)
      .then(({ roster, current }) => {
        if (!cancelled) {
          setRoster(roster);
          setCurrent(current);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load roster');
      });
    return () => {
      cancelled = true;
    };
  }, [session.sessionToken]);

  const rosterByDay = new Map((roster ?? []).map((entry) => [entry.dayOfWeek, entry]));

  return (
    <section className="view" id="view-alerts">
      <div className="view-header">
        <div>
          <h1 className="view-title">Алерты и дежурства</h1>
        </div>
      </div>

      {error && <p className="login-error">{error}</p>}

      <div className="alerts-panel" id="alerts-oncall-now">
        <div className="alerts-panel-head">Дежурит сейчас</div>
        {current ? (
          <div className="alerts-oncall-row">
            <span>
              <b>{current.email}</b> <span className="role-pill">{current.role}</span>
            </span>
            <span className="incident-target">До конца дня ({DAY_LABELS[current.dayOfWeek]})</span>
          </div>
        ) : (
          <p className="empty-note">На сегодня дежурный не назначен.</p>
        )}
      </div>

      <div className="alerts-panel" id="alerts-roster">
        <div className="alerts-panel-head">Расписание дежурств на неделю</div>
        <table className="alerts-table">
          <tbody>
            {DAY_ORDER.map((day) => {
              const entry = rosterByDay.get(day);
              return (
                <tr key={day}>
                  <td>{DAY_LABELS[day]}</td>
                  <td>
                    {entry ? (
                      <>
                        {entry.email} <span className="role-pill">{entry.role}</span>
                      </>
                    ) : (
                      <span className="incident-target">не назначено</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="alerts-panel" id="alerts-escalation-history">
        <div className="alerts-panel-head">История эскалаций</div>
        <p className="empty-note">
          Эскалация в общий чат по тайм-ауту ещё не реализована — записей пока нет.
        </p>
      </div>

      <div className="alerts-panel" id="alerts-thresholds">
        <div className="alerts-panel-head">
          Пороги авто-восстановления и эскалации (иллюстративно, не подтверждено)
        </div>
        <table className="alerts-table">
          <thead>
            <tr>
              <th>Порог</th>
              <th>Значение</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {THRESHOLDS.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td className="incident-code">{row.value}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
