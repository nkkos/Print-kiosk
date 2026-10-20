import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import styles from './OptionCard.module.css';

// See docs/design/component-library.md, Section 17.
// Structurally similar to ServiceCard but generic — used for in-flow
// choices rather than the kiosk's core services, so its identifier is a
// plain string supplied by the caller rather than a fixed union type.
interface OptionCardProps {
  id: string;
  title: string;
  description: string;
  onActivate?: () => void;
  /** Shows a marker (docs/upload-method-requirements.md: "a marker (e.g., a
   * star) if that method has been used at least once during the current
   * Kiosk Session" — exact visual treatment was left open there). Only
   * meaningful for Upload Method Selection's cards; omitted elsewhere. */
  used?: boolean;
  /** Not yet selectable — e.g. a received file still being antivirus-scanned
   * (docs/domain/kiosk-session.md, "File scanning status"). */
  disabled?: boolean; /** `large`: a big tappable card with an icon and an arrow, like Welcome's
   * ServiceCards — for a screen whose whole job is one choice (Upload
   * Method Selection). Default: the compact list card. */
  size?: 'default' | 'large';
  icon?: ReactNode;
  /** Text for the "used" marker on large cards (the compact one keeps ★). */
  usedLabel?: string;
}

export function OptionCard({
  id,
  title,
  description,
  onActivate,
  used = false,
  disabled = false,
  size = 'default',
  icon,
  usedLabel,
}: OptionCardProps) {
  if (size === 'large') {
    return (
      <button
        type="button"
        id={id}
        className={`${styles.root} ${styles.large}`}
        onClick={onActivate}
        disabled={disabled}
      >
        {used && usedLabel && <span className={styles.usedTag}>{usedLabel}</span>}
        {icon && (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        )}
        <span className={styles.largeTitle}>{title}</span>
        <span className={styles.largeDescription}>{description}</span>
        <span className={styles.arrow} aria-hidden="true">
          <ArrowRight size={32} strokeWidth={2.25} />
        </span>
      </button>
    );
  }
  return (
    <button type="button" id={id} className={styles.root} onClick={onActivate} disabled={disabled}>
      {used && (
        <span className={styles.marker} aria-hidden="true">
          ★
        </span>
      )}
      <span className={styles.title}>{title}</span>
      <span className={styles.description}>{description}</span>
    </button>
  );
}
