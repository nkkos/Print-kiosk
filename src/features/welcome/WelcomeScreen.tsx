import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { ServiceCard } from '../../components/ServiceCard/ServiceCard';
import type { PrintOrder } from '../../types/kiosk';
import styles from './WelcomeScreen.module.css';

// Placeholder composition only — see docs/screens/welcome-screen-spec.md,
// docs/domain/kiosk-session.md, and
// docs/implementation/project-architecture.md, Section 6.
//
// TODO (deferred to the behavior-implementation phase):
// - Kiosk Session is deliberately minimal for now (src/types/kiosk.ts) — no
//   confirmation dialog before ending (Cart has no real content yet to
//   protect), no "ending" transition screen, no localStorage persistence
// - hardware-unavailable state driving service-print + Notification visibility
// - overlay open/close state driving Modal visibility (Language/Help/Tariffs/Account/Cart)
// - idle / idle-wake behavior
// - PersistentActionBar's items are plain text placeholders; swap for
//   IconButton once an icon set is approved, and wire overlay-trigger callbacks
// - Modal's/Notification's internal Button composition
//
// PromoAction is intentionally not rendered here — per docs/domain/kiosk-session.md,
// it is no longer a header element; if a promotion is ever active, it will be
// presented as a popup at session start instead.

interface WelcomeScreenProps {
  /** Navigates to the Upload Method Selection Screen (see
   * docs/screens/upload-method-selection-spec.md). Creates a Kiosk Session
   * first if none exists yet (Trigger A, docs/domain/kiosk-session.md). */
  onPrintActivate: () => void;
  /** Whether a Kiosk Session is currently active (logged in, or anonymous
   * after returning via Back) — controls end-session's visibility. */
  sessionActive: boolean;
  /** Ends the active Kiosk Session and returns to this screen's neutral state. */
  onEndSession: () => void;
  /** Current Cart contents, shown in the btn-cart popup. */
  cartItems: PrintOrder[];
  /** Navigates to the Payment Status screen from the Cart popup. */
  onProceedToPayment: () => void;
}

export function WelcomeScreen({
  onPrintActivate,
  sessionActive,
  onEndSession,
  cartItems,
  onProceedToPayment,
}: WelcomeScreenProps) {
  return (
    <KioskScreenLayout
      sessionActive={sessionActive}
      onEndSession={onEndSession}
      cartItems={cartItems}
      onProceedToPayment={onProceedToPayment}
    >
      <div className={styles.services}>
        <ServiceCard
          serviceId="print"
          title="Print"
          status="available"
          onActivate={onPrintActivate}
        />
        <ServiceCard serviceId="scan" title="Scan" status="coming-soon" />
        <ServiceCard serviceId="copy" title="Copy" status="coming-soon" />
      </div>

      {/* TODO: render <Notification /> here for the hardware-unavailable
          (notification-service-unavailable) state once that state exists —
          see docs/screens/welcome-screen-spec.md, Screen states. Not
          rendered in the normal state. */}

      {/* TODO: render <Modal /> here as the shared shell for the temporary
          Language/Help/Tariffs/Login panels once overlay state exists — see
          docs/screens/welcome-screen-spec.md, Navigation. Not rendered
          while no overlay is open. */}
    </KioskScreenLayout>
  );
}
