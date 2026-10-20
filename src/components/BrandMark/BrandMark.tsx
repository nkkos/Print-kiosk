import { Printer } from 'lucide-react';
import styles from './BrandMark.module.css';

// TODO: "Future Print" is the working name from the product owner's screen
// pack (2026-10), not a confirmed brand — swap for the real name and logo
// once decided (docs/design/kiosk-redesign-plan.md, open decisions).
const BRAND_NAME = 'Future Print';

export function BrandMark() {
  return (
    <div className={styles.root}>
      <span className={styles.logo} aria-hidden="true">
        <Printer size={30} strokeWidth={2} />
      </span>
      <span className={styles.name}>{BRAND_NAME}</span>
    </div>
  );
}
