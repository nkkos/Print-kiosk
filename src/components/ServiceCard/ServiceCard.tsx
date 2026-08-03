import styles from './ServiceCard.module.css';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import type { ServiceId, ServiceStatus } from '../../types/kiosk';

// See docs/design/component-library.md, Section 8.
// Not an instance of the reusable Button component (confirmed) — uses a
// native <button> internally, which is semantically appropriate here.
interface ServiceCardProps {
  /** Which confirmed service this card represents. */
  serviceId: ServiceId;
  /** Visible title, e.g. "Print". */
  title: string;
  /** Current status: available | coming-soon | unavailable. */
  status: ServiceStatus;
  /** Called on activation. Only reachable when status is "available". */
  onActivate?: () => void;
}

export function ServiceCard({ serviceId, title, status, onActivate }: ServiceCardProps) {
  return (
    <button
      type="button"
      id={`service-${serviceId}`}
      className={styles.root}
      disabled={status !== 'available'}
      onClick={onActivate}
    >
      <span className={styles.title}>{title}</span>
      {status !== 'available' && <StatusBadge status={status} />}
    </button>
  );
}
