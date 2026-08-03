import styles from './PersistentActionBar.module.css';

// See docs/design/component-library.md, Section 9, and the approved
// Welcome Screen wireframe (Concept A, refined per docs/domain/kiosk-session.md):
// left group is reference/support actions, right group is user-specific
// actions (Account, Cart, Language). Plain text labels stand in for
// IconButton until an icon set is approved (Section 7).
//
// Only `btn-cart` is wired to a real action so far (opens the Cart popup —
// docs/screens/welcome-screen-spec.md, "btn-cart"). Account/Help/Tariffs/
// Language/Call operator have no confirmed destination yet, so they stay
// plain text.
interface PersistentActionBarProps {
  onCartActivate?: () => void;
}

export function PersistentActionBar({ onCartActivate }: PersistentActionBarProps) {
  return (
    <div className={styles.root}>
      <div className={styles.group}>
        <span className={styles.item}>Call operator</span>
        <span className={styles.item}>Help</span>
        <span className={styles.item}>Tariffs</span>
      </div>
      <div className={styles.group}>
        <span className={styles.item}>Account</span>
        <button
          type="button"
          id="btn-cart"
          className={`${styles.item} ${styles.cartButton}`}
          onClick={onCartActivate}
        >
          Cart
        </button>
        <span className={styles.item}>Language</span>
      </div>
    </div>
  );
}
