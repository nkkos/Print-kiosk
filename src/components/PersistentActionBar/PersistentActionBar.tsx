import { useTranslation } from '../../i18n';
import styles from './PersistentActionBar.module.css';

// See docs/design/component-library.md, Section 9, and the approved
// Welcome Screen wireframe (Concept A, refined per docs/domain/kiosk-session.md):
// left group is reference/support actions, right group is user-specific
// actions (Account, Cart, Language). Plain text labels stand in for
// IconButton until an icon set is approved (Section 7).
//
// `btn-cart`, `btn-account`, and `language-switch` are wired to real actions
// (opens the Cart popup / Login panel / language picker — docs/screens/welcome-screen-spec.md,
// "btn-cart"/"btn-account"; docs/personal-account-requirements.md;
// docs/i18n-requirements.md). Help/Tariffs/Call operator have no confirmed
// destination yet, so they stay plain text.
interface PersistentActionBarProps {
  onCartActivate?: () => void;
  /** Shows a marker on btn-cart when the Cart has at least one item — same
   * star-marker pattern as the "used method" marker on Upload Method
   * Selection's cards (docs/upload-method-requirements.md). */
  cartHasItems?: boolean;
  onAccountActivate?: () => void;
  /** Shows the same star marker on btn-account when logged into an account
   * (docs/personal-account-requirements.md). */
  accountLoggedIn?: boolean;
  onLanguageActivate?: () => void;
}

export function PersistentActionBar({
  onCartActivate,
  cartHasItems = false,
  onAccountActivate,
  accountLoggedIn = false,
  onLanguageActivate,
}: PersistentActionBarProps) {
  const t = useTranslation();
  return (
    <div className={styles.root}>
      <div className={styles.group}>
        <span className={styles.item}>{t.footer.callOperator}</span>
        <span className={styles.item}>{t.footer.help}</span>
        <span className={styles.item}>{t.footer.tariffs}</span>
      </div>
      <div className={styles.group}>
        <button
          type="button"
          id="btn-account"
          className={`${styles.item} ${styles.plainButton}`}
          onClick={onAccountActivate}
        >
          {t.footer.account}
          {accountLoggedIn && (
            <span className={styles.marker} aria-hidden="true">
              ★
            </span>
          )}
        </button>
        <button
          type="button"
          id="btn-cart"
          className={`${styles.item} ${styles.plainButton}`}
          onClick={onCartActivate}
        >
          {t.footer.cart}
          {cartHasItems && (
            <span className={styles.marker} aria-hidden="true">
              ★
            </span>
          )}
        </button>
        <button
          type="button"
          id="language-switch"
          className={`${styles.item} ${styles.plainButton}`}
          onClick={onLanguageActivate}
        >
          {t.footer.language}
        </button>
      </div>
    </div>
  );
}
