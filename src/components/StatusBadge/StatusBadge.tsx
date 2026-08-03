import styles from './StatusBadge.module.css';
import type { ServiceStatus } from '../../types/kiosk';

// See docs/design/component-library.md, Section 14.
// 'available' is intentionally excluded — ServiceCard does not render a badge
// for the available state.
interface StatusBadgeProps {
  status: Exclude<ServiceStatus, 'available'>;
}

const STATUS_LABEL: Record<StatusBadgeProps['status'], string> = {
  'coming-soon': 'Coming soon',
  unavailable: 'Unavailable',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={styles.root}>{STATUS_LABEL[status]}</span>;
}
