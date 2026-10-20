import {
  ArrowRight,
  BadgeEuro,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Printer,
} from 'lucide-react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { OrderSteps } from '../../components/OrderSteps/OrderSteps';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder } from '../../types/kiosk';
import type { PrintTask, PrintTaskErrorReason } from '../../services/printApi';
import { formatEuroCents } from '../../utils/pricing';
import { ReceiptPanel } from './ReceiptPanel';
import styles from './PrintStatusScreen.module.css';

// Print Status screen — see docs/domain/kiosk-session.md: "Print Status has
// no Back action (or it is disabled) — this screen is fully
// system-controlled; the persistent footer ... remains accessible
// regardless." No navigation-back/navigation-home here at all. End Session
// stays blocked (sessionActive=false) while the transaction is committed —
// until the order is delivered, i.e. printed into its bin ('succeeded'),
// per the same doc's "Blocked during a committed transaction". From then on
// End Session and the inactivity timeout work again, so a customer who walks
// away without tapping "Continue" doesn't leave the session — and its bin,
// released when the session ends (server/sessionLifecycle.ts) — open forever.
// A failure is resolved by the automatic refund of the failed items
// (docs/payments-business-requirements.md, "When printing fails") — once
// every task has finished and no refund is still in flight, the session can
// end again; a refund that didn't go through is staff's to finish, they're
// alerted on Telegram. There is no "Retry": a failed item's money is
// already on its way back.
//
// Step 5 of the print path (2026-10 redesign, docs/design/kiosk-redesign-plan.md):
// one big card that says what's happening — printing, which bin to take the
// documents from, or what went wrong and that the money is on its way back —
// and the receipt beside it.
//
// Real backend (server/printerAdapter.ts): App.tsx submits a Print Task
// automatically on entering this screen and polls its status. Only
// job-submission is real — a plain OS print API gives no reliable
// in-progress signal (jam, out of paper/ink), so those outcomes stay manual
// "Simulate ..." buttons, available while the task is still queued/printing.
interface PrintStatusScreenProps {
  cartItems: PrintOrder[];
  /** One Print Task per item being printed this visit (App.tsx's
   * `printingItems`) — aggregated below into a single displayed status. */
  printTasks: PrintTask[];
  /** The payment whose receipt to show (src/features/print-status/ReceiptPanel.tsx). */
  receiptPaymentId: string | null;
  onPrintComplete: () => void;
  onSimulatePrintOutcome: (
    outcome: 'success' | 'paper-jam' | 'out-of-paper' | 'out-of-ink',
  ) => void;
  onEndSession: (reason: EndSessionReason) => void;
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

const HIDE_PRINT_SIMULATE = import.meta.env.VITE_HIDE_PRINT_SIMULATE === 'true';

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
    case 'printer-error':
      return t.printStatus.errorPrinterError;
    default:
      return t.printStatus.errorSubmitFailed;
  }
}

export function PrintStatusScreen({
  cartItems,
  printTasks,
  receiptPaymentId,
  onPrintComplete,
  onSimulatePrintOutcome,
  onEndSession,
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
  // task is non-terminal; once all have finished, 'failed' if any failed
  // (its reason and the refund are shown), else 'succeeded'.
  const allFinished =
    printTasks.length > 0 &&
    printTasks.every((task) => task.status === 'succeeded' || task.status === 'failed');
  const failedTasks = printTasks.filter((task) => task.status === 'failed');
  const status: PrintTask['status'] =
    printTasks.length === 0
      ? 'queued'
      : !allFinished
        ? 'printing'
        : failedTasks.length > 0
          ? 'failed'
          : 'succeeded';
  const anyPrinted = printTasks.some((task) => task.status === 'succeeded');
  const refundedCents = failedTasks
    .filter((task) => task.refund?.status === 'succeeded')
    .reduce((sum, task) => sum + (task.refund?.amountCents ?? 0), 0);
  const refundPending = failedTasks.some((task) => task.refund?.status === 'pending');
  const refundFailed = failedTasks.some((task) => task.refund?.status === 'failed');
  // Failed with no refund at all: a portal order paid in advance — it
  // stays in My orders.
  const prepaidNotPrinted = failedTasks.some((task) => !task.refund);

  // Pavilion launch plan (2026-09-16): all tasks in one batch share a
  // single mailbox bin (server/pickupBins.ts's reuse-by-session logic), so
  // the first non-null one found is the batch's bin — null here means
  // every bin is currently occupied by someone else's still-uncollected
  // order, not that printing hasn't started (that distinction is what
  // isWaitingForBin below is for, since "queued"/"printing" alone doesn't
  // say which).
  const binNumber = printTasks.find((task) => task.binNumber != null)?.binNumber ?? null;
  const isWaitingForBin =
    printTasks.length > 0 && binNumber == null && (status === 'queued' || status === 'printing');

  return (
    <KioskScreenLayout
      sessionActive={status === 'succeeded' || (status === 'failed' && !refundPending)}
      onEndSession={onEndSession}
      cartItems={cartItems}
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
      <div className={styles.top}>
        <h1 className={styles.title}>{t.printStatus.title}</h1>
        <OrderSteps current="print" />
      </div>

      <div className={receiptPaymentId ? styles.columns : styles.single}>
        <section className={styles.stage} id="print-stage" data-status={status}>
          {(status === 'queued' || status === 'printing') && (
            <>
              <span className={`${styles.badge} ${styles.badgeAccent}`} aria-hidden="true">
                <Printer size={80} strokeWidth={1.5} />
                <span className={styles.sheet} />
              </span>
              <h2 className={styles.message} role="status">
                {isWaitingForBin
                  ? t.printStatus.waitingForBinMessage
                  : t.printStatus.printingMessage}
              </h2>
              {binNumber != null && (
                <p className={styles.lead}>{t.printStatus.printingBinHint(binNumber)}</p>
              )}
              <span className={styles.progress} aria-hidden="true">
                <span className={styles.progressBar} />
              </span>
            </>
          )}

          {status === 'succeeded' && (
            <>
              {binNumber != null ? (
                <span className={styles.bin} id="print-bin">
                  <span className={styles.binLabel}>{t.printStatus.binLabel}</span>
                  <span className={styles.binNumber}>{binNumber}</span>
                </span>
              ) : (
                <span className={`${styles.badge} ${styles.badgeSuccess}`} aria-hidden="true">
                  <CircleCheck size={80} strokeWidth={1.5} />
                </span>
              )}
              <h2 className={styles.message} role="status">
                {binNumber != null
                  ? t.printStatus.readyForPickupMessage(binNumber)
                  : t.printStatus.succeededMessage}
              </h2>
              {/* With a bin, "Continue" also marks it collected (App.tsx's
                  handlePrintComplete) — so it says exactly that. */}
              <Button
                id="print-continue"
                variant="primary"
                label={
                  binNumber != null
                    ? t.printStatus.confirmPickedUpLabel
                    : t.printStatus.continueLabel
                }
                trailingIcon={<ArrowRight size={24} />}
                onClick={onPrintComplete}
              />
            </>
          )}

          {status === 'failed' && (
            <>
              <span className={`${styles.badge} ${styles.badgeWarning}`} aria-hidden="true">
                <CircleAlert size={80} strokeWidth={1.5} />
              </span>
              <h2 className={styles.message} role="status">
                {errorMessage(t, failedTasks[0]?.errorReason ?? null)}
              </h2>
              {anyPrinted && (
                <p className={styles.lead}>
                  {t.printStatus.partlyPrinted}{' '}
                  {binNumber != null && t.printStatus.readyForPickupMessage(binNumber)}
                </p>
              )}
              {refundedCents > 0 && (
                <p className={`${styles.note} ${styles.noteSuccess}`} id="print-refunded">
                  <BadgeEuro size={28} aria-hidden="true" />
                  {t.printStatus.refunded(formatEuroCents(refundedCents))}
                </p>
              )}
              {refundPending && (
                <p className={styles.note}>
                  <LoaderCircle className={styles.spin} size={28} aria-hidden="true" />
                  {t.printStatus.refundPending}
                </p>
              )}
              {refundFailed && (
                <p className={`${styles.note} ${styles.noteWarning}`} id="print-refund-failed">
                  {t.printStatus.refundFailed}
                </p>
              )}
              {prepaidNotPrinted && <p className={styles.note}>{t.printStatus.prepaidKept}</p>}
              <Button
                id="print-continue"
                variant="primary"
                label={t.printStatus.continueLabel}
                trailingIcon={<ArrowRight size={24} />}
                onClick={onPrintComplete}
                disabled={refundPending}
              />
            </>
          )}

          {/* Scaffolding for testing without a real printer. The real
              outcome comes from the pavilion print agent (agent/); set
              VITE_HIDE_PRINT_SIMULATE=true for customer-facing builds. */}
          {(status === 'queued' || status === 'printing') && !HIDE_PRINT_SIMULATE && (
            <div className={styles.simulate} data-dev-only>
              <span className={styles.simulateLabel}>test</span>
              {/* Disabled until the submission itself has actually returned a
                  task (status === 'queued' means it's still in flight — e.g.
                  waiting on document conversion, server/documentConverter.ts,
                  which can take tens of seconds) — clicking earlier had
                  nothing to act on yet and silently did nothing. */}
              <Button
                id="print-simulate-success"
                variant="ghost"
                label="Simulate success"
                onClick={() => onSimulatePrintOutcome('success')}
                disabled={isConnectionLost || status === 'queued'}
              />
              <Button
                id="print-simulate-paper-jam"
                variant="ghost"
                label="Simulate paper jam"
                onClick={() => onSimulatePrintOutcome('paper-jam')}
                disabled={isConnectionLost || status === 'queued'}
              />
              <Button
                id="print-simulate-out-of-paper"
                variant="ghost"
                label="Simulate out of paper"
                onClick={() => onSimulatePrintOutcome('out-of-paper')}
                disabled={isConnectionLost || status === 'queued'}
              />
              <Button
                id="print-simulate-out-of-ink"
                variant="ghost"
                label="Simulate out of ink"
                onClick={() => onSimulatePrintOutcome('out-of-ink')}
                disabled={isConnectionLost || status === 'queued'}
              />
            </div>
          )}
        </section>

        {receiptPaymentId && (
          <aside className={styles.receiptCard}>
            <h2 className={styles.receiptTitle}>{t.printStatus.receiptTitle}</h2>
            <ReceiptPanel paymentId={receiptPaymentId} />
          </aside>
        )}
      </div>
    </KioskScreenLayout>
  );
}
