import { Check, CircleAlert, CircleCheck, FileText, LoaderCircle, ShieldAlert } from 'lucide-react';
import { Button } from '../Button/Button';
import styles from './FileRow.module.css';

// One received file and where it stands (docs/domain/kiosk-session.md,
// "File scanning status"): checked for viruses, converted to PDF, ready —
// or blocked. A file that can't be printed stays in the list with the
// reason, so nobody wonders whether their upload got lost.
//
// Two ways to act on a ready file: a "Set up" button (QR and e-mail lists),
// or — with `onToggle` — the whole row is a tick box for picking several
// at once (files from an account).
export type FileRowStatus = 'scanning' | 'converting' | 'ready' | 'rejected' | 'scan-unavailable';

interface FileRowProps {
  id: string;
  fileName: string;
  status: FileRowStatus;
  statusLabel: string;
  /** Shown on a ready file — opens print settings for just this one. */
  onConfigure?: () => void;
  configureLabel?: string;
  /** Makes the row selectable: tapping a ready file ticks or unticks it. */
  onToggle?: () => void;
  selected?: boolean;
}

export function FileRow({
  id,
  fileName,
  status,
  statusLabel,
  onConfigure,
  configureLabel,
  onToggle,
  selected = false,
}: FileRowProps) {
  const busy = status === 'scanning' || status === 'converting';
  const ready = status === 'ready';
  const statusBlock = (
    <span className={styles.status}>
      {busy && <LoaderCircle className={styles.spin} size={28} aria-hidden="true" />}
      {ready && <CircleCheck size={28} aria-hidden="true" />}
      {status === 'rejected' && <ShieldAlert size={28} aria-hidden="true" />}
      {status === 'scan-unavailable' && <CircleAlert size={28} aria-hidden="true" />}
      {statusLabel}
    </span>
  );

  if (onToggle) {
    return (
      <button
        type="button"
        id={id}
        className={`${styles.root} ${styles.selectable}`}
        data-status={status}
        data-selected={selected || undefined}
        aria-pressed={selected}
        disabled={!ready}
        onClick={onToggle}
      >
        <span className={styles.check} aria-hidden="true">
          {selected && <Check size={26} strokeWidth={3} />}
        </span>
        <span className={styles.fileIcon} aria-hidden="true">
          <FileText size={34} strokeWidth={1.5} />
        </span>
        <span className={styles.name}>{fileName}</span>
        {!ready && statusBlock}
      </button>
    );
  }

  return (
    <div className={styles.root} id={id} data-status={status}>
      <span className={styles.fileIcon} aria-hidden="true">
        <FileText size={34} strokeWidth={1.5} />
      </span>
      <span className={styles.name}>{fileName}</span>
      {statusBlock}
      {ready && onConfigure && configureLabel && (
        <Button id={`${id}-configure`} label={configureLabel} onClick={onConfigure} />
      )}
    </div>
  );
}
