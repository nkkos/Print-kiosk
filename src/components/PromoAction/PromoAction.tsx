import styles from './PromoAction.module.css';

// Placeholder only — see docs/design/component-library.md, Section 11.
// TODO: render nothing when no promotion is active; content/action supplied by
// the active promotion once one exists.
export function PromoAction() {
  return <div className={styles.root}>PromoAction</div>;
}
