import { useTranslation } from '../../i18n';
import styles from './EndingSessionScreen.module.css';

// Shown while a Kiosk Session is being cleaned up, after End Session is
// confirmed — see docs/domain/kiosk-session.md: "an 'ending session'
// indicator screen is shown while cleanup runs; only after cleanup
// completes does the kiosk transition to its initial idle state." No
// header/footer/Cart here: nothing is actionable while the session is being
// torn down. App.tsx times this out after a fixed prototype delay, since
// there's no real cleanup work to await yet.
export function EndingSessionScreen() {
  const t = useTranslation();
  return (
    <div className={styles.root}>
      <p className={styles.message}>{t.endingSession.message}</p>
    </div>
  );
}
