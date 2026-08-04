import type { ReactNode } from 'react';
import { Button } from '../Button/Button';
import { useTranslation } from '../../i18n';
import styles from './Modal.module.css';

// See docs/design/component-library.md, Section 12. Minimal shell: a
// non-dimming overlay bounded to the screen's content area + content area +
// close action. No dimming backdrop and no full-viewport coverage — per
// docs/domain/kiosk-session.md, a popup must not cover the header, footer,
// or background of the working screen. No title prop yet — no confirmed use
// case needs one beyond what children render, and Panel stays internal here
// rather than becoming its own component (see that section's note on
// avoiding speculative abstraction). Whether the popup is dismissible by
// tapping outside it is an open decision there — not implemented here;
// closing is only via the explicit close action.
interface ModalProps {
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ onClose, children }: ModalProps) {
  const t = useTranslation();
  return (
    <div className={styles.overlay}>
      <div className={styles.content}>
        <Button id="modal-close" label={t.common.close} onClick={onClose} />
        {children}
      </div>
    </div>
  );
}
