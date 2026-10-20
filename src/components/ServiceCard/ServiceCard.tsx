import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import styles from './ServiceCard.module.css';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import type { ServiceId, ServiceStatus } from '../../types/kiosk';

// See docs/design/component-library.md, Section 8. One card per service on
// Welcome: icon, name, a one-line hint of what it does, and an arrow — the
// whole card is the button. Not an instance of the reusable Button
// component (confirmed) — a native <button> is semantically right here.
interface ServiceCardProps {
  serviceId: ServiceId;
  title: string;
  /** What the service does, in a few words — read in the 2 seconds a
   * passer-by gives the screen. */
  hint?: string;
  icon?: ReactNode;
  /** A small tag over the card, e.g. "Free" on Scan. */
  tag?: string;
  status: ServiceStatus;
  onActivate?: () => void;
}

export function ServiceCard({
  serviceId,
  title,
  hint,
  icon,
  tag,
  status,
  onActivate,
}: ServiceCardProps) {
  const available = status === 'available';
  return (
    <button
      type="button"
      id={`service-${serviceId}`}
      className={styles.root}
      disabled={!available}
      onClick={onActivate}
    >
      {tag && available && <span className={styles.tag}>{tag}</span>}
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={styles.title}>{title}</span>
      {hint && <span className={styles.hint}>{hint}</span>}
      {available ? (
        <span className={styles.arrow} aria-hidden="true">
          <ArrowRight size={32} strokeWidth={2.25} />
        </span>
      ) : (
        <StatusBadge status={status} />
      )}
    </button>
  );
}
