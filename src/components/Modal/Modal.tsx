import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../../i18n';
import styles from './Modal.module.css';

// The one popup shell (CLAUDE.md, "Popups never cover the header/footer"):
// positioned inside KioskScreenLayout's content area, so its dimmed
// backdrop covers only the working area and the header, footer and End
// Session stay visible and usable. A round close button in the corner —
// the popup's content owns everything else.
interface ModalProps {
  onClose: () => void;
  /** `wide` for reading content — Help, Prices, data protection. */
  size?: 'default' | 'wide';
  children: ReactNode;
}

export function Modal({ onClose, size = 'default', children }: ModalProps) {
  const t = useTranslation();
  return (
    <div className={styles.overlay}>
      {/* data-osk-scope: the on-screen keyboard's "Next" stays inside the popup. */}
      <div className={styles.content} data-size={size} data-osk-scope>
        <button
          type="button"
          id="modal-close"
          className={styles.close}
          onClick={onClose}
          aria-label={t.common.close}
        >
          <X size={30} strokeWidth={2} aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>
  );
}
