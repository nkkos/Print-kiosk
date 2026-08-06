import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder } from '../../types/kiosk';
import type { PrintTask, PrintTaskErrorReason } from '../../services/printApi';
import styles from './PrintStatusScreen.module.css';

// Print Status screen — see docs/domain/kiosk-session.md: "Print Status has
// no Back action (or it is disabled) — this screen is fully
// system-controlled; the persistent footer ... remains accessible
// regardless." No navigation-back/navigation-home here at all, and
// end-session stays hidden (sessionActive=false) — the transaction is still
// committed until the order is delivered.
//
// Real backend (server/printerAdapter.ts): App.tsx submits a Print Task
// automatically on entering this screen and polls its status. Only
// job-submission is real — a plain OS print API gives no reliable
// in-progress signal (jam, out of paper/ink), so those outcomes stay manual
// "Simulate ..." buttons, available while the task is still queued/printing.
interface PrintStatusScreenProps {
  cartItems: PrintOrder[];
  onQuantityChange: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  /** One Print Task per item being printed this visit (App.tsx's
   * `printingItems`) — aggregated below into a single displayed status. */
  printTasks: PrintTask[];
  onPrintComplete: () => void;
  onRetryPrint: () => void;
  onSimulatePrintOutcome: (
    outcome: 'success' | 'paper-jam' | 'out-of-paper' | 'out-of-ink',
  ) => void;
  onEndSession: (reason: EndSessionReason) => void;
  onProceedToPayment: (selectedItems: PrintOrder[]) => void;
  /** While true, printing-related actions are disabled — printing is one of
   * the two actions connection loss actually blocks (docs/domain/kiosk-session.md,
   * "Failure and recovery"). */
  isConnectionLost: boolean;
  onSimulateConnectionLost: () => void;
  onSimulateConnectionRestored: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  accountId: string | null;
  /** Navigates to the Personal Account screen (docs/personal-account-requirements.md)
   * — used by the footer's btn-account. */
  onGoToPersonalAccount: () => void;
  hasPendingPaidOrders: boolean;
  onDismissPaidOrdersPrompt: () => void;
  onGoToPaidOrders: () => void;
  onLanguageChange: (language: Language) => void;
}

function errorMessage(
  t: ReturnType<typeof useTranslation>,
  reason: PrintTaskErrorReason | null,
): string {
  switch (reason) {
    case 'printer-not-found':
      return t.printStatus.errorPrinterNotFound;
    case 'paper-jam':
      return t.printStatus.errorPaperJam;
    case 'out-of-paper':
      return t.printStatus.errorOutOfPaper;
    case 'out-of-ink':
      return t.printStatus.errorOutOfInk;
    case 'conversion-failed':
      return t.printStatus.errorConversionFailed;
    default:
      return t.printStatus.errorSubmitFailed;
  }
}

export function PrintStatusScreen({
  cartItems,
  onQuantityChange,
  onRemoveItem,
  printTasks,
  onPrintComplete,
  onRetryPrint,
  onSimulatePrintOutcome,
  onEndSession,
  onProceedToPayment,
  isConnectionLost,
  onSimulateConnectionLost,
  onSimulateConnectionRestored,
  onLogin,
  accountId,
  onGoToPersonalAccount,
  hasPendingPaidOrders,
  onDismissPaidOrdersPrompt,
  onGoToPaidOrders,
  onLanguageChange,
}: PrintStatusScreenProps) {
  const t = useTranslation();
  // Aggregated across every task in the batch: still 'printing' while any
  // task is non-terminal, 'failed' if any task failed (its reason is shown),
  // 'succeeded' only once every task has succeeded.
  const failedTask = printTasks.find((task) => task.status === 'failed');
  const status: PrintTask['status'] =
    printTasks.length === 0
      ? 'queued'
      : failedTask
        ? 'failed'
        : printTasks.every((task) => task.status === 'succeeded')
          ? 'succeeded'
          : 'printing';

  return (
    <KioskScreenLayout
      sessionActive={false}
      onEndSession={onEndSession}
      cartItems={cartItems}
      onQuantityChange={onQuantityChange}
      onRemoveItem={onRemoveItem}
      onProceedToPayment={onProceedToPayment}
      isConnectionLost={isConnectionLost}
      onSimulateConnectionLost={onSimulateConnectionLost}
      onSimulateConnectionRestored={onSimulateConnectionRestored}
      onLogin={onLogin}
      accountId={accountId}
      onGoToPersonalAccount={onGoToPersonalAccount}
      hasPendingPaidOrders={hasPendingPaidOrders}
      onDismissPaidOrdersPrompt={onDismissPaidOrdersPrompt}
      onGoToPaidOrders={onGoToPaidOrders}
      onLanguageChange={onLanguageChange}
    >
      <div className={styles.body}>
        {status === 'succeeded' && (
          <>
            <p className={styles.message}>{t.printStatus.succeededMessage}</p>
            <Button
              id="print-continue"
              label={t.printStatus.continueLabel}
              onClick={onPrintComplete}
            />
          </>
        )}
        {status === 'failed' && (
          <>
            <p className={styles.message}>{errorMessage(t, failedTask?.errorReason ?? null)}</p>
            <Button
              id="print-retry"
              label={t.printStatus.retry}
              onClick={onRetryPrint}
              disabled={isConnectionLost}
            />
          </>
        )}
        {(status === 'queued' || status === 'printing') && (
          <>
            <p className={styles.message}>{t.printStatus.printingMessage}</p>
            {/* Disabled until the submission itself has actually returned a
                task (status === 'queued' means it's still in flight — e.g.
                waiting on document conversion, server/documentConverter.ts,
                which can take tens of seconds) — clicking earlier had
                nothing to act on yet and silently did nothing. */}
            <Button
              id="print-simulate-success"
              label="Simulate success"
              onClick={() => onSimulatePrintOutcome('success')}
              disabled={isConnectionLost || status === 'queued'}
            />
            <Button
              id="print-simulate-paper-jam"
              label="Simulate paper jam"
              onClick={() => onSimulatePrintOutcome('paper-jam')}
              disabled={isConnectionLost || status === 'queued'}
            />
            <Button
              id="print-simulate-out-of-paper"
              label="Simulate out of paper"
              onClick={() => onSimulatePrintOutcome('out-of-paper')}
              disabled={isConnectionLost || status === 'queued'}
            />
            <Button
              id="print-simulate-out-of-ink"
              label="Simulate out of ink"
              onClick={() => onSimulatePrintOutcome('out-of-ink')}
              disabled={isConnectionLost || status === 'queued'}
            />
          </>
        )}
      </div>
    </KioskScreenLayout>
  );
}
