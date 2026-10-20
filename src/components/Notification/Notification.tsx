import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react';
import styles from './Notification.module.css';

// See docs/design/component-library.md, Section 13. Rendered inside the
// shared Modal shell (Modal's own Close button satisfies "a close
// button/icon" here). 2026-10 redesign: an icon in a tinted circle that
// says the kind at a glance, a short title and message, and — when the
// notification asks for a decision — its buttons underneath (`children`).
interface NotificationProps {
  /** e.g. `notification-service-unavailable` (docs/screens/welcome-screen-spec.md). */
  id?: string;
  title: string;
  message: string;
  variant?: 'informational' | 'warning' | 'error' | 'success';
  /** Replaces the variant's own icon — e.g. a countdown. */
  badge?: ReactNode;
  children?: ReactNode;
}

const ICONS = {
  informational: Info,
  warning: CircleAlert,
  error: CircleX,
  success: CircleCheck,
} as const;

export function Notification({
  id,
  title,
  message,
  variant = 'informational',
  badge,
  children,
}: NotificationProps) {
  const Icon = ICONS[variant];
  return (
    <div id={id} className={styles.root} data-variant={variant}>
      <span className={styles.badge} aria-hidden="true">
        {badge ?? <Icon size={56} strokeWidth={1.75} />}
      </span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
      {children && <div className={styles.actions}>{children}</div>}
    </div>
  );
}
