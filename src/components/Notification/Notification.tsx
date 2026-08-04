import styles from './Notification.module.css';

// See docs/design/component-library.md, Section 13. Presentational content
// only — rendered inside the shared Modal shell (Modal's own Close button
// satisfies "a close button/icon" here), the same composition already used
// for CartPanel. No color-per-variant styling yet — no confirmed Design
// System values (`data-variant` is a hook for later).
interface NotificationProps {
  /** e.g. `notification-service-unavailable` (docs/screens/welcome-screen-spec.md). */
  id?: string;
  title: string;
  message: string;
  variant?: 'informational' | 'warning' | 'error' | 'success';
}

export function Notification({ id, title, message, variant = 'informational' }: NotificationProps) {
  return (
    <div id={id} className={styles.root} data-variant={variant}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
    </div>
  );
}
