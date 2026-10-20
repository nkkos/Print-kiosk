import { CircleAlert, CircleCheck, FileText, LoaderCircle, ShieldAlert } from 'lucide-react';
import { Button } from '../Button/Button';
import styles from './FileRow.module.css';

// One received file and where it stands (docs/domain/kiosk-session.md,
// "File scanning status"): checked for viruses, converted to PDF, ready —
// or blocked. A file that can't be printed stays in the list with the
// reason, so nobody wonders whether their upload got lost.
export type FileRowStatus = 'scanning' | 'converting' | 'ready' | 'rejected' | 'scan-unavailable';

interface FileRowProps {
  id: string;
  fileName: string;
  status: FileRowStatus;
  statusLabel: string;
  /** Shown on a ready file — opens print settings for just this one. */
  onConfigure?: () => void;
  configureLabel?: string;
}

export function FileRow({
  id,
  fileName,
  status,
  statusLabel,
  onConfigure,
  configureLabel,
}: FileRowProps) {
  const busy = status === 'scanning' || status === 'converting';
  return (
    <div className={styles.root} id={id} data-status={status}>
      <span className={styles.fileIcon} aria-hidden="true">
        <FileText size={34} strokeWidth={1.5} />
      </span>
      <span className={styles.name}>{fileName}</span>
      <span className={styles.status}>
        {busy && <LoaderCircle className={styles.spin} size={28} aria-hidden="true" />}
        {status === 'ready' && <CircleCheck size={28} aria-hidden="true" />}
        {status === 'rejected' && <ShieldAlert size={28} aria-hidden="true" />}
        {status === 'scan-unavailable' && <CircleAlert size={28} aria-hidden="true" />}
        {statusLabel}
      </span>
      {status === 'ready' && onConfigure && configureLabel && (
        <Button id={`${id}-configure`} label={configureLabel} onClick={onConfigure} />
      )}
    </div>
  );
}
