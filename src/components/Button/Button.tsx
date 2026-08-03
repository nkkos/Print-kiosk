import styles from './Button.module.css';

// See docs/design/component-library.md, Section 6.
// Minimal implementation: label + onClick only. No variant prop yet — no
// confirmed use case requires differentiating primary/secondary/tertiary/
// danger at this stage (see docs/screens/upload-method-selection-spec.md,
// Navigation "Terminology note": navigation-back's visual form is not
// determined by its identifier).
interface ButtonProps {
  id?: string;
  label: string;
  onClick?: () => void;
}

export function Button({ id, label, onClick }: ButtonProps) {
  return (
    <button type="button" id={id} className={styles.root} onClick={onClick}>
      {label}
    </button>
  );
}
