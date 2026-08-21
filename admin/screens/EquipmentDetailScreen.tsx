import { useEffect, useState } from 'react';
import {
  listIncidents,
  getKioskSessionActive,
  restartBackendProcess,
  type Incident,
} from '../services/adminApi';
import type { AdminSession } from '../adminSession';

interface EquipmentDetailScreenProps {
  session: AdminSession;
  source: string;
  onBack: () => void;
}

const SOURCE_NAMES: Record<string, string> = {
  pc: 'ПК',
  printer: 'Принтер',
  display: 'Экран',
  network: 'Сеть',
  backend: 'Бэкенд',
  'payment-terminal': 'Платёжный терминал',
};

const SEVERITY_LABEL: Record<string, string> = {
  emergency: 'EMERGENCY',
  critical: 'CRITICAL',
  warning: 'WARNING',
  info: 'INFO',
};

function SevChip({ severity }: { severity: string }) {
  return <span className={`sev sev-${severity}`}>{SEVERITY_LABEL[severity] ?? severity}</span>;
}

// No-fix explanations, per docs/screens/admin-panel-spec.md's
// `equipment-detail-nofix-notice` ("printer (jam-type incidents), network,
// payment-terminal") — text isn't spec'd verbatim, just the condition.
const NOFIX_NOTICES: Record<string, string> = {
  printer:
    'Большинство сбоев принтера (замятие бумаги, отсутствие бумаги/картриджа) требуют физического вмешательства — удалённого исправления нет.',
  network: 'Сетевые сбои нельзя устранить удалённо из этой панели.',
  'payment-terminal': 'Интеграция с платёжным терминалом ещё не подключена — фиксов пока нет.',
};

// Restart-cascade fix buttons exist in the spec for pc/display, but per
// docs/screens/admin-panel-spec.md's own Open items, no real route exists
// yet for either ("needs infrastructure — a watchdog process, a managed
// relay — not built this pass"). Shown disabled rather than omitted, so the
// panel's eventual full shape stays visible (same convention AdminShell.tsx
// already uses for admin-nav-log/alerts/catalog), instead of wiring a
// button to an endpoint that doesn't exist.
const RESTART_CASCADE_SOURCES = ['pc', 'display'] as const;
const RESTART_CASCADE_LABELS: Record<string, string> = {
  'restart-app': 'Перезапустить приложение',
  'restart-os': 'Перезапустить ОС',
  'hard-cycle': 'Жёсткая перезагрузка (реле)',
};

export function EquipmentDetailScreen({ session, source, onBack }: EquipmentDetailScreenProps) {
  const [history, setHistory] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listIncidents(session.sessionToken, { source, limit: 100 })
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load history');
      });
    return () => {
      cancelled = true;
    };
  }, [session.sessionToken, source]);

  const openFixIncidentId = history?.find((incident) => !incident.resolvedAt)?.id;

  function openConfirm() {
    getKioskSessionActive(session.sessionToken)
      .then((active) => setSessionActive(active))
      .catch(() => setSessionActive(false));
    setConfirmOpen(true);
  }

  async function submitFix() {
    setSubmitting(true);
    try {
      await restartBackendProcess(session.sessionToken, openFixIncidentId);
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fix action failed');
    } finally {
      setSubmitting(false);
    }
  }

  const canFixBackend = session.role === 'senior' && source === 'backend';
  const nofixNotice = NOFIX_NOTICES[source];

  return (
    <section className="view" id="view-equipment-detail">
      <div className="view-header">
        <div>
          <button type="button" className="back-link" id="equipment-detail-back" onClick={onBack}>
            ← Обзор
          </button>
          <h1 className="view-title">{SOURCE_NAMES[source] ?? source}</h1>
        </div>
      </div>

      {error && <p className="login-error">{error}</p>}

      {source === 'backend' && (
        <div className="fix-actions">
          <button
            type="button"
            id="equipment-fix-backend-restart-process"
            className="btn"
            disabled={!canFixBackend}
            title={canFixBackend ? undefined : 'Доступно только роли senior'}
            onClick={openConfirm}
          >
            Перезапустить процесс бэкенда
          </button>
        </div>
      )}

      {RESTART_CASCADE_SOURCES.includes(source as 'pc' | 'display') && (
        <div className="fix-actions">
          {(['restart-app', 'restart-os', 'hard-cycle'] as const).map((action) => (
            <button
              key={action}
              type="button"
              id={`equipment-fix-${source}-${action}`}
              className="btn"
              disabled
              title="Требует инфраструктуры (вотчдог/управляемое реле) — не реализовано в этой версии"
            >
              {RESTART_CASCADE_LABELS[action]}
            </button>
          ))}
        </div>
      )}

      {nofixNotice && (
        <p className="nofix-notice" id="equipment-detail-nofix-notice">
          {nofixNotice}
        </p>
      )}

      <div className="detail-history" id="equipment-detail-history">
        <div className="incident-feed-head">История</div>
        {!history || history.length === 0 ? (
          <p className="empty-note">Инцидентов пока не было.</p>
        ) : (
          history.map((incident) => (
            <div className="incident-row incident-row-static" key={incident.id}>
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
                {incident.resolvedAt ? `решено (${incident.resolvedBy})` : 'открыт'}
              </span>
            </div>
          ))
        )}
      </div>

      {confirmOpen && (
        <div className="modal-overlay">
          <div className="modal-card" id="equipment-fix-confirm-modal" role="dialog" aria-modal>
            <h2>Перезапустить процесс бэкенда?</h2>
            {sessionActive && (
              <p className="session-warning" id="equipment-fix-confirm-session-warning">
                Активная сессия клиента — она будет прервана.
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                id="equipment-fix-confirm-cancel"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-primary"
                id="equipment-fix-confirm-submit"
                onClick={submitFix}
                disabled={submitting}
              >
                {submitting ? 'Выполняется…' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
