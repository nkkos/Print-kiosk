import { useCallback, useEffect, useState } from 'react';
import { startSession, endSession } from '../src/services/sessionApi';
import type { EndSessionReason } from '../src/types/kiosk';
import { PhotoKioskLayout } from './PhotoKioskLayout';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { MenuScreen } from './screens/MenuScreen';
import { DocumentPhotoScreen } from './screens/DocumentPhotoScreen';
import { SelectCountryScreen } from './screens/SelectCountryScreen';
import { CustomSizeScreen } from './screens/CustomSizeScreen';
import { ConfirmConfigScreen } from './screens/ConfirmConfigScreen';
import { AiBackgroundGalleryScreen } from './screens/AiBackgroundGalleryScreen';
import { AiBackgroundProcessingScreen } from './screens/AiBackgroundProcessingScreen';
import { CaptureScreen } from './screens/CaptureScreen';
import { ShotReviewScreen } from './screens/ShotReviewScreen';
import { GalleryScreen } from './screens/GalleryScreen';
import { PaymentScreen } from './screens/PaymentScreen';
import { PrintScreen } from './screens/PrintScreen';
import { EndingSessionScreen } from './screens/EndingSessionScreen';
import { FinalisingSessionScreen } from './screens/FinalisingSessionScreen';
import { composeA4Sheet, DEFAULT_PHOTOS_PER_SHEET } from './sheetComposer';
import { recordPhotoOrder, markPhotoOrdersPrinted } from './services/photoKioskApi';
import { DEFAULT_PRICE_CENTS } from './pricing';
import { compositeOntoImageBackground } from './portraitMatting';
import type { AiBackgroundLook } from './aiBackgroundLooks';
import type { CaptureSpec, PendingShot, PhotoCartItem } from './types';

type Screen =
  | 'welcome'
  | 'menu'
  | 'document-photo'
  | 'select-country'
  | 'custom-size'
  | 'confirm-config'
  | 'ai-background-gallery'
  | 'capture'
  | 'shot-review'
  | 'ai-background-processing'
  | 'gallery'
  | 'payment'
  | 'print'
  | 'finalising-session'
  | 'ending-session';

// "AI бэкграунд"'s fixed photo spec — a plain souvenir portrait, not a
// compliance document, so none of CaptureSpec's crop-anchor/head-size
// fields apply (cropUtil.ts's defaults produce a normal centred portrait
// crop when they're all absent). 100×150mm matches the classic 10×15cm
// print size the original wireframe's now-dropped standalone "10×15" menu
// button was for (docs/photo-kiosk-requirements.md's menu revision note).
const AI_BACKGROUND_SPEC: CaptureSpec = {
  label: 'AI фото',
  widthMm: 100,
  heightMm: 150,
};

const SESSION_ID_STORAGE_KEY = 'photo-kiosk.sessionId';
const ENDING_SESSION_DELAY_MS = 1200;
// Privacy safeguard, independent of the session-level idle timer below: the
// idle timer resets on ANY touch, from anyone — on a kiosk with continuous
// foot traffic it can never fire, so it alone cannot bound how long an
// abandoned cart item (with a real photo thumbnail, unlike the document
// kiosk's cart, which only ever shows a filename) stays reachable by the
// next customer. This sweep drops unpaid cart items by wall-clock age
// instead, unaffected by anyone else's activity. 3 minutes is a placeholder
// balancing "long enough for a customer legitimately adding a second/third
// document type" against "short enough to bound exposure" — adjust freely.
const CART_ITEM_TTL_MS = 3 * 60 * 1000;
const CART_SWEEP_INTERVAL_MS = 5 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Composition root — same "no router yet" Screen-union pattern as src/App.tsx,
// admin/AdminApp.tsx, shop/ShopApp.tsx (docs/implementation/project-architecture.md's
// reasoning, reused for this fifth mini-app). Wraps the entire screen switch in
// one PhotoKioskLayout (simpler than src/App.tsx's per-screen-wraps-itself
// convention — justified since this layout's prop surface is far smaller).
export function PhotoKioskApp() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [sessionId, setSessionId] = useState<string | null>(() =>
    localStorage.getItem(SESSION_ID_STORAGE_KEY),
  );
  const [spec, setSpec] = useState<CaptureSpec | null>(null);
  const [pendingShot, setPendingShot] = useState<PendingShot | null>(null);
  const [acceptedShot, setAcceptedShot] = useState<string | null>(null);
  // Non-null only while the customer is inside the "AI бэкграунд" flow —
  // set on AiBackgroundGalleryScreen's pick, read once ShotReviewScreen's
  // crop is confirmed to run compositeOntoImageBackground, then cleared on
  // End Session same as the rest of this screen's photo-related state.
  const [selectedLook, setSelectedLook] = useState<AiBackgroundLook | null>(null);
  // The crop ShotReviewScreen just confirmed, waiting for
  // ai-background-processing's effect (below) to composite it — a separate
  // piece of state from `acceptedShot` so GalleryScreen never briefly shows
  // the plain (not-yet-composited) shot while that runs.
  const [shotAwaitingComposite, setShotAwaitingComposite] = useState<string | null>(null);
  // Which screen led into 'confirm-config' — select-country and custom-size
  // both land there, so its own Back needs to know which one to return to.
  const [configOrigin, setConfigOrigin] = useState<'select-country' | 'custom-size'>(
    'select-country',
  );
  const [cart, setCart] = useState<PhotoCartItem[]>([]);
  // Snapshot of the checked subset at "Оплатить" time (docs/cart-requirements.md,
  // "Selection for payment") — mirrors src/App.tsx's own paymentItems/cart
  // split: unchecked items stay behind in `cart`, untouched, until this batch
  // either pays (removed from cart, moved into printingItems) or is cancelled
  // (cart was never touched, so there's nothing to restore).
  const [paymentItems, setPaymentItems] = useState<PhotoCartItem[]>([]);
  const [printingItems, setPrintingItems] = useState<PhotoCartItem[]>([]);
  const [isComposingSheet, setIsComposingSheet] = useState(false);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [printedOrderIds, setPrintedOrderIds] = useState<string[]>([]);
  // The actual print-page preview (GalleryScreen) — kept live once a shot is
  // accepted, rather than only composed once at "Добавить в корзину," so the
  // customer always sees what will really print (N copies of the one
  // confirmed shot), not a raw individual frame.
  const [sheetPreview, setSheetPreview] = useState<string | null>(null);
  const photosPerSheet = spec?.copiesPerSheet ?? DEFAULT_PHOTOS_PER_SHEET;
  const unitPriceCents = spec?.priceCents ?? DEFAULT_PRICE_CENTS;
  // Cart popup open/closed is owned here (not inside PhotoKioskLayout) so
  // "Добавить в корзину" can open it explicitly to show the customer what
  // just happened — see PhotoKioskLayout.tsx's isCartOpen prop comment.
  const [isCartOpen, setIsCartOpen] = useState(false);

  // "AI бэкграунд"'s compositing step — runs once, when a confirmed crop is
  // waiting and the customer is actually on ai-background-processing (not
  // just whenever shotAwaitingComposite happens to be set, since Strict
  // Mode/re-renders would otherwise risk firing it twice for the same
  // shot). Falls back to the plain (uncomposited) shot on failure rather
  // than leaving the customer stuck on a screen with no way forward.
  useEffect(() => {
    if (screen !== 'ai-background-processing' || !shotAwaitingComposite || !selectedLook) return;
    let cancelled = false;
    const bgImage = new Image();
    bgImage.src = selectedLook.imageUrl;
    bgImage
      .decode()
      .then(() => compositeOntoImageBackground(shotAwaitingComposite, bgImage))
      .catch((err: unknown) => {
        console.error('[PhotoKioskApp] compositeOntoImageBackground failed:', err);
        return shotAwaitingComposite;
      })
      .then((result) => {
        if (cancelled) return;
        setAcceptedShot(result);
        setShotAwaitingComposite(null);
        setScreen('gallery');
      });
    return () => {
      cancelled = true;
    };
  }, [screen, shotAwaitingComposite, selectedLook]);

  useEffect(() => {
    if (!spec || !acceptedShot) {
      setSheetPreview(null);
      return;
    }
    let cancelled = false;
    composeA4Sheet(acceptedShot, spec, photosPerSheet).then((dataUrl) => {
      if (!cancelled) setSheetPreview(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [acceptedShot, spec, photosPerSheet]);

  // Cart-item expiry sweep — see CART_ITEM_TTL_MS's comment above. Runs
  // regardless of `screen`, so an abandoned cart is cleared out even if the
  // next customer immediately starts using the kiosk and keeps the
  // session-level idle timer perpetually reset.
  useEffect(() => {
    const intervalId = setInterval(() => {
      setCart((current) =>
        current.filter((item) => Date.now() - item.createdAt < CART_ITEM_TTL_MS),
      );
    }, CART_SWEEP_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  function ensureSession(): string {
    if (sessionId) return sessionId;
    const id = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_STORAGE_KEY, id);
    setSessionId(id);
    startSession(id, null, 'photo-kiosk').catch((err: unknown) => {
      console.error('[PhotoKioskApp] startSession failed:', err);
    });
    return id;
  }

  // Privacy framing (docs/domain/kiosk-session.md's "delete the file content,
  // retain the metadata/fact of the transaction," applied even more strictly
  // to photos): unlike documents, no photo pixel data is ever written
  // server-side (A4 composition is entirely client-side, photoOrders stores
  // metadata only) — so the entire cleanup surface here is React state
  // (cleared synchronously below) plus the live camera MediaStream (already
  // stopped on CaptureScreen's own unmount). No URL.createObjectURL is used
  // anywhere in this app, so there is nothing to revoke either.
  const handleEndSession = useCallback(
    (reason: EndSessionReason) => {
      setScreen('ending-session');
      const cleanup = sessionId
        ? endSession(sessionId, reason, null).catch((err: unknown) => {
            console.error('[PhotoKioskApp] endSession failed:', err);
          })
        : Promise.resolve();
      Promise.all([cleanup, sleep(ENDING_SESSION_DELAY_MS)]).then(() => {
        localStorage.removeItem(SESSION_ID_STORAGE_KEY);
        setSessionId(null);
        setSpec(null);
        setPendingShot(null);
        setAcceptedShot(null);
        setSelectedLook(null);
        setShotAwaitingComposite(null);
        setCart([]);
        setPaymentItems([]);
        setPrintingItems([]);
        setIsCartOpen(false);
        setPrintedOrderIds([]);
        setScreen('welcome');
      });
    },
    [sessionId],
  );

  async function handleAddToCart() {
    if (!spec || !acceptedShot) return;
    setIsComposingSheet(true);
    const sheetPreviewDataUrl = await composeA4Sheet(acceptedShot, spec, photosPerSheet);
    setCart((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        spec,
        shot: acceptedShot,
        photosPerSheet,
        unitPriceCents,
        quantity: 1,
        sheetPreviewDataUrl,
        createdAt: Date.now(),
      },
    ]);
    setSpec(null);
    setAcceptedShot(null);
    setIsComposingSheet(false);
    setScreen('menu');
    // Opens the Cart so the customer actually sees what was just added,
    // instead of a silent footer star marker (see PhotoKioskLayout.tsx's
    // isCartOpen prop comment).
    setIsCartOpen(true);
  }

  function handleRemoveCartItem(id: string) {
    setCart((prev) => prev.filter((item) => item.id !== id));
  }

  function handleUpdateCartItemQuantity(id: string, quantity: number) {
    setCart((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item)),
    );
  }

  function handleProceedToPayment(selectedItems: PhotoCartItem[]) {
    ensureSession();
    setPaymentItems(selectedItems);
    setScreen('payment');
  }

  function handleCancelPayment() {
    // Cart was never touched for this batch — nothing to restore.
    setPaymentItems([]);
    setScreen('menu');
  }

  async function handlePaymentSuccess() {
    setIsRecordingPayment(true);
    const orderIds = await Promise.all(
      paymentItems.map((item) =>
        recordPhotoOrder({
          sessionId,
          spec: {
            label: item.spec.label,
            widthMm: item.spec.widthMm,
            heightMm: item.spec.heightMm,
            dpi: item.spec.dpi ?? null,
          },
          shotCount: item.photosPerSheet,
          quantity: item.quantity,
          amountCents: item.unitPriceCents * item.quantity,
        }).then((order) => order.id),
      ),
    );
    setPrintedOrderIds(orderIds);
    // Only the paid batch leaves the cart — anything left unchecked stays
    // behind (docs/cart-requirements.md, "Selection for payment").
    setCart((current) =>
      current.filter((item) => !paymentItems.some((paid) => paid.id === item.id)),
    );
    setPrintingItems(paymentItems);
    setPaymentItems([]);
    setIsRecordingPayment(false);
    setScreen('print');
  }

  async function handlePrintComplete() {
    await markPhotoOrdersPrinted(printedOrderIds).catch((err: unknown) => {
      console.error('[PhotoKioskApp] markPhotoOrdersPrinted failed:', err);
    });
    // printingItems is deliberately NOT cleared here — FinalisingSessionScreen
    // offers to email/download the just-printed shot(s), so they need to
    // survive into that screen. Cleared for real on End Session instead.
    setPrintedOrderIds([]);
    setScreen('finalising-session');
  }

  const onBack: (() => void) | undefined = (
    {
      welcome: undefined,
      menu: () => setScreen('welcome'),
      'document-photo': () => setScreen('menu'),
      'select-country': () => setScreen('document-photo'),
      'custom-size': () => setScreen('document-photo'),
      'confirm-config': () => setScreen(configOrigin),
      'ai-background-gallery': () => setScreen('menu'),
      capture: () =>
        setScreen(
          selectedLook
            ? 'ai-background-gallery'
            : spec && !acceptedShot
              ? 'confirm-config'
              : 'gallery',
        ),
      'shot-review': undefined,
      'ai-background-processing': undefined,
      gallery: undefined,
      payment: undefined,
      print: undefined,
      // Same destination as Home (docs/domain/kiosk-session.md,
      // "Finalising session's Back action leads to the Welcome Screen") —
      // the order has been delivered, so this just navigates, without
      // ending the session (the user may want to print something else).
      'finalising-session': () => setScreen('welcome'),
      'ending-session': undefined,
    } satisfies Record<Screen, (() => void) | undefined>
  )[screen];

  // End Session is blocked from the moment payment begins until printing
  // completes or fails (docs/domain/kiosk-session.md: "Blocked during a
  // committed transaction") — mirrors the main kiosk's Payment/Print screens
  // both passing sessionActive={false}. Available again on Finalising
  // Session, since the order has now been delivered.
  const sessionActive =
    sessionId !== null && screen !== 'ending-session' && screen !== 'payment' && screen !== 'print';

  return (
    <PhotoKioskLayout
      sessionActive={sessionActive}
      onEndSession={handleEndSession}
      onBack={onBack}
      cartItems={cart}
      onRemoveCartItem={handleRemoveCartItem}
      onUpdateCartItemQuantity={handleUpdateCartItemQuantity}
      isCartOpen={isCartOpen}
      onCartOpenChange={setIsCartOpen}
      onProceedToPayment={handleProceedToPayment}
    >
      {screen === 'welcome' && (
        <WelcomeScreen
          onStartPhoto={() => {
            ensureSession();
            setScreen('menu');
          }}
        />
      )}

      {screen === 'menu' && (
        <MenuScreen
          onSelectDocumentPhoto={() => {
            // Guards against a stale selectedLook from an abandoned "AI
            // бэкграунд" attempt wrongly triggering compositing later in
            // THIS (document-photo) flow, which shares capture/shot-review.
            setSelectedLook(null);
            setScreen('document-photo');
          }}
          onSelectAiBackground={() => setScreen('ai-background-gallery')}
        />
      )}

      {screen === 'document-photo' && (
        <DocumentPhotoScreen
          onSelectCountry={() => setScreen('select-country')}
          onSelectCustomSize={() => setScreen('custom-size')}
        />
      )}

      {screen === 'select-country' && (
        <SelectCountryScreen
          onSelectDocument={(document, countryName) => {
            setSpec({
              label: `${countryName}: ${document.label}`,
              widthMm: document.photoWidthMm,
              heightMm: document.photoHeightMm,
              instructions: document.instructions,
              dpi: document.dpi,
              headHeightMinMm: document.headHeightMinMm,
              headHeightMaxMm: document.headHeightMaxMm,
              eyeLineFromBottomMm: document.eyeLineFromBottomMm ?? undefined,
              marginTopMm: document.marginTopMm ?? undefined,
              headWidthMinMm: document.headWidthMinMm ?? undefined,
              headWidthMaxMm: document.headWidthMaxMm ?? undefined,
              copiesPerSheet: document.copiesPerSheet,
              priceCents: document.priceCents,
              backgroundColorHex: document.backgroundColorHex ?? undefined,
            });
            setConfigOrigin('select-country');
            setScreen('confirm-config');
          }}
        />
      )}

      {screen === 'custom-size' && (
        <CustomSizeScreen
          onConfirm={(customSpec) => {
            setSpec(customSpec);
            setConfigOrigin('custom-size');
            setScreen('confirm-config');
          }}
        />
      )}

      {screen === 'confirm-config' && spec && (
        <ConfirmConfigScreen spec={spec} onConfirm={() => setScreen('capture')} />
      )}

      {screen === 'ai-background-gallery' && (
        <AiBackgroundGalleryScreen
          onSelectLook={(look) => {
            setSelectedLook(look);
            setSpec(AI_BACKGROUND_SPEC);
            setScreen('capture');
          }}
        />
      )}

      {screen === 'capture' && spec && (
        <CaptureScreen
          spec={spec}
          onCaptured={(shot) => {
            setPendingShot(shot);
            setScreen('shot-review');
          }}
        />
      )}

      {screen === 'shot-review' && pendingShot && spec && (
        <ShotReviewScreen
          rawDataUrl={pendingShot.rawDataUrl}
          rawWidth={pendingShot.rawWidth}
          rawHeight={pendingShot.rawHeight}
          landmarks={pendingShot.landmarks}
          spec={spec}
          onRetake={() => {
            setPendingShot(null);
            setScreen('capture');
          }}
          onAccept={(finalDataUrl) => {
            setPendingShot(null);
            if (selectedLook) {
              // Composited in ai-background-processing's own effect, not
              // here — needs to await loading the look's image first.
              setShotAwaitingComposite(finalDataUrl);
              setScreen('ai-background-processing');
            } else {
              setAcceptedShot(finalDataUrl);
              setScreen('gallery');
            }
          }}
        />
      )}

      {screen === 'ai-background-processing' && <AiBackgroundProcessingScreen />}

      {screen === 'gallery' && spec && (
        <GalleryScreen
          spec={spec}
          hasAcceptedShot={acceptedShot !== null}
          copies={photosPerSheet}
          sheetPreview={sheetPreview}
          onRetake={() => {
            setAcceptedShot(null);
            setScreen('capture');
          }}
          onAddToCart={handleAddToCart}
          isComposingSheet={isComposingSheet}
        />
      )}

      {screen === 'payment' && (
        <PaymentScreen
          items={paymentItems}
          onPaymentSuccess={handlePaymentSuccess}
          onCancelPayment={handleCancelPayment}
          isRecording={isRecordingPayment}
        />
      )}

      {screen === 'print' && (
        <PrintScreen items={printingItems} onPrintComplete={handlePrintComplete} />
      )}

      {screen === 'finalising-session' && <FinalisingSessionScreen items={printingItems} />}

      {screen === 'ending-session' && <EndingSessionScreen />}
    </PhotoKioskLayout>
  );
}
