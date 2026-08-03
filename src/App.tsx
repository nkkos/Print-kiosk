import { useCallback, useState } from 'react';
import { WelcomeScreen } from './features/welcome/WelcomeScreen';
import { UploadMethodSelectionScreen } from './features/upload-method-selection/UploadMethodSelectionScreen';
import { EmailAddressScreen } from './features/email-upload/EmailAddressScreen';
import { EmailFileListScreen } from './features/email-upload/EmailFileListScreen';
import { PrintOrderConfigurationScreen } from './features/print-order-configuration/PrintOrderConfigurationScreen';
import { PaymentStatusScreen } from './features/payment-status/PaymentStatusScreen';
import { PrintStatusScreen } from './features/print-status/PrintStatusScreen';
import { FinalisingSessionScreen } from './features/finalising-session/FinalisingSessionScreen';
import { EndingSessionScreen } from './features/ending-session/EndingSessionScreen';
import type { KioskSession, PrintOrder } from './types/kiosk';

type Screen =
  | 'welcome'
  | 'upload-method-selection'
  | 'email-address'
  | 'email-file-list'
  | 'print-order-configuration'
  | 'payment-status'
  | 'print-status'
  | 'finalising-session'
  | 'ending-session';

// Prototype stand-in for real cleanup work (docs/domain/kiosk-session.md,
// "User-visible sequence") — just long enough for the transition screen to
// be visibly noticeable.
const ENDING_SESSION_DELAY_MS = 1200;

// "To make the brief-interruption case work, sessionId is persisted locally
// ... so it survives a short crash/restart" (docs/domain/kiosk-session.md,
// Failure/recovery). Deliberately narrow: only the id itself is restored on
// reload (sessionActive becomes true again) — cart, screen, and everything
// else stay transient in-memory state, per the confirmed "no smart session
// restore" decision; an abandoned session still relies on the existing
// inactivity timeout (not yet implemented) to eventually clean itself up.
const SESSION_ID_STORAGE_KEY = 'print-kiosk.sessionId';

// Simple state-based screen switch — no React Router yet, per
// docs/implementation/project-architecture.md, Section 9 (deferred until a
// second screen genuinely needs routing/URL support).
//
// Kiosk Session (docs/domain/kiosk-session.md) lives here too: it is needed
// by every screen (service-print creates/reuses it; all in-flow screens show
// End Session), which is exactly the "two concrete consumers" threshold the
// architecture doc uses to justify a shared owner, rather than living inside
// features/welcome. Only sessionId is persisted (SESSION_ID_STORAGE_KEY,
// below) — cart and everything else remain in-memory only, per the
// confirmed "no smart session restore" decision.
//
// Cart (docs/domain/kiosk-session.md) is likewise minimal: just an in-memory
// array of PrintOrder, populated by the Email flow's "Add to cart" and read
// by every screen's Cart popup (KioskScreenLayout).
function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [session, setSession] = useState<KioskSession | null>(() => {
    const storedId = localStorage.getItem(SESSION_ID_STORAGE_KEY);
    return storedId ? { id: storedId } : null;
  });
  const [cart, setCart] = useState<PrintOrder[]>([]);
  // The file the user picked from an email's attachments, carried through
  // to Print Order Configuration (see EmailFileListScreen).
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  // Simulates "is this session's mailbox empty?" without a real inbound-email
  // backend (docs/email-upload-requirements.md, Open items): starts false
  // (empty), flips true once the user has gone through the address/instruction
  // screen at least once this session. While false, selecting Email shows the
  // instruction screen; once true, selecting Email again skips straight to
  // the email list (the user already knows the address and has mail waiting).
  const [hasReceivedEmail, setHasReceivedEmail] = useState(false);
  // Ids of upload methods used at least once this session — drives the
  // "used" marker on Upload Method Selection's cards
  // (docs/upload-method-requirements.md). Only Email can ever be added right
  // now, since it's the only implemented method; PrintOrder doesn't track
  // its source method yet, so this is set from the one place that currently
  // exists rather than derived generically — revisit once a second method
  // is implemented.
  const [usedMethods, setUsedMethods] = useState<Set<string>>(new Set());
  // Opens the Cart popup as soon as Upload Method Selection mounts — set
  // right after "Add to cart" so the user sees what was just added instead
  // of silently landing back on this screen. Reset to false on every other
  // way of reaching this screen.
  const [openCartOnUploadMethodSelection, setOpenCartOnUploadMethodSelection] = useState(false);

  function goToUploadMethodSelection(openCart: boolean) {
    setOpenCartOnUploadMethodSelection(openCart);
    setScreen('upload-method-selection');
  }

  function handlePrintActivate() {
    // Trigger A (docs/domain/kiosk-session.md): create a session only if one
    // doesn't already exist — reuse it otherwise.
    setSession((current) => {
      if (current) return current;
      const newSession: KioskSession = { id: crypto.randomUUID() };
      localStorage.setItem(SESSION_ID_STORAGE_KEY, newSession.id);
      return newSession;
    });
    goToUploadMethodSelection(false);
  }

  // Wrapped in useCallback for a stable reference: KioskScreenLayout's
  // inactivity timer (below) depends on this function and must not restart
  // on every unrelated re-render.
  const handleEndSession = useCallback(() => {
    // Confirmation (if any — manual or the inactivity auto-end below) has
    // already happened by the time this is called (KioskScreenLayout) —
    // this is the actual cleanup sequence: show the "ending session" screen
    // while cleanup "runs", then reset everything and return to Welcome
    // (docs/domain/kiosk-session.md, "User-visible sequence").
    setScreen('ending-session');
    setTimeout(() => {
      localStorage.removeItem(SESSION_ID_STORAGE_KEY);
      setSession(null);
      setCart([]);
      setSelectedFileName(null);
      setHasReceivedEmail(false);
      setUsedMethods(new Set());
      setScreen('welcome');
    }, ENDING_SESSION_DELAY_MS);
  }, []);

  function handleAddToCart(order: PrintOrder) {
    setCart((current) => [...current, order]);
    setUsedMethods((current) => new Set(current).add('upload-method-email'));
    // Returns to Upload Method Selection so the user can add another
    // document — matches Cart's confirmed purpose (docs/domain/kiosk-session.md).
    // Cart popup opens automatically so the user sees what was just added;
    // they close it themselves to continue.
    goToUploadMethodSelection(true);
  }

  function handlePaymentSuccess() {
    // The paid items leave the cart — Cart only ever shows "awaiting
    // payment" orders (docs/domain/kiosk-session.md, "Related entities").
    setCart([]);
    setScreen('print-status');
  }

  function handlePrintComplete() {
    setScreen('finalising-session');
  }

  if (screen === 'upload-method-selection') {
    return (
      <UploadMethodSelectionScreen
        onBack={() => setScreen('welcome')}
        onHome={() => setScreen('welcome')}
        onEndSession={handleEndSession}
        onEmailActivate={() => setScreen(hasReceivedEmail ? 'email-file-list' : 'email-address')}
        cartItems={cart}
        onProceedToPayment={() => setScreen('payment-status')}
        usedMethods={usedMethods}
        cartOpenOnMount={openCartOnUploadMethodSelection}
      />
    );
  }

  if (screen === 'email-address' && session) {
    return (
      <EmailAddressScreen
        emailAddress={`upload-${session.id.slice(0, 8)}@kiosk.example`}
        onNext={() => {
          setHasReceivedEmail(true);
          setScreen('email-file-list');
        }}
        onBack={() => goToUploadMethodSelection(false)}
        onHome={() => setScreen('welcome')}
        onEndSession={handleEndSession}
        cartItems={cart}
        onProceedToPayment={() => setScreen('payment-status')}
      />
    );
  }

  if (screen === 'email-file-list') {
    return (
      <EmailFileListScreen
        onFileSelect={(fileName) => {
          setSelectedFileName(fileName);
          setScreen('print-order-configuration');
        }}
        onBack={() => setScreen('email-address')}
        onHome={() => setScreen('welcome')}
        onEndSession={handleEndSession}
        cartItems={cart}
        onProceedToPayment={() => setScreen('payment-status')}
      />
    );
  }

  if (screen === 'print-order-configuration' && selectedFileName) {
    return (
      <PrintOrderConfigurationScreen
        fileName={selectedFileName}
        onAddToCart={handleAddToCart}
        onBack={() => setScreen('email-file-list')}
        onHome={() => setScreen('welcome')}
        onEndSession={handleEndSession}
        cartItems={cart}
        onProceedToPayment={() => setScreen('payment-status')}
      />
    );
  }

  if (screen === 'payment-status') {
    return (
      <PaymentStatusScreen
        cartItems={cart}
        onPaymentSuccess={handlePaymentSuccess}
        onCancelPayment={() => goToUploadMethodSelection(false)}
        onReturnHome={() => setScreen('welcome')}
        onEndSession={handleEndSession}
        onProceedToPayment={() => setScreen('payment-status')}
      />
    );
  }

  if (screen === 'print-status') {
    return (
      <PrintStatusScreen
        cartItems={cart}
        onPrintComplete={handlePrintComplete}
        onEndSession={handleEndSession}
        onProceedToPayment={() => setScreen('payment-status')}
      />
    );
  }

  if (screen === 'ending-session') {
    return <EndingSessionScreen />;
  }

  if (screen === 'finalising-session') {
    return (
      <FinalisingSessionScreen
        onReturnToWelcome={() => setScreen('welcome')}
        onEndSession={handleEndSession}
        cartItems={cart}
        onProceedToPayment={() => setScreen('payment-status')}
      />
    );
  }

  return (
    <WelcomeScreen
      onPrintActivate={handlePrintActivate}
      sessionActive={session !== null}
      onEndSession={handleEndSession}
      cartItems={cart}
      onProceedToPayment={() => setScreen('payment-status')}
    />
  );
}

export default App;
