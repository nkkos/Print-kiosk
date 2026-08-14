import { useCallback, useEffect, useState } from 'react';
import { WelcomeScreen } from './features/welcome/WelcomeScreen';
import { UploadMethodSelectionScreen } from './features/upload-method-selection/UploadMethodSelectionScreen';
import { EmailAddressScreen } from './features/email-upload/EmailAddressScreen';
import { EmailFileListScreen } from './features/email-upload/EmailFileListScreen';
import { QrUploadScreen } from './features/qr-upload/QrUploadScreen';
import { ScanScreen } from './features/scan/ScanScreen';
import { PersonalAccountScreen } from './features/personal-account/PersonalAccountScreen';
import { PrintOrderConfigurationScreen } from './features/print-order-configuration/PrintOrderConfigurationScreen';
import { PaymentStatusScreen } from './features/payment-status/PaymentStatusScreen';
import { PrintStatusScreen } from './features/print-status/PrintStatusScreen';
import { FinalisingSessionScreen } from './features/finalising-session/FinalisingSessionScreen';
import { EndingSessionScreen } from './features/ending-session/EndingSessionScreen';
import { ACTIVITY_EVENTS } from './layouts/KioskScreenLayout/KioskScreenLayout';
import { computeItemPrice } from './utils/pricing';
import { getUploadConfig, listQrFiles } from './services/qrUploadApi';
import { createScanSession, getScanSession } from './services/scanApi';
import type { ScanSession } from './services/scanApi';
import { listEmailMessages } from './services/emailApi';
import { login } from './services/accountApi';
import { listAccountOrders } from './services/accountFileApi';
import { submitPrintJob, getPrintTask, simulatePrintOutcome } from './services/printApi';
import type { PrintTask } from './services/printApi';
import { startSession, touchSessionActivity, endSession } from './services/sessionApi';
import { LanguageProvider } from './i18n';
import type { Language } from './i18n';
import type {
  EndSessionReason,
  KioskSession,
  PrintOrder,
  ReceivedFile,
  ReceivedEmail,
} from './types/kiosk';

type Screen =
  | 'welcome'
  | 'upload-method-selection'
  | 'email-address'
  | 'email-file-list'
  | 'qr-upload'
  | 'scan'
  | 'personal-account'
  | 'print-order-configuration'
  | 'payment-status'
  | 'print-status'
  | 'finalising-session'
  | 'ending-session';

// Minimum time the "ending session" screen stays up, joined (via
// Promise.all) with the real endSession() call below — avoids a jarring
// flash on a fast local network while still letting the real cleanup
// determine when the transition actually happens (docs/domain/kiosk-session.md,
// "Timing": deletion must complete before the screen returns to idle).
const ENDING_SESSION_DELAY_MS = 1200;

// Minimum time between session-activity heartbeats (below) — enough
// granularity for post-hoc log analysis without pinging the backend on
// every click.
const SESSION_ACTIVITY_PING_INTERVAL_MS = 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// "To make the brief-interruption case work, sessionId is persisted locally
// ... so it survives a short crash/restart" (docs/domain/kiosk-session.md,
// Failure/recovery). The Cart is persisted alongside it (revised: losing a
// user's in-progress order to an accidental reload is real lost work worth
// avoiding) — but this still isn't a full "smart restore": `screen` itself
// is not persisted, so a reload always lands back on Welcome, just with the
// session and cart intact.
const SESSION_ID_STORAGE_KEY = 'print-kiosk.sessionId';
const CART_STORAGE_KEY = 'print-kiosk.cart';

// Real QR upload backend (server/, dev-only — see
// docs/qr-upload-requirements.md): the kiosk polls it for newly arrived
// files while the QR screen is open.
const QR_POLL_INTERVAL_MS = 3000;

// Real Email upload backend (server/, dev-only — see
// docs/email-upload-requirements.md): the kiosk polls it for newly arrived
// messages while the Email file list screen is open, same pattern as QR.
const EMAIL_POLL_INTERVAL_MS = 3000;

// Real print backend (server/printerAdapter.ts, dev-only — see
// docs/domain/kiosk-session.md, "Related entities"): the kiosk polls the
// submitted Print Task's status while Print Status is open, same pattern as
// QR/Email above.
const PRINT_POLL_INTERVAL_MS = 1500;

// Simple state-based screen switch — no React Router yet, per
// docs/implementation/project-architecture.md, Section 9 (deferred until a
// second screen genuinely needs routing/URL support).
//
// Kiosk Session (docs/domain/kiosk-session.md) lives here too: it is needed
// by every screen (service-print creates/reuses it; all in-flow screens show
// End Session), which is exactly the "two concrete consumers" threshold the
// architecture doc uses to justify a shared owner, rather than living inside
// features/welcome. `screen` itself is still not persisted — see
// SESSION_ID_STORAGE_KEY above.
//
// Cart (docs/domain/kiosk-session.md) is likewise minimal: just an array of
// PrintOrder, populated by the Email flow's "Add to cart" and read by every
// screen's Cart popup (KioskScreenLayout) — persisted to localStorage (see
// CART_STORAGE_KEY) so it survives a reload.
function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [session, setSession] = useState<KioskSession | null>(() => {
    const storedId = localStorage.getItem(SESSION_ID_STORAGE_KEY);
    // accountId is deliberately not persisted/restored here — only sessionId
    // is (see SESSION_ID_STORAGE_KEY above); a reload always comes back
    // logged out, consistent with "no smart session restore."
    return storedId ? { id: storedId, accountId: null } : null;
  });
  // Session-scoped, not persisted (docs/i18n-requirements.md, "Language
  // selection" — confirmed to reset every session, same category as
  // accountId, not kiosk-sticky).
  const [language, setLanguage] = useState<Language>('en');
  const [cart, setCart] = useState<PrintOrder[]>(() => {
    const storedCart = localStorage.getItem(CART_STORAGE_KEY);
    return storedCart ? (JSON.parse(storedCart) as PrintOrder[]) : [];
  });
  // The file the user picked (from an email's attachments or a QR upload),
  // carried through to Print Order Configuration. `sourceMethod` is what
  // lets handleAddToCart mark the right upload-method card as "used" and
  // return to the right screen afterward, now that more than one method
  // exists. `instanceKey` is a fresh id generated on every selection, used
  // as PrintOrderConfigurationScreen's React `key` so its internal settings
  // state (paper size, quantity, etc.) resets between files during a batch
  // (docs/personal-account-requirements.md, "Batch configure") instead of
  // carrying over from the previous file.
  const [selectedFile, setSelectedFile] = useState<{
    fileId?: string;
    fileName: string;
    sourceMethod: string;
    instanceKey: string;
  } | null>(null);
  // Files still queued after the current one, when the user chose "Configure
  // printing for all files" instead of picking one file at a time
  // (docs/personal-account-requirements.md, "Batch configure"). Empty for
  // the ordinary one-file-at-a-time flow.
  const [batchQueue, setBatchQueue] = useState<
    { fileId?: string; fileName: string; sourceMethod: string }[]
  >([]);
  // Real received emails, each attachment carrying its own scanning status
  // (docs/email-upload-requirements.md; docs/domain/kiosk-session.md, "File
  // scanning status"). Owned here (not locally in EmailFileListScreen) for
  // the same survives-remount reason as qrFiles below.
  const [emailMessages, setEmailMessages] = useState<ReceivedEmail[]>([]);
  // QR-uploaded files, each carrying its own scanning status
  // (docs/qr-upload-requirements.md). Owned here for the same
  // survives-remount reason as emailMessages above.
  const [qrFiles, setQrFiles] = useState<ReceivedFile[]>([]);
  // Whether the QR screen has been reached at least once this session —
  // gates the one-time /api/config fetch below (docs/qr-upload-requirements.md).
  const [hasQrUploadStarted, setHasQrUploadStarted] = useState(false);
  // The phone-facing upload URL encoded in the QR image, once known — null
  // until the one-time /api/config fetch (below) resolves.
  const [qrUploadUrl, setQrUploadUrl] = useState<string | null>(null);
  // The current scan attempt's own id (server/scanStore.ts's scanSessions.id
  // — distinct from the Kiosk Session id, since one Kiosk Session can go
  // through several scan attempts over time via scan-restart,
  // docs/screens/scan-spec.md). Null until service-scan is first activated.
  const [scanSessionId, setScanSessionId] = useState<string | null>(null);
  // The phone-facing scan URL encoded in the QR image — null until the scan
  // session above has been created and the backend's LAN-facing base URL
  // resolved (docs/scan-upload-requirements.md).
  const [scanQrUrl, setScanQrUrl] = useState<string | null>(null);
  // Polled scan session state (pages captured, delivery status) — null
  // until the first poll resolves (docs/screens/scan-spec.md, "Screen states").
  const [scanSession, setScanSession] = useState<ScanSession | null>(null);
  // Whether the user has gone through the address/instruction screen at
  // least once this session (docs/email-upload-requirements.md) — not
  // whether mail has actually arrived (see emailMessages for that, which
  // drives the "used" card marker below). While false, selecting Email shows
  // the instruction screen; once true, selecting Email again skips straight
  // to the email list (the user already knows the address).
  const [hasReceivedEmail, setHasReceivedEmail] = useState(false);
  // Ids of upload methods used at least once this session — drives the
  // "used" marker on Upload Method Selection's cards
  // (docs/upload-method-requirements.md). Set from `selectedFile.sourceMethod`
  // in handleAddToCart, now that a second method (QR) exists alongside Email.
  const [usedMethods, setUsedMethods] = useState<Set<string>>(new Set());
  // Opens the Cart popup as soon as Upload Method Selection mounts — set
  // right after "Add to cart" so the user sees what was just added instead
  // of silently landing back on this screen. Reset to false on every other
  // way of reaching this screen.
  const [openCartOnUploadMethodSelection, setOpenCartOnUploadMethodSelection] = useState(false);
  // Same idea, but for the Email mailbox screen: after "Add to cart" the
  // user returns there (not to Upload Method Selection), since they may
  // still have other attachments/emails to process.
  const [openCartOnEmailFileList, setOpenCartOnEmailFileList] = useState(false);
  // Same idea, but for the QR upload screen.
  const [openCartOnQrUpload, setOpenCartOnQrUpload] = useState(false);
  // Same idea, but for the Personal Account screen.
  const [openCartOnPersonalAccount, setOpenCartOnPersonalAccount] = useState(false);
  // Which tab Personal Account should show when it (re)mounts — set
  // explicitly by every navigation into the screen (docs/personal-account-requirements.md:
  // returning after "My files" batch/single-file actions goes back to
  // "files"; adding a paid order from "My orders" goes back to "orders").
  const [personalAccountTab, setPersonalAccountTab] = useState<'files' | 'orders'>('files');
  // Forces PersonalAccountScreen to remount when a paid order is added to
  // Cart directly from "My orders" — unlike every other "add to cart" path,
  // that one doesn't navigate to a different screen first, so
  // `initialCartOpen` (a plain useState initializer in KioskScreenLayout)
  // would otherwise never re-run and the Cart popup wouldn't reopen.
  const [personalAccountRenderKey, setPersonalAccountRenderKey] = useState(0);
  // True right after a successful login while the account has at least one
  // order paid in advance and awaiting print (docs/personal-account-requirements.md,
  // "Paid orders awaiting print") — drives a one-time prompt popup shown
  // from whichever screen the login happened on, offering a shortcut to My
  // orders. Persists across screen navigation until dismissed, same pattern
  // as isConnectionLost.
  const [hasPendingPaidOrders, setHasPendingPaidOrders] = useState(false);
  // The batch of Cart items the user checked and chose to pay for right now
  // (docs/cart-requirements.md, "Selection for payment") — a snapshot taken
  // when "Proceed to payment" is pressed. `cart` itself isn't touched until
  // payment actually succeeds, so unchecked items simply stay behind.
  const [paymentItems, setPaymentItems] = useState<PrintOrder[]>([]);
  // Lifted here (not owned by KioskScreenLayout) since it must persist
  // across screen navigation and actually blocks Payment/Print actions
  // (docs/domain/kiosk-session.md, "Failure and recovery") — only those two,
  // not cart-browsing/configuration, since connectivity may come back
  // quickly and the user can keep working with files meanwhile.
  const [isConnectionLost, setIsConnectionLost] = useState(false);
  // The batch actually being printed this Print Status visit — distinct from
  // `cart` (which only holds what's left for further shopping) and
  // `paymentItems` (cleared once payment succeeds). Set right before
  // navigating to Print Status, cleared once printing completes.
  const [printingItems, setPrintingItems] = useState<PrintOrder[]>([]);
  // One Print Task per `printingItems` entry (server/printTaskStore.ts) —
  // empty before Print Status has submitted any yet. Cleared once the user
  // leaves Print Status, so revisiting later starts a fresh submission.
  const [printTasks, setPrintTasks] = useState<PrintTask[]>([]);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  // Polls the backend for newly arrived email while the Email file list
  // screen is open — messages themselves live server-side
  // (server/emailStore.ts), so polling simply resumes and immediately
  // re-fetches on every revisit. Mirrors the QR polling effect below.
  useEffect(() => {
    if (screen !== 'email-file-list' || !session) return;
    const prefix = session.id.slice(0, 8);
    let cancelled = false;
    function poll() {
      listEmailMessages(prefix).then((messages) => {
        if (!cancelled) setEmailMessages(messages);
      });
    }
    poll();
    const intervalId = setInterval(poll, EMAIL_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [screen, session]);

  // Fetches the backend's LAN-facing upload URL once, the first time the QR
  // screen is reached this session — the QR image encodes
  // `${lanUploadUrl}/upload/${session.id}` (docs/qr-upload-requirements.md).
  useEffect(() => {
    if (!hasQrUploadStarted || !session) return;
    let cancelled = false;
    getUploadConfig().then(({ lanUploadUrl }) => {
      if (!cancelled) setQrUploadUrl(`${lanUploadUrl}/upload/${session.id}`);
    });
    return () => {
      cancelled = true;
    };
  }, [hasQrUploadStarted, session]);

  // Polls the backend for newly arrived files while the QR screen is open —
  // files themselves live server-side (server/uploadStore.ts), so polling
  // simply resumes and immediately re-fetches on every revisit, preserving
  // the confirmed "same QR persists across revisits" behavior
  // (docs/qr-upload-requirements.md) without needing to run forever.
  useEffect(() => {
    if (screen !== 'qr-upload' || !session) return;
    let cancelled = false;
    function poll() {
      if (!session) return;
      listQrFiles(session.id).then((files) => {
        if (!cancelled) setQrFiles(files);
      });
    }
    poll();
    const intervalId = setInterval(poll, QR_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [screen, session]);

  // Polls the current scan attempt's state while the Scan screen is open —
  // pages/delivery status live server-side (server/scanStore.ts), same 3s
  // interval and "resume on revisit" pattern as QR upload's own polling
  // effect above (docs/screens/scan-spec.md, "reuse the exact
  // interval/pattern QR upload already established").
  useEffect(() => {
    if (screen !== 'scan' || !scanSessionId) return;
    let cancelled = false;
    function poll() {
      if (!scanSessionId) return;
      getScanSession(scanSessionId).then((data) => {
        if (!cancelled) setScanSession(data);
      });
    }
    poll();
    const intervalId = setInterval(poll, QR_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [screen, scanSessionId]);

  // Submits one real Print Task per `printingItems` entry
  // (server/printerAdapter.ts) once, on entering Print Status — this screen
  // is "fully system-controlled" (docs/domain/kiosk-session.md), so
  // submission isn't gated on a button click. Each item's real
  // `sourceFileId` (QR/Email only) prints that file for real; anything else
  // falls back to a placeholder document server-side. handleRetryPrint
  // resets `printTasks` to [] to trigger a fresh submission.
  useEffect(() => {
    if (screen !== 'print-status' || printingItems.length === 0 || printTasks.length > 0) return;
    let cancelled = false;
    Promise.all(
      printingItems.map((item) =>
        submitPrintJob({
          sessionId: session?.id ?? null,
          fileId: item.sourceFileId,
          sourceFileOrigin: item.sourceFileOrigin,
          printOrderId: item.sourcePaidOrderId,
          paperSize: item.paperSize,
          sides: item.sides,
          color: item.color,
          orientation: item.orientation,
          scale: item.scale,
          pages: item.pageRange,
          copies: item.quantity,
        }),
      ),
    ).then((tasks) => {
      if (!cancelled) setPrintTasks(tasks);
    });
    return () => {
      cancelled = true;
    };
  }, [screen, printingItems, printTasks, session]);

  // Polls every non-terminal task's status — a plain OS print API has no
  // reliable in-progress signal, so "printing" only ever resolves via a real
  // submit failure or a "Simulate ..." outcome (PrintStatusScreen), both of
  // which update the same backend records.
  useEffect(() => {
    if (screen !== 'print-status' || printTasks.length === 0) return;
    const hasPending = printTasks.some((t) => t.status !== 'succeeded' && t.status !== 'failed');
    if (!hasPending) return;
    let cancelled = false;
    const intervalId = setInterval(() => {
      Promise.all(
        printTasks.map((t) =>
          t.status === 'succeeded' || t.status === 'failed' ? t : getPrintTask(t.id),
        ),
      ).then((tasks) => {
        if (!cancelled) setPrintTasks(tasks);
      });
    }, PRINT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [screen, printTasks]);

  // Session-activity heartbeat (docs/data-privacy-requirements.md follow-up:
  // kiosk_sessions.last_activity_at should be honest, not just whatever the
  // session happened to be doing at the moment it ends). Reuses the exact
  // activity signal KioskScreenLayout's inactivity timer already listens
  // for, throttled so it doesn't spam the backend. Deliberately not gated on
  // which screen is active (unlike the inactivity timer) — Payment/Print
  // Status should still count as activity for logging purposes even though
  // auto-end is suspended there.
  useEffect(() => {
    if (!session) return;
    const activeSession = session;
    let lastPingAt = 0;
    function handleActivity() {
      const now = Date.now();
      if (now - lastPingAt < SESSION_ACTIVITY_PING_INTERVAL_MS) return;
      lastPingAt = now;
      touchSessionActivity(activeSession.id, activeSession.accountId).catch((err: unknown) => {
        console.error('[App] touchSessionActivity request failed:', err);
      });
    }
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, handleActivity));
    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
    };
  }, [session]);

  function goToUploadMethodSelection(openCart: boolean) {
    setOpenCartOnUploadMethodSelection(openCart);
    setScreen('upload-method-selection');
  }

  function goToEmailFileList(openCart: boolean) {
    setOpenCartOnEmailFileList(openCart);
    setScreen('email-file-list');
  }

  function goToQrUpload(openCart: boolean) {
    setOpenCartOnQrUpload(openCart);
    setScreen('qr-upload');
  }

  function goToPersonalAccount(openCart: boolean, tab: 'files' | 'orders' = 'files') {
    setOpenCartOnPersonalAccount(openCart);
    setPersonalAccountTab(tab);
    setScreen('personal-account');
  }

  function selectFileForConfiguration(
    fileId: string | undefined,
    fileName: string,
    sourceMethod: string,
  ) {
    setSelectedFile({ fileId, fileName, sourceMethod, instanceKey: crypto.randomUUID() });
    setScreen('print-order-configuration');
  }

  // Starts a batch (docs/personal-account-requirements.md, "Batch
  // configure"): configures the first file now, queues the rest for
  // handleAddToCart to work through one at a time.
  function startBatch(files: { fileId?: string; fileName: string; sourceMethod: string }[]) {
    if (files.length === 0) return;
    const [first, ...rest] = files;
    setBatchQueue(rest);
    selectFileForConfiguration(first.fileId, first.fileName, first.sourceMethod);
  }

  function handleConfigureAllEmailAttachments() {
    startBatch(
      emailMessages
        .flatMap((email) => email.attachments)
        .filter((attachment) => attachment.status === 'ready')
        .map((attachment) => ({
          fileId: attachment.id,
          fileName: attachment.fileName,
          sourceMethod: 'upload-method-email',
        })),
    );
  }

  function handleConfigureAllQrFiles() {
    startBatch(
      qrFiles
        .filter((file) => file.status === 'ready')
        .map((file) => ({
          fileId: file.id,
          fileName: file.fileName,
          sourceMethod: 'upload-method-qr',
        })),
    );
  }

  function handleConfigureSelectedAccountFiles(files: { fileId: string; fileName: string }[]) {
    startBatch(
      files.map((file) => ({
        fileId: file.fileId,
        fileName: file.fileName,
        sourceMethod: 'upload-method-account',
      })),
    );
  }

  function handleAddPaidOrderToCart(order: PrintOrder) {
    // Already fully configured when paid for via the portal — no Print
    // Order Configuration step, straight into Cart (docs/personal-account-requirements.md,
    // "Paid orders awaiting print"). `sourcePaidOrderId` tracks it back to
    // the mock order so My orders can hide it while it's in Cart — prevents
    // adding the same paid order repeatedly for free; extra copies are
    // obtained by raising quantity on this Cart item instead.
    setCart((current) => [
      ...current,
      { ...order, id: crypto.randomUUID(), sourcePaidOrderId: order.id },
    ]);
    setUsedMethods((current) => new Set(current).add('upload-method-account'));
    setPersonalAccountRenderKey((current) => current + 1);
    goToPersonalAccount(true, 'orders');
  }

  function handleLogout() {
    // Logging out only clears accountId — the Kiosk Session itself (and any
    // Cart contents) stays intact (docs/personal-account-requirements.md,
    // "Kiosk-side login"; docs/domain/kiosk-session.md, "Login relationship").
    setSession((current) => (current ? { ...current, accountId: null } : current));
    setHasPendingPaidOrders(false);
    goToUploadMethodSelection(false);
  }

  function handlePrintActivate() {
    // Trigger A (docs/domain/kiosk-session.md): create a session only if one
    // doesn't already exist — reuse it otherwise. Reads `session` directly
    // (rather than the functional setSession(current => ...) form) so the
    // "is this actually new" decision is available for the startSession()
    // call below too (docs/data-privacy-requirements.md follow-up).
    if (!session) {
      const newSession: KioskSession = { id: crypto.randomUUID(), accountId: null };
      localStorage.setItem(SESSION_ID_STORAGE_KEY, newSession.id);
      setSession(newSession);
      startSession(newSession.id, null, 'service-print').catch((err: unknown) => {
        console.error('[App] startSession request failed:', err);
      });
    }
    goToUploadMethodSelection(false);
  }

  // Creates a fresh scan attempt under the given Kiosk Session id
  // (server/scanStore.ts) and resolves the QR code it should encode — shared
  // by both first activation and scan-restart (docs/screens/scan-spec.md).
  function startScanSession(kioskSessionId: string) {
    createScanSession(kioskSessionId)
      .then(({ id }) => {
        setScanSessionId(id);
        setScanSession(null);
        return getUploadConfig().then(({ lanUploadUrl }) => {
          setScanQrUrl(`${lanUploadUrl}/scan/${id}`);
        });
      })
      .catch((err: unknown) => {
        console.error('[App] createScanSession request failed:', err);
      });
  }

  function handleScanActivate() {
    // Trigger A (docs/domain/kiosk-session.md), same mechanics as
    // handlePrintActivate. Only starts a new scan attempt if none exists yet
    // for this Kiosk Session — revisiting the Scan screen otherwise
    // preserves the same QR code and current state (docs/screens/scan-spec.md,
    // "Navigation").
    if (!session) {
      const newSession: KioskSession = { id: crypto.randomUUID(), accountId: null };
      localStorage.setItem(SESSION_ID_STORAGE_KEY, newSession.id);
      setSession(newSession);
      startSession(newSession.id, null, 'service-scan').catch((err: unknown) => {
        console.error('[App] startSession request failed:', err);
      });
      startScanSession(newSession.id);
    } else if (!scanSessionId) {
      startScanSession(session.id);
    }
    setScreen('scan');
  }

  function handleScanRestart() {
    // scan-restart (docs/screens/scan-spec.md) — ends the previous phone-side
    // attempt (simply abandoned, nothing to explicitly close server-side)
    // and starts a fresh one under the same Kiosk Session.
    if (session) startScanSession(session.id);
  }

  async function handleLogin(email: string, password: string) {
    // Real backend authentication (server/routes.ts, POST /api/accounts/login)
    // — throws on failure, which LoginPanel catches and displays.
    const account = await login(email, password);

    // Trigger B (docs/domain/kiosk-session.md): successful login creates a
    // Kiosk Session if none exists yet, or associates the current one with
    // the account if one is already active — it never creates a second
    // session (docs/personal-account-requirements.md, "Kiosk-side login").
    if (session) {
      setSession({ ...session, accountId: account.id });
      touchSessionActivity(session.id, account.id).catch((err: unknown) => {
        console.error('[App] touchSessionActivity request failed:', err);
      });
    } else {
      const newSession: KioskSession = { id: crypto.randomUUID(), accountId: account.id };
      localStorage.setItem(SESSION_ID_STORAGE_KEY, newSession.id);
      setSession(newSession);
      startSession(newSession.id, account.id, 'login').catch((err: unknown) => {
        console.error('[App] startSession request failed:', err);
      });
    }

    // Detection and prompt (docs/personal-account-requirements.md, "Paid
    // orders awaiting print") — checked on every login, from any screen.
    const orders = await listAccountOrders(account.id);
    if (orders.length > 0) {
      setHasPendingPaidOrders(true);
    }
  }

  function handleDismissPaidOrdersPrompt() {
    setHasPendingPaidOrders(false);
  }

  function handleGoToPaidOrders() {
    setHasPendingPaidOrders(false);
    goToPersonalAccount(false, 'orders');
  }

  // Wrapped in useCallback for a stable reference: KioskScreenLayout's
  // inactivity timer (above) depends on this function. Its identity now
  // changes when `session` changes (start/login), which is fine — the
  // inactivity effect already re-subscribes on identity change.
  const handleEndSession = useCallback(
    (reason: EndSessionReason) => {
      // Confirmation (if any — manual or the inactivity auto-end below) has
      // already happened by the time this is called (KioskScreenLayout) —
      // this is the actual cleanup sequence: show the "ending session"
      // screen, tell the backend to delete the session's files
      // synchronously (docs/data-privacy-requirements.md), then reset
      // everything and return to Welcome (docs/domain/kiosk-session.md,
      // "User-visible sequence").
      setScreen('ending-session');
      const cleanup = session
        ? endSession(session.id, reason, session.accountId).catch((err: unknown) => {
            // Network/timeout failure — logged, not retried; the TTL sweep
            // (server/sessionCleanup.ts) is the confirmed fallback for a
            // signal that never arrives.
            console.error('[App] endSession request failed:', err);
          })
        : Promise.resolve();
      Promise.all([cleanup, sleep(ENDING_SESSION_DELAY_MS)]).then(() => {
        localStorage.removeItem(SESSION_ID_STORAGE_KEY);
        setSession(null);
        setCart([]);
        setPaymentItems([]);
        setSelectedFile(null);
        setBatchQueue([]);
        setEmailMessages([]);
        setQrFiles([]);
        setHasQrUploadStarted(false);
        setQrUploadUrl(null);
        setHasReceivedEmail(false);
        setUsedMethods(new Set());
        setHasPendingPaidOrders(false);
        setLanguage('en');
        setScreen('welcome');
      });
    },
    [session],
  );

  function handleAddToCart(order: PrintOrder) {
    setCart((current) => [...current, order]);
    if (!selectedFile) return;
    setUsedMethods((current) => new Set(current).add(selectedFile.sourceMethod));

    // Mid-batch (docs/personal-account-requirements.md, "Batch configure"):
    // move straight to the next queued file's Print Order Configuration —
    // no trip back to the source screen or Cart popup until every file in
    // the batch has been added.
    if (batchQueue.length > 0) {
      const [next, ...rest] = batchQueue;
      setBatchQueue(rest);
      selectFileForConfiguration(next.fileId, next.fileName, next.sourceMethod);
      return;
    }

    // Returns to the screen the file came from (not Upload Method Selection)
    // so the user can process another file from the same source — matches
    // Cart's confirmed purpose (docs/domain/kiosk-session.md). Cart popup
    // opens automatically so the user sees what was just added; they close
    // it themselves to continue.
    if (selectedFile.sourceMethod === 'upload-method-qr') {
      goToQrUpload(true);
    } else if (selectedFile.sourceMethod === 'upload-method-account') {
      goToPersonalAccount(true, 'files');
    } else {
      goToEmailFileList(true);
    }
  }

  function handleQuantityChange(id: string, quantity: number) {
    setCart((current) => current.map((item) => (item.id === id ? { ...item, quantity } : item)));
  }

  function handleRemoveItem(id: string) {
    setCart((current) => current.filter((item) => item.id !== id));
  }

  function handleProceedToPayment(selectedItems: PrintOrder[]) {
    const hasPayableItems = selectedItems.some((item) => computeItemPrice(item) > 0);
    if (!hasPayableItems) {
      // Every checked item is already paid for in full (docs/personal-account-requirements.md,
      // "Paid orders awaiting print") — nothing to charge, so Payment Status
      // is skipped entirely and the batch goes straight to printing.
      setCart((current) =>
        current.filter((item) => !selectedItems.some((selected) => selected.id === item.id)),
      );
      setPrintingItems(selectedItems);
      setScreen('print-status');
      return;
    }
    setPaymentItems(selectedItems);
    setScreen('payment-status');
  }

  function handlePaymentSuccess() {
    // Only the paid batch leaves the cart — anything left unchecked stays
    // behind (docs/cart-requirements.md, "Selection for payment").
    setCart((current) =>
      current.filter((item) => !paymentItems.some((paid) => paid.id === item.id)),
    );
    setPrintingItems(paymentItems);
    setPaymentItems([]);
    setScreen('print-status');
  }

  function handlePrintComplete() {
    setPrintingItems([]);
    setPrintTasks([]);
    setScreen('finalising-session');
  }

  // Resetting to [] re-triggers the submit effect above, which submits a
  // fresh real batch (`printingItems` is untouched, so it's the same files).
  function handleRetryPrint() {
    setPrintTasks([]);
  }

  async function handleSimulatePrintOutcome(
    outcome: 'success' | 'paper-jam' | 'out-of-paper' | 'out-of-ink',
  ) {
    const pending = printTasks.filter((t) => t.status !== 'succeeded' && t.status !== 'failed');
    if (pending.length === 0) return;
    const updated = await Promise.all(
      pending.map((task) => simulatePrintOutcome(task.id, outcome)),
    );
    setPrintTasks((current) =>
      current.map((task) => updated.find((u) => u.id === task.id) ?? task),
    );
  }

  function handleSimulateConnectionLost() {
    setIsConnectionLost(true);
  }

  function handleSimulateConnectionRestored() {
    setIsConnectionLost(false);
  }

  // Card "used" marker (docs/upload-method-requirements.md): QR and Email
  // count as used once files have arrived/been received this session, not
  // only once something from them reached Cart — otherwise the user could
  // lose track of files still sitting unprocessed. `usedMethods` itself
  // still only tracks "added to Cart" (Personal account's marker still
  // depends on that, alongside being logged in).
  const cardMarkerMethods = new Set(usedMethods);
  if (qrFiles.length > 0) cardMarkerMethods.add('upload-method-qr');
  if (emailMessages.length > 0) cardMarkerMethods.add('upload-method-email');

  if (screen === 'upload-method-selection') {
    return (
      <LanguageProvider language={language}>
        <UploadMethodSelectionScreen
          onBack={() => setScreen('welcome')}
          onHome={() => setScreen('welcome')}
          onEndSession={handleEndSession}
          onEmailActivate={() =>
            hasReceivedEmail ? goToEmailFileList(false) : setScreen('email-address')
          }
          onQrActivate={() => {
            if (!hasQrUploadStarted) {
              setHasQrUploadStarted(true);
            }
            goToQrUpload(false);
          }}
          cartItems={cart}
          onQuantityChange={handleQuantityChange}
          onRemoveItem={handleRemoveItem}
          onProceedToPayment={handleProceedToPayment}
          usedMethods={cardMarkerMethods}
          cartOpenOnMount={openCartOnUploadMethodSelection}
          isConnectionLost={isConnectionLost}
          onSimulateConnectionLost={handleSimulateConnectionLost}
          onSimulateConnectionRestored={handleSimulateConnectionRestored}
          onLogin={handleLogin}
          onGoToPersonalAccount={() => goToPersonalAccount(false)}
          accountId={session?.accountId ?? null}
          hasPendingPaidOrders={hasPendingPaidOrders}
          onDismissPaidOrdersPrompt={handleDismissPaidOrdersPrompt}
          onGoToPaidOrders={handleGoToPaidOrders}
          onLanguageChange={setLanguage}
        />
      </LanguageProvider>
    );
  }

  if (screen === 'email-address' && session) {
    return (
      <LanguageProvider language={language}>
        <EmailAddressScreen
          emailAddress={`upload-${session.id.slice(0, 8)}@${import.meta.env.VITE_EMAIL_DOMAIN ?? 'kiosk.example'}`}
          onNext={() => {
            setHasReceivedEmail(true);
            goToEmailFileList(false);
          }}
          onBack={() => goToUploadMethodSelection(false)}
          onHome={() => setScreen('welcome')}
          onEndSession={handleEndSession}
          cartItems={cart}
          onQuantityChange={handleQuantityChange}
          onRemoveItem={handleRemoveItem}
          onProceedToPayment={handleProceedToPayment}
          isConnectionLost={isConnectionLost}
          onSimulateConnectionLost={handleSimulateConnectionLost}
          onSimulateConnectionRestored={handleSimulateConnectionRestored}
          onLogin={handleLogin}
          accountId={session?.accountId ?? null}
          onGoToPersonalAccount={() => goToPersonalAccount(false)}
          hasPendingPaidOrders={hasPendingPaidOrders}
          onDismissPaidOrdersPrompt={handleDismissPaidOrdersPrompt}
          onGoToPaidOrders={handleGoToPaidOrders}
          onLanguageChange={setLanguage}
        />
      </LanguageProvider>
    );
  }

  if (screen === 'email-file-list') {
    return (
      <LanguageProvider language={language}>
        <EmailFileListScreen
          onFileSelect={(fileId, fileName) =>
            selectFileForConfiguration(fileId, fileName, 'upload-method-email')
          }
          onConfigureAllFiles={handleConfigureAllEmailAttachments}
          emails={emailMessages}
          onBack={() => setScreen('email-address')}
          onHome={() => setScreen('welcome')}
          onEndSession={handleEndSession}
          cartItems={cart}
          onQuantityChange={handleQuantityChange}
          onRemoveItem={handleRemoveItem}
          onProceedToPayment={handleProceedToPayment}
          cartOpenOnMount={openCartOnEmailFileList}
          isConnectionLost={isConnectionLost}
          onSimulateConnectionLost={handleSimulateConnectionLost}
          onSimulateConnectionRestored={handleSimulateConnectionRestored}
          onLogin={handleLogin}
          accountId={session?.accountId ?? null}
          onGoToPersonalAccount={() => goToPersonalAccount(false)}
          hasPendingPaidOrders={hasPendingPaidOrders}
          onDismissPaidOrdersPrompt={handleDismissPaidOrdersPrompt}
          onGoToPaidOrders={handleGoToPaidOrders}
          onLanguageChange={setLanguage}
        />
      </LanguageProvider>
    );
  }

  if (screen === 'qr-upload') {
    return (
      <LanguageProvider language={language}>
        <QrUploadScreen
          files={qrFiles}
          qrUploadUrl={qrUploadUrl}
          onFileSelect={(fileId, fileName) =>
            selectFileForConfiguration(fileId, fileName, 'upload-method-qr')
          }
          onConfigureAllFiles={handleConfigureAllQrFiles}
          onBack={() => goToUploadMethodSelection(false)}
          onHome={() => setScreen('welcome')}
          onEndSession={handleEndSession}
          cartItems={cart}
          onQuantityChange={handleQuantityChange}
          onRemoveItem={handleRemoveItem}
          onProceedToPayment={handleProceedToPayment}
          cartOpenOnMount={openCartOnQrUpload}
          isConnectionLost={isConnectionLost}
          onSimulateConnectionLost={handleSimulateConnectionLost}
          onSimulateConnectionRestored={handleSimulateConnectionRestored}
          onLogin={handleLogin}
          accountId={session?.accountId ?? null}
          onGoToPersonalAccount={() => goToPersonalAccount(false)}
          hasPendingPaidOrders={hasPendingPaidOrders}
          onDismissPaidOrdersPrompt={handleDismissPaidOrdersPrompt}
          onGoToPaidOrders={handleGoToPaidOrders}
          onLanguageChange={setLanguage}
        />
      </LanguageProvider>
    );
  }

  if (screen === 'scan') {
    return (
      <LanguageProvider language={language}>
        <ScanScreen
          scanQrUrl={scanQrUrl}
          scanSession={scanSession}
          onRestart={handleScanRestart}
          onBack={() => setScreen('welcome')}
          onHome={() => setScreen('welcome')}
          onEndSession={handleEndSession}
          cartItems={cart}
          onQuantityChange={handleQuantityChange}
          onRemoveItem={handleRemoveItem}
          onProceedToPayment={handleProceedToPayment}
          isConnectionLost={isConnectionLost}
          onSimulateConnectionLost={handleSimulateConnectionLost}
          onSimulateConnectionRestored={handleSimulateConnectionRestored}
          onLogin={handleLogin}
          accountId={session?.accountId ?? null}
          onGoToPersonalAccount={() => goToPersonalAccount(false)}
          hasPendingPaidOrders={hasPendingPaidOrders}
          onDismissPaidOrdersPrompt={handleDismissPaidOrdersPrompt}
          onGoToPaidOrders={handleGoToPaidOrders}
          onLanguageChange={setLanguage}
        />
      </LanguageProvider>
    );
  }

  if (screen === 'personal-account' && session?.accountId) {
    return (
      <LanguageProvider language={language}>
        <PersonalAccountScreen
          key={personalAccountRenderKey}
          onFileSelect={(fileId, fileName) =>
            selectFileForConfiguration(fileId, fileName, 'upload-method-account')
          }
          onConfigureSelectedFiles={handleConfigureSelectedAccountFiles}
          onAddPaidOrderToCart={handleAddPaidOrderToCart}
          initialTab={personalAccountTab}
          onBack={() => goToUploadMethodSelection(false)}
          onHome={() => setScreen('welcome')}
          onEndSession={handleEndSession}
          cartItems={cart}
          onQuantityChange={handleQuantityChange}
          onRemoveItem={handleRemoveItem}
          onProceedToPayment={handleProceedToPayment}
          cartOpenOnMount={openCartOnPersonalAccount}
          isConnectionLost={isConnectionLost}
          onSimulateConnectionLost={handleSimulateConnectionLost}
          onSimulateConnectionRestored={handleSimulateConnectionRestored}
          onLogin={handleLogin}
          accountId={session?.accountId ?? null}
          onGoToPersonalAccount={() => goToPersonalAccount(false)}
          onLogout={handleLogout}
          hasPendingPaidOrders={hasPendingPaidOrders}
          onDismissPaidOrdersPrompt={handleDismissPaidOrdersPrompt}
          onGoToPaidOrders={handleGoToPaidOrders}
          onLanguageChange={setLanguage}
        />
      </LanguageProvider>
    );
  }

  if (screen === 'print-order-configuration' && selectedFile) {
    return (
      <LanguageProvider language={language}>
        <PrintOrderConfigurationScreen
          key={selectedFile.instanceKey}
          fileName={selectedFile.fileName}
          sourceFileId={selectedFile.fileId}
          sourceFileOrigin={
            selectedFile.sourceMethod === 'upload-method-account' ? 'account' : undefined
          }
          onAddToCart={handleAddToCart}
          onBack={() => {
            // Leaving mid-batch abandons the rest of the queue — continuing a
            // partial batch after backing out would be confusing (docs/personal-account-requirements.md,
            // "Batch configure").
            setBatchQueue([]);
            if (selectedFile.sourceMethod === 'upload-method-qr') {
              goToQrUpload(false);
            } else if (selectedFile.sourceMethod === 'upload-method-account') {
              goToPersonalAccount(false, 'files');
            } else {
              setScreen('email-file-list');
            }
          }}
          onHome={() => {
            setBatchQueue([]);
            setScreen('welcome');
          }}
          onEndSession={handleEndSession}
          cartItems={cart}
          onQuantityChange={handleQuantityChange}
          onRemoveItem={handleRemoveItem}
          onProceedToPayment={handleProceedToPayment}
          isConnectionLost={isConnectionLost}
          onSimulateConnectionLost={handleSimulateConnectionLost}
          onSimulateConnectionRestored={handleSimulateConnectionRestored}
          onLogin={handleLogin}
          accountId={session?.accountId ?? null}
          onGoToPersonalAccount={() => goToPersonalAccount(false)}
          hasPendingPaidOrders={hasPendingPaidOrders}
          onDismissPaidOrdersPrompt={handleDismissPaidOrdersPrompt}
          onGoToPaidOrders={handleGoToPaidOrders}
          onLanguageChange={setLanguage}
        />
      </LanguageProvider>
    );
  }

  if (screen === 'payment-status') {
    return (
      <LanguageProvider language={language}>
        <PaymentStatusScreen
          paymentItems={paymentItems}
          cartItems={cart}
          onQuantityChange={handleQuantityChange}
          onRemoveItem={handleRemoveItem}
          onPaymentSuccess={handlePaymentSuccess}
          onCancelPayment={() => {
            setPaymentItems([]);
            goToUploadMethodSelection(false);
          }}
          onReturnHome={() => {
            setPaymentItems([]);
            setScreen('welcome');
          }}
          onEndSession={handleEndSession}
          onProceedToPayment={handleProceedToPayment}
          isConnectionLost={isConnectionLost}
          onSimulateConnectionLost={handleSimulateConnectionLost}
          onSimulateConnectionRestored={handleSimulateConnectionRestored}
          onLogin={handleLogin}
          accountId={session?.accountId ?? null}
          onGoToPersonalAccount={() => goToPersonalAccount(false)}
          hasPendingPaidOrders={hasPendingPaidOrders}
          onDismissPaidOrdersPrompt={handleDismissPaidOrdersPrompt}
          onGoToPaidOrders={handleGoToPaidOrders}
          onLanguageChange={setLanguage}
        />
      </LanguageProvider>
    );
  }

  if (screen === 'print-status') {
    return (
      <LanguageProvider language={language}>
        <PrintStatusScreen
          cartItems={cart}
          onQuantityChange={handleQuantityChange}
          onRemoveItem={handleRemoveItem}
          printTasks={printTasks}
          onPrintComplete={handlePrintComplete}
          onRetryPrint={handleRetryPrint}
          onSimulatePrintOutcome={handleSimulatePrintOutcome}
          onEndSession={handleEndSession}
          onProceedToPayment={handleProceedToPayment}
          isConnectionLost={isConnectionLost}
          onSimulateConnectionLost={handleSimulateConnectionLost}
          onSimulateConnectionRestored={handleSimulateConnectionRestored}
          onLogin={handleLogin}
          accountId={session?.accountId ?? null}
          onGoToPersonalAccount={() => goToPersonalAccount(false)}
          hasPendingPaidOrders={hasPendingPaidOrders}
          onDismissPaidOrdersPrompt={handleDismissPaidOrdersPrompt}
          onGoToPaidOrders={handleGoToPaidOrders}
          onLanguageChange={setLanguage}
        />
      </LanguageProvider>
    );
  }

  if (screen === 'ending-session') {
    return (
      <LanguageProvider language={language}>
        <EndingSessionScreen />
      </LanguageProvider>
    );
  }

  if (screen === 'finalising-session') {
    return (
      <LanguageProvider language={language}>
        <FinalisingSessionScreen
          onReturnToWelcome={() => setScreen('welcome')}
          onEndSession={handleEndSession}
          cartItems={cart}
          onQuantityChange={handleQuantityChange}
          onRemoveItem={handleRemoveItem}
          onProceedToPayment={handleProceedToPayment}
          isConnectionLost={isConnectionLost}
          onSimulateConnectionLost={handleSimulateConnectionLost}
          onSimulateConnectionRestored={handleSimulateConnectionRestored}
          onLogin={handleLogin}
          accountId={session?.accountId ?? null}
          onGoToPersonalAccount={() => goToPersonalAccount(false)}
          hasPendingPaidOrders={hasPendingPaidOrders}
          onDismissPaidOrdersPrompt={handleDismissPaidOrdersPrompt}
          onGoToPaidOrders={handleGoToPaidOrders}
          onLanguageChange={setLanguage}
        />
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider language={language}>
      <WelcomeScreen
        onPrintActivate={handlePrintActivate}
        onScanActivate={handleScanActivate}
        sessionActive={session !== null}
        onEndSession={handleEndSession}
        cartItems={cart}
        onQuantityChange={handleQuantityChange}
        onRemoveItem={handleRemoveItem}
        onProceedToPayment={handleProceedToPayment}
        isConnectionLost={isConnectionLost}
        onSimulateConnectionLost={handleSimulateConnectionLost}
        onSimulateConnectionRestored={handleSimulateConnectionRestored}
        onLogin={handleLogin}
        accountId={session?.accountId ?? null}
        onGoToPersonalAccount={() => goToPersonalAccount(false)}
        hasPendingPaidOrders={hasPendingPaidOrders}
        onDismissPaidOrdersPrompt={handleDismissPaidOrdersPrompt}
        onGoToPaidOrders={handleGoToPaidOrders}
        onLanguageChange={setLanguage}
      />
    </LanguageProvider>
  );
}

export default App;
