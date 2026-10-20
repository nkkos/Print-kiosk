import { Check } from 'lucide-react';
import { useTranslation } from '../../i18n';
import styles from './OrderSteps.module.css';

// Where the customer is in the print path — Files → Settings → Review →
// Payment → Printing (docs/design/kiosk-redesign-plan.md, open decision 5;
// shown from batch 3 by default). Done steps get a tick, the current one is
// filled; nothing here is tappable, it only tells the customer how far along
// they are.
export type OrderStep = 'files' | 'settings' | 'review' | 'payment' | 'print';

const STEPS: OrderStep[] = ['files', 'settings', 'review', 'payment', 'print'];

export function OrderSteps({ current }: { current: OrderStep }) {
  const t = useTranslation();
  const labels: Record<OrderStep, string> = {
    files: t.common.stepFiles,
    settings: t.common.stepSettings,
    review: t.common.stepReview,
    payment: t.common.stepPayment,
    print: t.common.stepPrint,
  };
  const currentIndex = STEPS.indexOf(current);

  return (
    <ol className={styles.root} id="order-steps">
      {STEPS.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'next';
        return (
          <li
            key={step}
            className={`${styles.step} ${styles[state]}`}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className={styles.marker} aria-hidden="true">
              {state === 'done' ? <Check size={18} strokeWidth={3} /> : index + 1}
            </span>
            <span className={styles.label}>{labels[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}
