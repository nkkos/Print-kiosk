import styles from './StatusBadge.module.css';
import { useTranslation } from '../../i18n';
import type { ServiceStatus } from '../../types/kiosk';

// See docs/design/component-library.md, Section 14.
// 'available' is intentionally excluded — ServiceCard does not render a badge
// for the available state.
interface StatusBadgeProps {
  status: Exclude<ServiceStatus, 'available'>;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const t = useTranslation();
  const STATUS_LABEL: Record<StatusBadgeProps['status'], string> = {
    'coming-soon': t.common.comingSoon,
    unavailable: t.common.unavailable,
  };
  return <span className={`${styles.root} ${styles[status]}`}>{STATUS_LABEL[status]}</span>;
}
