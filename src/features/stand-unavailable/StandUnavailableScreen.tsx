import { MonitorX } from 'lucide-react';
import { SystemScreen } from '../../components/SystemScreen/SystemScreen';
import { useTranslation } from '../../i18n';
import styles from './StandUnavailableScreen.module.css';

// Shown when the backend doesn't recognise this browser as a kiosk stand —
// it never opened its stand link (?stand=A&key=…), or the key was changed
// (server/security.ts, STAND_API_KEYS; src/services/standAuth.ts). Nothing
// a customer can do here, so no header/footer/Cart, like
// EndingSessionScreen; the small line tells staff what to fix.
export function StandUnavailableScreen() {
  const t = useTranslation();
  return (
    <SystemScreen
      id="stand-unavailable"
      tone="warning"
      icon={<MonitorX size={80} strokeWidth={1.5} />}
      title={t.standUnavailable.title}
      text={t.standUnavailable.message}
    >
      <p className={styles.staffHint}>{t.standUnavailable.staffHint}</p>
    </SystemScreen>
  );
}
