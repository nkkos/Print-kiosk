import { useContext } from 'react';
import {
  ChevronDown,
  CircleHelp,
  CircleUserRound,
  Globe,
  ReceiptText,
  ShoppingCart,
} from 'lucide-react';
import { LANGUAGE_NAMES, useTranslation } from '../../i18n';
import { LanguageContext } from '../../i18n/context';
import styles from './PersistentActionBar.module.css';

// The always-there footer (docs/screens/welcome-screen-spec.md). Icon +
// label on every item, so a first-time customer reads it at a glance.
// btn-call-operator is left out until it has something to do — the
// remote intercom isn't built (docs/design/kiosk-redesign-plan.md).
interface PersistentActionBarProps {
  onCartActivate?: () => void;
  /** Items in the Cart — shown as a count on btn-cart. */
  cartCount?: number;
  onAccountActivate?: () => void;
  /** Logged into an account (docs/personal-account-requirements.md). */
  accountLoggedIn?: boolean;
  onLanguageActivate?: () => void;
  onHelpActivate?: () => void;
  onTariffsActivate?: () => void;
}

const ICON = { size: 30, strokeWidth: 1.75 } as const;

export function PersistentActionBar({
  onCartActivate,
  cartCount = 0,
  onAccountActivate,
  accountLoggedIn = false,
  onLanguageActivate,
  onHelpActivate,
  onTariffsActivate,
}: PersistentActionBarProps) {
  const t = useTranslation();
  const language = useContext(LanguageContext);
  return (
    <nav className={styles.root}>
      <div className={styles.group}>
        <button type="button" id="btn-help" className={styles.item} onClick={onHelpActivate}>
          <CircleHelp {...ICON} aria-hidden="true" />
          {t.footer.help}
        </button>
        <button type="button" id="btn-tariffs" className={styles.item} onClick={onTariffsActivate}>
          <ReceiptText {...ICON} aria-hidden="true" />
          {t.footer.tariffs}
        </button>
      </div>
      <div className={styles.group}>
        <button
          type="button"
          id="btn-account"
          className={styles.item}
          data-active={accountLoggedIn || undefined}
          onClick={onAccountActivate}
        >
          <CircleUserRound {...ICON} aria-hidden="true" />
          {t.footer.account}
        </button>
        <button type="button" id="btn-cart" className={styles.item} onClick={onCartActivate}>
          <span className={styles.iconWrap}>
            <ShoppingCart {...ICON} aria-hidden="true" />
            {cartCount > 0 && <span className={styles.count}>{cartCount}</span>}
          </span>
          {t.footer.cart}
        </button>
        <button
          type="button"
          id="language-switch"
          className={styles.item}
          onClick={onLanguageActivate}
          aria-label={t.footer.language}
        >
          <Globe {...ICON} aria-hidden="true" />
          {LANGUAGE_NAMES[language]}
          <ChevronDown size={22} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
