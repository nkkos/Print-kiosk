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
 * scoped down for now: no `accountId`, `startedVia`, timestamps, or
 * `status` lifecycle yet (the session is simply present or absent —
 * `null` means no active session). Extend this as later steps need more.
 */
export interface KioskSession {
  id: string;
}

/**
 * A configured document ready for printing, added to the session's Cart on
 * "Add to cart" — see docs/domain/kiosk-session.md ("Related entities: Print
 * Order") for the full model. Deliberately scoped down for the current
 * prototype slice: settings are a fixed set of three toggles and `price` is
 * a static placeholder, not a real per-page calculation (see
 * docs/email-upload-requirements.md).
 */
export interface PrintOrder {
  id: string;
  fileName: string;
  paperSize: 'A4' | 'A5';
  sides: 'single' | 'double';
  color: 'bw' | 'color';
  price: number;
}
