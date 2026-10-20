import type { ReactNode } from 'react';
import styles from './StepList.module.css';

// "How to" steps beside a QR code (QR upload, e-mail, scan, copy) — a
// numbered card per step: what to do, in a few words. Pictures are icons
// with no words in them, so every step reads in all five languages.
export interface Step {
  icon: ReactNode;
  title: string;
  text: string;
}

export function StepList({ steps, id }: { steps: Step[]; id?: string }) {
  return (
    <ol className={styles.root} id={id}>
      {steps.map((step, index) => (
        <li className={styles.step} key={step.title}>
          <span className={styles.icon} aria-hidden="true">
            {step.icon}
          </span>
          <span className={styles.number} aria-hidden="true">
            {index + 1}
          </span>
          <span className={styles.body}>
            <span className={styles.title}>{step.title}</span>
            <span className={styles.text}>{step.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
