import styles from './OptionCard.module.css';

// See docs/design/component-library.md, Section 17.
// Structurally similar to ServiceCard but generic — used for in-flow
// choices rather than the kiosk's core services, so its identifier is a
// plain string supplied by the caller rather than a fixed union type.
// No status/disabled variant yet, since no confirmed use case requires one.
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
}

export function OptionCard({ id, title, description, onActivate, used = false }: OptionCardProps) {
  return (
    <button type="button" id={id} className={styles.root} onClick={onActivate}>
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
