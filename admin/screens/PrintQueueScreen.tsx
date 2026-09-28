import { useEffect, useState } from 'react';
import {
  listPrintTasks,
  releasePrintTaskBin,
  type PrintTaskAdmin,
  type PrinterStatusAdmin,
} from '../services/adminApi';
import type { AdminSession } from '../adminSession';

interface PrintQueueScreenProps {
  session: AdminSession;
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'В очереди',
  printing: 'Печатается',
  succeeded: 'Готово',
  failed: 'Ошибка',
};

// Reuses the existing severity-chip palette (admin.css's .sev-*) rather than
// inventing a parallel color system — print task status isn't a severity,
// but the same "small colored label" visual language fits.
const STATUS_SEV: Record<string, string> = {
  queued: 'neutral',
  printing: 'info',
  succeeded: 'ok',
  failed: 'critical',
};

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`sev sev-${STATUS_SEV[status] ?? 'neutral'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// server/printerStatus.ts's PrinterProblem codes, as staff read them.
const PROBLEM_LABEL: Record<string, string> = {
  'low-paper': 'Мало бумаги',
  'no-paper': 'Нет бумаги',
  'low-toner': 'Мало тонера',
  'no-toner': 'Нет тонера',
  'door-open': 'Открыта крышка',
  jammed: 'Замятие',
  offline: 'Принтер офлайн',
  'service-requested': 'Нужен сервис',
  'input-tray-missing': 'Лоток вынут',
  'output-tray-missing': 'Нет выходного лотка / мэйлбокса',
  'marker-supply-missing': 'Нет картриджа',
  'output-near-full': 'Ячейка почти полна',
  'output-full': 'Ячейка переполнена',
  'input-tray-empty': 'Лоток пуст',
  'overdue-maintenance': 'Просрочено ТО',
  unreachable: 'Нет связи с принтером',
};
// Warnings only — everything else stops printing (server/printerStatus.ts,
// blockingProblems).
const WARNING_PROBLEMS = new Set([
  'low-paper',
  'low-toner',
  'output-near-full',
  'overdue-maintenance',
]);

const STATE_LABEL: Record<string, string> = {
  idle: 'Готов',
  printing: 'Печатает',
  warmup: 'Прогревается',
  other: 'Занят / сон',
  unknown: 'Неизвестно',
  unreachable: 'Нет связи',
};

// Printer health from the pavilion print agent (agent/, SNMP). Shown above
// the bins so staff see why printing might be blocked before customers
// report it.
function PrinterStatusPanel({ status }: { status: PrinterStatusAdmin }) {
  if (status.mode === 'direct') {
    return (
      <div className="equip-card" style={{ cursor: 'default' }} id="print-queue-printer">
        <div className="equip-card-top">
          <span className="equip-name">Принтер</span>
          <span className="sev sev-neutral">Локальный режим</span>
        </div>
        <span className="equip-metric">
          Сервер печатает сам (PRINT_EXECUTION=direct) — состояния от агента нет.
        </span>
      </div>
    );
  }
  const printer = status.printer;
  const blocking = (printer?.problems ?? []).filter((p) => !WARNING_PROBLEMS.has(p));
  const warnings = (printer?.problems ?? []).filter((p) => WARNING_PROBLEMS.has(p));
  const headline = !status.agentOnline
    ? { sev: 'critical', text: 'Агент не на связи' }
    : blocking.length > 0
      ? { sev: 'critical', text: 'Печать остановлена' }
      : warnings.length > 0
        ? { sev: 'warning', text: 'Есть предупреждения' }
        : printer
          ? { sev: 'ok', text: STATE_LABEL[printer.state] ?? printer.state }
          : { sev: 'neutral', text: 'Нет данных' };
  return (
    <div
      className="equip-card"
      style={{ cursor: 'default' }}
      id="print-queue-printer"
      data-sev={headline.sev === 'critical' ? 'critical' : undefined}
    >
      <div className="equip-card-top">
        <span className="equip-name">Принтер</span>
        <span className={`sev sev-${headline.sev}`}>{headline.text}</span>
      </div>
      {[...blocking, ...warnings].length > 0 && (
        <div className="printer-problems">
          {blocking.map((p) => (
            <span key={p} className="sev sev-critical">
              {PROBLEM_LABEL[p] ?? p}
            </span>
          ))}
          {warnings.map((p) => (
            <span key={p} className="sev sev-warning">
              {PROBLEM_LABEL[p] ?? p}
            </span>
          ))}
        </div>
      )}
      {printer && printer.supplies.length > 0 && (
        <ul className="printer-supplies">
          {printer.supplies.map((supply) => (
            <li key={supply.name}>
              <span>{supply.name}</span>
              {supply.levelPercent == null ? (
                <span className="equip-metric">есть</span>
              ) : (
                <>
                  <span className="supply-meter" aria-hidden="true">
                    <span
                      className="supply-meter-fill"
                      data-low={supply.levelPercent <= 15 ? 'true' : undefined}
                      style={{ width: `${supply.levelPercent}%` }}
                    />
                  </span>
                  <span className="equip-metric">{supply.levelPercent}%</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <span className="equip-metric">
        {printer
          ? `Данные принтера: ${formatTime(printer.checkedAt)}`
          : 'Агент ещё не присылал состояние'}
        {' · '}
        {status.agentLastSeenAt
          ? `агент на связи: ${formatTime(status.agentLastSeenAt)}`
          : 'агент не выходил на связь'}
      </span>
    </div>
  );
}

function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : '—';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Print Queue screen — new for the pavilion launch plan (2026-09-16), not
// part of the original docs/screens/admin-panel-spec.md mockup (that spec
// predates the pickup-bin feature, server/pickupBins.ts). Gives staff the
// one piece of visibility that feature is missing on its own: which of the
// Brother MX-4000's BIN_COUNT physical bins is currently held by which task,
// and a manual way to free one a customer never confirmed collecting (the
// exact "zombie task squats a bin forever" failure mode found and fixed in
// printOrchestrator.ts/pickupBins.ts).
export function PrintQueueScreen({ session }: PrintQueueScreenProps) {
  const [tasks, setTasks] = useState<PrintTaskAdmin[] | null>(null);
  const [binCount, setBinCount] = useState(4);
  const [printerStatus, setPrinterStatus] = useState<PrinterStatusAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);
  const [releaseTarget, setReleaseTarget] = useState<PrintTaskAdmin | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      listPrintTasks(session.sessionToken, 100)
        .then(({ tasks: rows, binCount: count, printerStatus: printerRow }) => {
          if (!cancelled) {
            setTasks(rows);
            setBinCount(count);
            setPrinterStatus(printerRow);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tasks');
        });
    }
    poll();
    const intervalId = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [session.sessionToken]);

  // A task "occupies" a bin under the exact same rule as the real backend
  // (server/pickupBins.ts's getOccupiedBinNumbers): it has a bin assigned
  // and hasn't been confirmed picked up yet — regardless of its own print
  // status, since a 'failed' task still squats its bin until released.
  const occupants = new Map<number, PrintTaskAdmin>();
  for (const task of tasks ?? []) {
    if (task.binNumber != null && !task.pickedUpAt && !occupants.has(task.binNumber)) {
      occupants.set(task.binNumber, task);
    }
  }

  // "Active" means genuinely needs attention right now: still queued
  // waiting for a bin, or currently holding one unreleased. Deliberately
  // NOT keyed off `status` alone — 'printing' persists forever once a bin
  // is released (there's no real completion signal, only the manual
  // Simulate buttons), so a released task's stale 'printing' status would
  // otherwise clutter this view with tasks nobody needs to act on, right
  // alongside truly ancient rows from before this feature existed (never
  // assigned a bin at all, `pickedUpAt` null forever for the same reason).
  const visibleTasks = (tasks ?? []).filter((task) => {
    if (!activeOnly) return true;
    return (
      (task.status === 'queued' && task.binNumber == null) ||
      (task.binNumber != null && !task.pickedUpAt)
    );
  });

  async function confirmRelease() {
    if (!releaseTarget) return;
    setSubmitting(true);
    try {
      await releasePrintTaskBin(session.sessionToken, releaseTarget.id);
      setReleaseTarget(null);
      // Reflected on the next 5s poll regardless, but updating locally too
      // avoids a stale "occupied" tile for the few seconds until then.
      setTasks(
        (prev) =>
          prev?.map((task) =>
            task.id === releaseTarget.id ? { ...task, pickedUpAt: new Date().toISOString() } : task,
          ) ?? null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Release failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="view" id="view-print-queue">
      <div className="view-header">
        <div>
          <h1 className="view-title">Очередь печати</h1>
          <p className="view-sub">
            {tasks ? `Занято ${occupants.size} из ${binCount} ячеек` : 'Загрузка…'}
          </p>
        </div>
      </div>

      {error && <p className="login-error">{error}</p>}

      {printerStatus && (
        <div className="printer-status-row">
          <PrinterStatusPanel status={printerStatus} />
        </div>
      )}

      <div className="equipment-grid" id="print-queue-bins">
        {Array.from({ length: binCount }, (_, i) => i + 1).map((bin) => {
          const occupant = occupants.get(bin);
          return (
            <div
              className="equip-card"
              id={`print-queue-bin-${bin}`}
              key={bin}
              data-sev={
                occupant ? (occupant.status === 'failed' ? 'critical' : undefined) : undefined
              }
              style={{ cursor: 'default' }}
            >
              <div className="equip-card-top">
                <span className="equip-name">Ячейка {bin}</span>
                {occupant && <StatusChip status={occupant.status} />}
              </div>
              {occupant ? (
                <>
                  <span className="equip-metric">
                    {occupant.standId ? `Стойка ${occupant.standId} · ` : ''}
                    Сессия {shortId(occupant.sessionId)} · с {formatTime(occupant.createdAt)}
                  </span>
                  <button
                    type="button"
                    className="btn"
                    id={`print-queue-bin-${bin}-release`}
                    onClick={() => setReleaseTarget(occupant)}
                  >
                    Освободить
                  </button>
                </>
              ) : (
                <span className="equip-metric">Свободна</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="log-filters">
        <button
          type="button"
          id="print-queue-filter-active"
          className={`filter-chip${activeOnly ? ' active' : ''}`}
          onClick={() => setActiveOnly((v) => !v)}
        >
          Только активные
        </button>
      </div>

      <table className="alerts-table" id="print-queue-list">
        <thead>
          <tr>
            <th>Время</th>
            <th>Задание</th>
            <th>Стойка</th>
            <th>Сессия</th>
            <th>Статус</th>
            <th>Ячейка</th>
            <th>Выдано</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visibleTasks.length === 0 ? (
            <tr>
              <td colSpan={8} className="empty-note">
                Ничего не найдено
              </td>
            </tr>
          ) : (
            visibleTasks.map((task) => (
              <tr key={task.id}>
                <td>{formatTime(task.createdAt)}</td>
                <td className="equip-metric">{shortId(task.id)}</td>
                <td>{task.standId ?? '—'}</td>
                <td className="equip-metric">{shortId(task.sessionId)}</td>
                <td>
                  <StatusChip status={task.status} />
                  {task.errorReason && <span className="equip-metric"> · {task.errorReason}</span>}
                </td>
                <td>{task.binNumber ?? '—'}</td>
                <td>{task.pickedUpAt ? formatTime(task.pickedUpAt) : '—'}</td>
                <td>
                  {task.binNumber != null && !task.pickedUpAt && (
                    <button
                      type="button"
                      className="btn"
                      id={`print-queue-release-${task.id}`}
                      onClick={() => setReleaseTarget(task)}
                    >
                      Освободить ячейку
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {releaseTarget && (
        <div className="modal-overlay">
          <div
            className="modal-card"
            id="print-queue-release-confirm-modal"
            role="dialog"
            aria-modal
          >
            <h2>Освободить ячейку {releaseTarget.binNumber}?</h2>
            <p className="session-warning">
              Подтвердите, только если убедились, что ячейка физически пуста — распечатанные
              документы забраны или задание не будет напечатано.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                id="print-queue-release-cancel"
                onClick={() => setReleaseTarget(null)}
                disabled={submitting}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-primary"
                id="print-queue-release-submit"
                onClick={confirmRelease}
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
