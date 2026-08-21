import { useState } from 'react';

const SOURCE_NAMES: Record<string, string> = {
  pc: 'ПК',
  printer: 'Принтер',
  display: 'Экран',
  network: 'Сеть',
  backend: 'Бэкенд',
  'payment-terminal': 'Платёжный терминал',
};

const SOURCE_ORDER = Object.keys(SOURCE_NAMES);

const SEVERITY_LABEL: Record<string, string> = {
  emergency: 'EMERGENCY',
  critical: 'CRITICAL',
  warning: 'WARNING',
  info: 'INFO',
};

function SevChip({ severity }: { severity: string }) {
  return <span className={`sev sev-${severity}`}>{SEVERITY_LABEL[severity] ?? severity}</span>;
}

interface CatalogEntry {
  code: string;
  severity: keyof typeof SEVERITY_LABEL;
  autoFix: string;
  monitoring: 'реализовано' | 'не реализовано' | 'не подтверждено';
  message: string;
}

// Hardcoded to mirror docs/equipment-monitoring-requirements.md by hand, per
// docs/screens/admin-panel-spec.md's own Open items ("not decided" between
// this and a backend-served version). Severities/monitoring status below
// follow that document's Equipment sections and its "Implemented and
// verified live" notes as closely as the source text states them — where
// it doesn't explicitly confirm a code is wired up, this is marked
// "не подтверждено" rather than guessed as done.
const CATALOG: Record<string, CatalogEntry[]> = {
  pc: [
    {
      code: 'pc.os-crash',
      severity: 'critical',
      autoFix: 'Каскад: перезапуск приложения → ОС → аппаратный цикл (не реализовано)',
      monitoring: 'не реализовано',
      message: 'Зависание или сбой ОС',
    },
    {
      code: 'pc.disk-full',
      severity: 'warning',
      autoFix: 'нет',
      monitoring: 'не реализовано',
      message: 'Диск заполнен логами/загрузками/временными файлами конвертации',
    },
    {
      code: 'pc.unexpected-restart',
      severity: 'warning',
      autoFix: 'нет',
      monitoring: 'не реализовано',
      message: 'Незапланированная перезагрузка (например, принудительное обновление Windows)',
    },
    {
      code: 'pc.unresponsive',
      severity: 'critical',
      autoFix: 'Каскад: перезапуск приложения → ОС → аппаратный цикл (не реализовано)',
      monitoring: 'не реализовано',
      message: 'Health-check приложения перестал отвечать',
    },
    {
      code: 'pc.dead',
      severity: 'emergency',
      autoFix: 'Каскад (не реализовано)',
      monitoring: 'не реализовано',
      message: 'Heartbeat не получен дольше порога — самый тяжёлый случай',
    },
    {
      code: 'pc.peripheral-disconnected',
      severity: 'critical',
      autoFix: 'нет',
      monitoring: 'не реализовано',
      message: 'USB-устройство (принтер, будущий платёжный терминал) отключилось на уровне ОС',
    },
    {
      code: 'pc.overheating',
      severity: 'warning',
      autoFix: 'нет',
      monitoring: 'не реализовано',
      message: 'Требует датчика температуры — пока не установлен',
    },
  ],
  printer: [
    {
      code: 'printer.out-of-paper',
      severity: 'critical',
      autoFix: 'нет — нужна физическая рука',
      monitoring: 'не подтверждено',
      message: 'Закончилась бумага',
    },
    {
      code: 'printer.out-of-ink',
      severity: 'critical',
      autoFix: 'нет — нужна физическая рука',
      monitoring: 'не подтверждено',
      message: 'Закончились чернила/картридж',
    },
    {
      code: 'printer.paper-jam',
      severity: 'critical',
      autoFix: 'нет — нужна физическая рука',
      monitoring: 'реализовано',
      message: 'Замятие бумаги',
    },
    {
      code: 'printer.offline',
      severity: 'critical',
      autoFix: 'нет',
      monitoring: 'не подтверждено',
      message: 'Потеряно USB/сетевое соединение',
    },
    {
      code: 'printer.queue-stuck',
      severity: 'critical',
      autoFix:
        'Перезапуск службы очереди печати + повтор задания (заблокировано — нужны права администратора)',
      monitoring: 'не реализовано',
      message: 'Задание зависло в очереди печати Windows',
    },
    {
      code: 'printer.cover-open',
      severity: 'critical',
      autoFix: 'нет — нужна физическая рука',
      monitoring: 'не подтверждено',
      message: 'Открыта крышка или похожее состояние',
    },
    {
      code: 'printer.driver-crash',
      severity: 'critical',
      autoFix: 'нет',
      monitoring: 'реализовано',
      message: 'Сбой драйвера принтера',
    },
    {
      code: 'printer.conversion-failed',
      severity: 'warning',
      autoFix: 'Резервный вариант — placeholder PDF',
      monitoring: 'реализовано',
      message: 'LibreOffice/heic-convert недоступен или дал сбой при конвертации',
    },
    {
      code: 'printer.submit-timeout',
      severity: 'critical',
      autoFix: 'нет — повтор не помогает надёжнее (подтверждено тестами)',
      monitoring: 'реализовано',
      message: 'Отправка задания зависла — подтверждено воспроизводимо на реальном принтере',
    },
    {
      code: 'printer.interactive-port',
      severity: 'critical',
      autoFix: 'нет — это ошибка конфигурации, а не сбой соединения',
      monitoring: 'реализовано',
      message: 'Порт принтера требует участия человека (например, PORTPROMPT:)',
    },
  ],
  display: [
    {
      code: 'display.no-signal',
      severity: 'critical',
      autoFix: 'Каскад: перезапуск приложения → ОС → аппаратный цикл (не реализовано)',
      monitoring: 'не реализовано',
      message: 'Нет сигнала на экран',
    },
    {
      code: 'display.touch-unresponsive',
      severity: 'critical',
      autoFix: 'Каскад (не реализовано)',
      monitoring: 'не реализовано',
      message: 'Картинка есть, но сенсор не реагирует — самый незаметный случай',
    },
    {
      code: 'display.app-frozen',
      severity: 'critical',
      autoFix: 'Каскад (не реализовано)',
      monitoring: 'не реализовано',
      message: 'Завис именно слой интерфейса',
    },
    {
      code: 'display.asleep',
      severity: 'warning',
      autoFix: 'Каскад (не реализовано)',
      monitoring: 'не реализовано',
      message: 'Не проснулся после периода бездействия',
    },
  ],
  network: [
    {
      code: 'network.local-down',
      severity: 'critical',
      autoFix: 'нет — только детект и оповещение',
      monitoring: 'не реализовано',
      message: 'Локальная сеть/роутер павильона не работает',
    },
    {
      code: 'network.backend-unreachable',
      severity: 'critical',
      autoFix: 'нет',
      monitoring: 'не реализовано',
      message: 'Киоск не может достучаться до бэкенда на Railway',
    },
    {
      code: 'network.flapping',
      severity: 'warning',
      autoFix: 'нет — отслеживается как признак деградации оборудования',
      monitoring: 'не реализовано',
      message: 'Повторяющиеся короткие обрывы вместо одного чистого падения',
    },
  ],
  backend: [
    {
      code: 'backend.db-unreachable',
      severity: 'critical',
      autoFix: 'Backoff драйвера + обработчик ошибок пула — реализовано, подтверждено вживую',
      monitoring: 'реализовано',
      message: 'База данных недоступна',
    },
    {
      code: 'backend.db-pool-exhausted',
      severity: 'critical',
      autoFix: 'Backoff драйвера',
      monitoring: 'не подтверждено',
      message: 'Пул соединений с БД исчерпан',
    },
    {
      code: 'backend.clamav-unreachable',
      severity: 'warning',
      autoFix: 'Fail-open (dev) / fail-closed (prod) — по дизайну',
      monitoring: 'реализовано',
      message: 'ClamAV недоступен — WARNING в dev, CRITICAL в проде',
    },
    {
      code: 'backend.disk-full',
      severity: 'critical',
      autoFix: 'нет',
      monitoring: 'не реализовано',
      message: 'Заполнен диск Railway-volume под загрузки',
    },
    {
      code: 'backend.process-crash',
      severity: 'critical',
      autoFix: 'нет (ручной перезапуск процесса из панели — не автоматический)',
      monitoring: 'не реализовано',
      message: 'Падение процесса бэкенда',
    },
    {
      code: 'backend.scan-processing-failed',
      severity: 'info',
      autoFix: 'нет — нужна повторная попытка съёмки',
      monitoring: 'реализовано',
      message:
        'Сбой обработки страницы скана/копии (InvalidCornersError — info, остальное — warning)',
    },
    {
      code: 'backend.email-send-failed',
      severity: 'warning',
      autoFix: 'нет',
      monitoring: 'реализовано (не проверено вживую)',
      message: 'Реальная отправка через Resend не удалась',
    },
    {
      code: 'backend.unhandled-route-error',
      severity: 'critical',
      autoFix: 'нет — это отказоустойчивый перехватчик для непредвиденного',
      monitoring: 'реализовано',
      message: 'Catch-all middleware перехватил необработанную ошибку маршрута',
    },
  ],
  'payment-terminal': [
    {
      code: 'payment-terminal.offline',
      severity: 'critical',
      autoFix: 'TBD — зависит от выбранного провайдера',
      monitoring: 'не реализовано',
      message: 'Терминал офлайн',
    },
    {
      code: 'payment-terminal.transaction-timeout',
      severity: 'critical',
      autoFix: 'TBD',
      monitoring: 'не реализовано',
      message: 'Тайм-аут транзакции',
    },
    {
      code: 'payment-terminal.host-unreachable',
      severity: 'critical',
      autoFix: 'TBD',
      monitoring: 'не реализовано',
      message: 'Сетевой путь до платёжной системы недоступен',
    },
    {
      code: 'payment-terminal.certificate-expired',
      severity: 'critical',
      autoFix: 'TBD',
      monitoring: 'не реализовано',
      message: 'Истёк сертификат',
    },
    {
      code: 'payment-terminal.tamper-detected',
      severity: 'emergency',
      autoFix: 'TBD — терминал самостоятельно блокируется',
      monitoring: 'не реализовано',
      message: 'Физическая попытка вскрытия — не рядовой сбой',
    },
  ],
};

// Ports docs/screens/admin-panel-spec.md's Failure catalog screen — static
// reference content, not a live feed (that's the Incident log's job).
export function FailureCatalogScreen() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['printer']));

  const query = search.trim().toLowerCase();
  const isSearching = query.length > 0;

  function matches(entry: CatalogEntry): boolean {
    return entry.code.toLowerCase().includes(query) || entry.message.toLowerCase().includes(query);
  }

  function toggleGroup(source: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  return (
    <section className="view" id="view-catalog">
      <div className="view-header">
        <div>
          <h1 className="view-title">Справочник неисправностей</h1>
          <p className="view-sub">
            Статический справочник — не живая лента (для этого есть Лог инцидентов)
          </p>
        </div>
      </div>

      <input
        type="text"
        id="catalog-search"
        className="catalog-search"
        placeholder="Поиск по коду или описанию…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {SOURCE_ORDER.map((source) => {
        const entries = CATALOG[source];
        const visibleEntries = isSearching ? entries.filter(matches) : entries;
        if (isSearching && visibleEntries.length === 0) return null;
        const isOpen = isSearching || expanded.has(source);

        return (
          <div className="catalog-group" key={source}>
            <button
              type="button"
              id={`catalog-group-${source}`}
              className="catalog-group-head"
              onClick={() => toggleGroup(source)}
              disabled={isSearching}
            >
              <span>{SOURCE_NAMES[source]}</span>
              <span className="catalog-group-toggle">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && (
              <div className="catalog-entries">
                {visibleEntries.map((entry) => (
                  <div
                    className="catalog-entry"
                    id={`catalog-entry-${source}-${entry.code.split('.')[1]}`}
                    key={entry.code}
                  >
                    <div className="catalog-entry-top">
                      <span className="incident-code">{entry.code}</span>
                      <SevChip severity={entry.severity} />
                    </div>
                    <p className="catalog-entry-message">{entry.message}</p>
                    <div className="catalog-entry-meta">
                      <span>
                        <b>Авто-фикс:</b> {entry.autoFix}
                      </span>
                      <span>
                        <b>Мониторинг:</b> {entry.monitoring}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
