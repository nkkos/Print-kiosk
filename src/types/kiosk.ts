// Shared types (docs/implementation/project-architecture.md, Section 4).
// Not yet wired into any component — introduced now per the approved
// skeleton scope, to be consumed once behavior is implemented.

/** Identifies one of the kiosk's core services. */
export type ServiceId = 'print' | 'scan' | 'copy';

/** Status of a ServiceCard entry (docs/design/component-library.md, Section 8). */
export type ServiceStatus = 'available' | 'coming-soon' | 'unavailable';

/** Which persistent overlay is currently open, if any. */
export type OverlayKind = 'language' | 'help' | 'tariffs' | 'login' | null;

/**
 * Minimal Kiosk Session shape for the current prototype slice — see
 * docs/domain/kiosk-session.md for the full domain model. Deliberately
 * scoped down for now: no `startedVia`, timestamps, or `status` lifecycle
 * yet (the session is simply present or absent — `null` means no active
 * session). Extend this as later steps need more.
 */
export interface KioskSession {
  id: string;
  /** Nullable — set when login occurs, at any point during the session
   * (docs/domain/kiosk-session.md, "Minimum session attributes"; Trigger B).
   * The real account id (server/db/schema.ts's `accounts.id`), returned by
   * POST /api/accounts/login (docs/personal-account-requirements.md). */
  accountId: string | null;
}

/**
 * A configured document ready for printing, added to the session's Cart on
 * "Add to cart" — see docs/domain/kiosk-session.md ("Related entities: Print
 * Order") and docs/cart-requirements.md (quantity, pricing, selection,
 * removal) for the full model. Deliberately scoped down for the current
 * prototype slice: settings are a fixed set of three toggles and
 * `unitPrice` is a static placeholder, not a real per-page calculation (see
 * docs/email-upload-requirements.md). Line total is always `unitPrice *
 * quantity`, computed where displayed rather than stored redundantly.
 */
export interface PrintOrder {
  id: string;
  fileName: string;
  paperSize: 'A4' | 'A5';
  sides: 'single' | 'double';
  color: 'bw' | 'color';
  /** Number of copies of this configured document. Minimum 1 — see
   * docs/cart-requirements.md ("Quantity"). */
  quantity: number;
  unitPrice: number;
  /** Present only on orders paid in advance via the web portal
   * (docs/personal-account-requirements.md, "Paid orders awaiting print").
   * How many copies were already paid for — see `computeItemPrice`
   * (src/utils/pricing.ts) for how this changes the Cart price. Absent on
   * every ordinary order. */
  paidQuantity?: number;
  /** Present only alongside `paidQuantity` — the id of the source "paid,
   * awaiting print" order this Cart item came from (docs/personal-account-requirements.md,
   * "Paid orders awaiting print"). Used to prevent adding the same paid
   * order to Cart more than once (it stays hidden from My orders while a
   * Cart item traces back to it) — extra copies beyond what was paid for
   * are obtained by raising this item's `quantity`, not by re-adding it. */
  sourcePaidOrderId?: string;
  /** The real `uploadedFiles.id` this Cart item was configured from — present
   * only for QR/Email-sourced files (the only sources with real bytes on
   * disk, server/uploadStore.ts). Absent for Personal Account/paid-order
   * items, which stay mocked; Print Status falls back to a placeholder
   * document for any item without this id (server/printerAdapter.ts). */
  sourceFileId?: string;
}

/**
 * A file uploaded via QR (docs/qr-upload-requirements.md) as it awaits or
 * completes antivirus scanning (docs/domain/kiosk-session.md, "File scanning
 * status"). Uses its own `id` (not just `fileName`) since QR uploads can
 * plausibly repeat a file name across separate uploads, unlike Email's fixed
 * mock attachments. `'rejected'` means a real ClamAV scan (server/uploadStore.ts)
 * flagged the file as infected — it's already deleted from disk by then;
 * this record is kept only so the kiosk can show what happened.
 */
export interface ReceivedFile {
  id: string;
  fileName: string;
  status: 'scanning' | 'converting' | 'ready' | 'rejected';
}

/**
 * One received email (docs/email-upload-requirements.md) as reported by the
 * real backend (server/emailStore.ts) — subject/body preview plus its
 * attachments, each carrying the same live scanning status as QR uploads
 * (`ReceivedFile`) since both go through the identical validation/ClamAV
 * pipeline (server/uploadStore.ts).
 */
export interface ReceivedEmail {
  id: string;
  subject: string;
  bodyPreview: string;
  attachments: ReceivedFile[];
}
