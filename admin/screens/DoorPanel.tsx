import { useEffect, useState, type FormEvent } from 'react';
import {
  addDoorClosure,
  cancelDoorClosure,
  closeDoor,
  getDoorStatus,
  openDoor,
  type DoorStatus,
} from '../services/adminApi';
import type { AdminSession } from '../adminSession';

// The pavilion entrance door on the Overview (docs/pavilion-security-requirements.md,
// section 1; server/pavilionDoor.ts). Built to be used from a phone: the
// operator stands at the door, opens this panel and taps "Открыть".
// Commands are senior only (confirmed 2026-10-16); everyone sees the state.

const LOCK_LABEL: Record<string, string> = {
  locked: 'заперт',
  unlocked: 'отперт',
  moving: 'двигается',
  unknown: 'неизвестно',
};
const DOOR_LABEL: Record<string, string> = {
  closed: 'закрыта',
  open: 'открыта',
  unknown: 'неизвестно',
};

const EVENT_LABEL: Record<string, string> = {
  unlocked: 'Отперто',
  locked: 'Заперто',
  'inside-exit': 'Кто-то вышел изнутри',
  'visit-entry': 'Вход по команде «Открыть»',
  'door-forced': 'Дверь открыта при запертом замке',
  'door-held-open': 'Дверь открыта больше 2 минут',
  'lock-failed': 'Не удалось запереть',
  'unlock-failed': 'Не удалось отпереть',
  'admin-open': 'Команда «Открыть»',
  'admin-close': 'Команда «Закрыть»',
  'closure-added': 'Добавлено закрытие на период',
  'closure-cancelled': 'Закрытие отменено',
};
const DETAIL_LABEL: Record<string, string> = {
  schedule: 'по расписанию',
  relock: 'снова, после того как дверь закрыли',
  'unused-unlock': 'снова — дверь так и не открыли',
  visit: 'для визита',
  reopened: 'отменено «Закрыть сейчас»',
  'already-open': 'павильон и так открыт',
};

export function DoorPanel({ session }: { session: AdminSession }) {
  const [status, setStatus] = useState<DoorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'open' | 'close' | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [closureForm, setClosureForm] = useState<{
    startsAt: string;
    endsAt: string;
    reason: string;
  } | null>(null);
  const isSenior = session.role === 'senior';

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString([], {
      timeZone: status?.timeZone,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  async function refresh() {
    try {
      setStatus(await getDoorStatus(session.sessionToken));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить состояние двери');
    }
  }

  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      getDoorStatus(session.sessionToken)
        .then((next) => {
          if (!cancelled) {
            setStatus(next);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled)
            setError(err instanceof Error ? err.message : 'Не удалось загрузить состояние двери');
        });
    void poll();
    const intervalId = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [session.sessionToken]);

  async function runCommand(command: 'open' | 'close') {
    setBusy(true);
    setNotice(null);
    try {
      if (command === 'open') {
        const { result } = await openDoor(session.sessionToken);
        setNotice(
          result === 'visit'
            ? 'Замок откроется через несколько секунд и запрётся снова, когда дверь закроют.'
            : result === 'reopened'
              ? 'Павильон снова открыт по расписанию.'
              : 'Павильон и так открыт по расписанию.',
        );
      } else {
        const { until } = await closeDoor(session.sessionToken);
        setNotice(
          until
            ? `Павильон закрыт до ${formatTime(until)}, дальше — по расписанию.`
            : 'Павильон закрыт.',
        );
      }
      setConfirming(null);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Команда не выполнена');
    } finally {
      setBusy(false);
    }
  }

  async function submitClosure(event: FormEvent) {
    event.preventDefault();
    if (!closureForm) return;
    setBusy(true);
    setNotice(null);
    try {
      await addDoorClosure(session.sessionToken, {
        startsAt: new Date(closureForm.startsAt).toISOString(),
        endsAt: closureForm.endsAt ? new Date(closureForm.endsAt).toISOString() : null,
        reason: closureForm.reason,
      });
      setClosureForm(null);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Не удалось добавить закрытие');
    } finally {
      setBusy(false);
    }
  }

  async function cancelClosure(id: string) {
    setBusy(true);
    try {
      await cancelDoorClosure(session.sessionToken, id);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Не удалось отменить закрытие');
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return error ? <p className="session-warning">{error}</p> : null;
  }

  const { reading } = status;
  const isOpen = status.plannedMode === 'open';
  const planText =
    status.plannedReason === 'override' && status.override
      ? `«Закрыть сейчас» до ${formatTime(status.override.until)}`
      : status.plannedReason === 'closure'
        ? `закрыто на период: ${status.closures.find((c) => Date.parse(c.startsAt) <= Date.now())?.reason ?? ''}`
        : `по расписанию ${status.openingHours.opensAt}–${status.openingHours.closesAt}`;
  const sev =
    !reading.reportedAt || reading.stale || reading.lockReachable === false
      ? 'critical'
      : reading.batteryCritical
        ? 'warning'
        : 'ok';
  const now = new Date();
  const localNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <>
      <h2 className="overview-subtitle">Дверь павильона</h2>
      <div className="door-panel" id="door-panel">
        <div className="equip-card" id="door-card" data-sev={sev} style={{ cursor: 'default' }}>
          <div className="equip-card-top">
            <span className="equip-name" id="door-planned-mode">
              {isOpen ? 'Открыто' : 'Закрыто'}
            </span>
            <span className={`sev sev-${sev}`}>
              {sev === 'ok'
                ? 'Замок на связи'
                : sev === 'warning'
                  ? 'Батарея'
                  : 'Нет связи с замком'}
            </span>
          </div>
          <div className="equip-metric">{planText}</div>
          <div className="equip-metric" id="door-reading">
            {reading.reportedAt
              ? `Замок ${LOCK_LABEL[reading.lock ?? 'unknown'] ?? reading.lock} · дверь ${DOOR_LABEL[reading.door ?? 'unknown'] ?? reading.door} · ${formatTime(reading.reportedAt)}${reading.stale ? ' (давно не обновлялось)' : ''}`
              : 'Агент ещё не присылал состояние замка'}
            {reading.batteryCritical && ' · батарея замка почти разряжена'}
          </div>
          {status.visitPending && (
            <div className="equip-metric" id="door-visit-pending">
              Открытие отправлено — замок откроется через несколько секунд
            </div>
          )}
          {isSenior && (
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                id="door-open"
                onClick={() => setConfirming('open')}
                disabled={busy}
              >
                Открыть
              </button>
              <button
                type="button"
                className="btn"
                id="door-close"
                onClick={() => setConfirming('close')}
                disabled={busy}
              >
                Закрыть
              </button>
            </div>
          )}
        </div>
        {notice && (
          <p className="session-warning" id="door-notice">
            {notice}
          </p>
        )}

        {(status.closures.length > 0 || isSenior) && (
          <div className="equip-card" id="door-closures" style={{ cursor: 'default' }}>
            <div className="equip-card-top">
              <span className="equip-name">Закрытия на период</span>
            </div>
            {status.closures.length === 0 && <div className="equip-metric">Нет</div>}
            {status.closures.map((closure) => (
              <div className="equip-metric" key={closure.id} id={`door-closure-${closure.id}`}>
                {formatTime(closure.startsAt)} –{' '}
                {closure.endsAt ? formatTime(closure.endsAt) : 'до отмены'} · {closure.reason}
                {isSenior && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="btn"
                      id={`door-closure-cancel-${closure.id}`}
                      onClick={() => void cancelClosure(closure.id)}
                      disabled={busy}
                    >
                      Отменить
                    </button>
                  </>
                )}
              </div>
            ))}
            {isSenior &&
              (closureForm ? (
                <form
                  onSubmit={(e) => void submitClosure(e)}
                  className="calc-form"
                  id="door-closure-form"
                >
                  <label className="equip-metric">
                    С{' '}
                    <input
                      type="datetime-local"
                      className="admin-input"
                      id="door-closure-starts"
                      value={closureForm.startsAt}
                      onChange={(e) => setClosureForm({ ...closureForm, startsAt: e.target.value })}
                      required
                    />
                  </label>
                  <label className="equip-metric">
                    По (пусто — до отмены){' '}
                    <input
                      type="datetime-local"
                      className="admin-input"
                      id="door-closure-ends"
                      value={closureForm.endsAt}
                      onChange={(e) => setClosureForm({ ...closureForm, endsAt: e.target.value })}
                    />
                  </label>
                  <input
                    type="text"
                    className="admin-input"
                    id="door-closure-reason"
                    placeholder="Причина — ремонт, праздник…"
                    value={closureForm.reason}
                    onChange={(e) => setClosureForm({ ...closureForm, reason: e.target.value })}
                    required
                  />
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setClosureForm(null)}
                      disabled={busy}
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      id="door-closure-submit"
                      disabled={busy}
                    >
                      Закрыть павильон на этот период
                    </button>
                  </div>
                </form>
              ) : (
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn"
                    id="door-closure-add"
                    onClick={() => setClosureForm({ startsAt: localNow, endsAt: '', reason: '' })}
                  >
                    Закрыть на период…
                  </button>
                </div>
              ))}
          </div>
        )}

        <div className="equip-card" id="door-journal" style={{ cursor: 'default' }}>
          <div className="equip-card-top">
            <span className="equip-name">Журнал двери</span>
          </div>
          {status.events.length === 0 && <div className="equip-metric">Пока пусто</div>}
          {(showAllEvents ? status.events : status.events.slice(0, 8)).map((event) => (
            <div className="equip-metric" key={event.id}>
              {formatTime(event.at)} · {EVENT_LABEL[event.kind] ?? event.kind}
              {event.detail && ` — ${DETAIL_LABEL[event.detail] ?? event.detail}`}
              {event.staffEmail && ` · ${event.staffEmail}`}
            </div>
          ))}
          {status.events.length > 8 && (
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setShowAllEvents(!showAllEvents)}
              >
                {showAllEvents ? 'Свернуть' : 'Показать ещё'}
              </button>
            </div>
          )}
        </div>
      </div>

      {confirming && (
        <div className="modal-overlay">
          <div className="modal-card" id="door-confirm-modal" role="dialog" aria-modal>
            <h2>{confirming === 'open' ? 'Открыть дверь павильона?' : 'Закрыть павильон?'}</h2>
            <p className="session-warning">
              {confirming === 'open'
                ? isOpen
                  ? 'Павильон и так открыт по расписанию.'
                  : 'Замок откроется на один вход и запрётся снова, когда дверь закроют.'
                : isOpen
                  ? 'Павильон закроется до следующего изменения расписания. Кто внутри, выйдет как обычно.'
                  : 'Павильон и так закрыт; ожидающее открытие будет отменено.'}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                id="door-confirm-cancel"
                onClick={() => setConfirming(null)}
                disabled={busy}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-primary"
                id="door-confirm-submit"
                onClick={() => void runCommand(confirming)}
                disabled={busy}
              >
                {busy ? 'Выполняется…' : confirming === 'open' ? 'Открыть' : 'Закрыть'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
