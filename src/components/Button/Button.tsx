import type { ReactNode } from 'react';
import styles from './Button.module.css';

// Three weights (docs/design/design-system.md, Section 9): `primary` for the
// one thing a screen wants done next, `secondary` for real alternatives,
// `ghost` for quiet navigation (Back/Home). Defaults to `secondary`, which
// is what every Button rendered before the variants existed looked like.
interface ButtonProps {
  id?: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  /** An icon (lucide-react) shown before the label. */
  icon?: ReactNode;
  /** An icon shown after the label — e.g. an arrow on a "next" action. */
  trailingIcon?: ReactNode;
}

export function Button({
  id,
  label,
  onClick,
  disabled = false,
  variant = 'secondary',
  icon,
  trailingIcon,
}: ButtonProps) {
  return (
    <button
      type="button"
      id={id}
      className={`${styles.root} ${styles[variant]}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{label}</span>
      {trailingIcon && (
        <span className={styles.icon} aria-hidden="true">
          {trailingIcon}
        </span>
      )}
    </button>
  );
}
