import type { Translations } from '../i18n';
import type { ReceivedFile } from '../types/kiosk';

/** What a received file's status says to the customer (docs/domain/kiosk-session.md,
 * "File scanning status") — shared by every list of uploaded files. */
export function fileStatusLabel(
  status: ReceivedFile['status'],
  common: Translations['common'],
): string {
  switch (status) {
    case 'ready':
      return common.fileReady;
    case 'rejected':
      return common.blockedVirusScan;
    case 'scan-unavailable':
      return common.scanUnavailable;
    case 'converting':
      return common.preparingForPrint;
    default:
      return common.scanningForViruses;
  }
}
