import { LoaderCircle } from 'lucide-react';
import { SystemScreen } from '../../components/SystemScreen/SystemScreen';
import { useTranslation } from '../../i18n';
import styles from './EndingSessionScreen.module.css';

// Shown while a Kiosk Session is being cleaned up, after End Session is
// confirmed — see docs/domain/kiosk-session.md: "an 'ending session'
// indicator screen is shown while cleanup runs; only after cleanup
// completes does the kiosk transition to its initial idle state." No
// header/footer/Cart here: nothing is actionable while the session is being
// torn down. App.tsx holds it for at least a short delay, joined with the
// real cleanup request.
export function EndingSessionScreen() {
  const t = useTranslation();
  return (
    <SystemScreen
      id="ending-session"
      icon={<LoaderCircle className={styles.spin} size={80} strokeWidth={1.5} />}
      title={t.endingSession.message}
      text={t.endingSession.hint}
    />
  );
}
