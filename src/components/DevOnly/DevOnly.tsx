import type { ReactNode } from 'react';
import styles from './DevOnly.module.css';

// Prototype scaffolding — the "Simulate …" buttons that stand in for a
// backend outcome (CLAUDE.md, "Mock/prototype conventions"). Fenced off in a
// dashed tray so nobody mistakes them for part of the design, and gone
// entirely from customer-facing builds (VITE_HIDE_SIMULATE=true).
const HIDE_SIMULATE = import.meta.env.VITE_HIDE_SIMULATE === 'true';

export function DevOnly({ children }: { children: ReactNode }) {
  if (HIDE_SIMULATE) return null;
  return (
    <div className={styles.root} data-dev-only>
      <span className={styles.label}>test</span>
      {children}
    </div>
  );
}
