import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { OptionCard } from '../../components/OptionCard/OptionCard';
import type { PrintOrder } from '../../types/kiosk';
import styles from './UploadMethodSelectionScreen.module.css';

// Placeholder composition only — see docs/screens/upload-method-selection-spec.md
// and docs/domain/kiosk-session.md.
//
// TODO (deferred to the behavior-implementation phase):
// - Kiosk Session is deliberately minimal for now (src/types/kiosk.ts) — no
//   confirmation dialog before ending (Cart has no real content yet to
//   protect), no "ending" transition screen, no localStorage persistence
// - notification-connection-lost state (see Screen states)
// - upload-method-usb's real hardware-availability check / unavailable state
// - inactivity warning / session-reset behavior
// - overlay open/close state driving Modal visibility (Language/Help/Tariffs/Account/Cart)
// - real navigation for qr/telegram/account/web/usb (currently a placeholder no-op —
//   only upload-method-email navigates for now, see docs/email-upload-requirements.md)
//
// PromoAction is intentionally not rendered here — per docs/domain/kiosk-session.md,
// it is no longer a header element; if a promotion is ever active, it will be
// presented as a popup at session start instead.

// TODO: method-specific navigation is not implemented yet for these five
// methods — see docs/screens/upload-method-selection-spec.md, Navigation.
// Placeholder only.
function handleMethodActivate() {
  console.log('Not implemented yet');
}

interface UploadMethodSelectionScreenProps {
  onBack: () => void;
  /** Jumps directly to the Welcome Screen (see docs/domain/kiosk-session.md);
   * distinct from onBack even though both reach the same destination today. */
  onHome: () => void;
  /** Ends the active Kiosk Session and returns to the Welcome Screen. A
   * session always exists by the time this screen is reached (created by
   * service-print), so end-session is shown unconditionally here. */
  onEndSession: () => void;
  /** Navigates into the Email upload flow (docs/email-upload-requirements.md). */
  onEmailActivate: () => void;
  /** Current Cart contents, shown in the btn-cart popup. */
  cartItems: PrintOrder[];
  /** Navigates to the Payment Status screen from the Cart popup. */
  onProceedToPayment: () => void;
  /** Ids of upload methods used at least once this session — drives each
   * card's "used" marker (docs/upload-method-requirements.md). */
  usedMethods: ReadonlySet<string>;
  /** Opens the Cart popup as soon as this screen mounts — set right after
   * "Add to cart" so the user sees what was just added. */
  cartOpenOnMount?: boolean;
}

export function UploadMethodSelectionScreen({
  onBack,
  onHome,
  onEndSession,
  onEmailActivate,
  cartItems,
  onProceedToPayment,
  usedMethods,
  cartOpenOnMount,
}: UploadMethodSelectionScreenProps) {
  return (
    <KioskScreenLayout
      onEndSession={onEndSession}
      onBack={onBack}
      onHome={onHome}
      cartItems={cartItems}
      onProceedToPayment={onProceedToPayment}
      initialCartOpen={cartOpenOnMount}
    >
      <p className={styles.instruction}>
        Select how you&apos;d like to upload your document for printing
      </p>

      <div className={styles.grid}>
        <OptionCard
          id="upload-method-qr"
          title="QR code"
          description="Use your phone"
          onActivate={handleMethodActivate}
          used={usedMethods.has('upload-method-qr')}
        />
        <OptionCard
          id="upload-method-email"
          title="Email"
          description="Send your file"
          onActivate={onEmailActivate}
          used={usedMethods.has('upload-method-email')}
        />
        <OptionCard
          id="upload-method-telegram"
          title="Telegram"
          description="Use the bot"
          onActivate={handleMethodActivate}
          used={usedMethods.has('upload-method-telegram')}
        />
        <OptionCard
          id="upload-method-account"
          title="Personal account"
          description="Your saved files"
          onActivate={handleMethodActivate}
          used={usedMethods.has('upload-method-account')}
        />
        <OptionCard
          id="upload-method-web"
          title="Web page"
          description="Open online"
          onActivate={handleMethodActivate}
          used={usedMethods.has('upload-method-web')}
        />
        <OptionCard
          id="upload-method-usb"
          title="USB drive"
          description="Connect your drive"
          onActivate={handleMethodActivate}
          used={usedMethods.has('upload-method-usb')}
        />
      </div>

      {/* TODO: render <Notification /> here for the connectivity-lost state
          once that state exists — see
          docs/screens/upload-method-selection-spec.md, Screen states. Not
          rendered in the normal state. */}

      {/* TODO: render <Modal /> here as the shared shell for the temporary
          Language/Help/Tariffs/Login panels once overlay state exists. Not
          rendered while no overlay is open. */}
    </KioskScreenLayout>
  );
}
