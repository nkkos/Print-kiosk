import { useEffect, useRef, useState } from 'react';
import {
  listPrintOrders,
  updateInvoiceDetails,
  getMe,
  checkout,
  type CheckoutResult,
} from '../services/shopApi';
import { loadShopSession, type ShopSession } from '../shopSession';

interface CheckoutScreenProps {
  session: ShopSession | null;
  cartItems: Record<string, number>;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
  onComplete: (result: CheckoutResult) => void;
}

// Same polling interval already established for this kind of "wait for an external
// confirmation" pattern elsewhere in the project (src/App.tsx's QR_POLL_INTERVAL_MS).
const VERIFICATION_POLL_INTERVAL_MS = 3000;

type Stage = 'form' | 'waiting-for-verification' | 'submitting';

// One screen combining fulfillment method, account fields, and optional invoice
// details, per docs/shop-checkout-requirements.md's "Checkout screen". Deliberately
// an experiment per that document: a new/unverified account pauses here until
// verified, auto-detected by polling — abandonment (leaving without verifying) is
// expected and not treated as an error.
export function CheckoutScreen({
  session,
  cartItems,
  onLogin,
  onRegister,
  onComplete,
}: CheckoutScreenProps) {
  const [stage, setStage] = useState<Stage>('form');
  const [mode, setMode] = useState<'login' | 'register'>(session ? 'login' : 'register');
  const [email, setEmail] = useState(session?.email ?? '');
  const [password, setPassword] = useState('');
  const [needsInvoice, setNeedsInvoice] = useState(false);
  const [invoiceCompanyName, setInvoiceCompanyName] = useState('');
  const [invoiceTaxId, setInvoiceTaxId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function runCheckout(sessionToken: string) {
    if (needsInvoice) {
      await updateInvoiceDetails(sessionToken, invoiceCompanyName || null, invoiceTaxId || null);
    }
    const printOrders = await listPrintOrders(sessionToken);
    const printOrderIds = printOrders
      .filter((order) => order.status === 'created')
      .map((o) => o.id);
    const shopItems = Object.entries(cartItems).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
    const result = await checkout(sessionToken, printOrderIds, shopItems);
    onComplete(result);
  }

  function waitForVerification(sessionToken: string) {
    setStage('waiting-for-verification');
    pollRef.current = setInterval(() => {
      getMe(sessionToken)
        .then((profile) => {
          if (profile.emailVerified && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setStage('submitting');
            runCheckout(sessionToken).catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'Checkout failed');
              setStage('form');
            });
          }
        })
        .catch(() => {
          // Transient network error — keep polling, don't surface an error for this.
        });
    }, VERIFICATION_POLL_INTERVAL_MS);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStage('submitting');
    try {
      let sessionToken = session?.sessionToken;
      let emailVerified = true;

      if (!sessionToken) {
        if (mode === 'register') {
          await onRegister(email, password);
        } else {
          await onLogin(email, password);
        }
        // onLogin/onRegister update the session prop asynchronously (parent
        // re-render) — read the freshly-created token straight from storage
        // instead of racing that prop update.
        const stored = loadShopSession();
        if (!stored) throw new Error('Could not establish a session');
        sessionToken = stored.sessionToken;
        const profile = await getMe(sessionToken);
        emailVerified = profile.emailVerified;
      } else {
        const profile = await getMe(sessionToken);
        emailVerified = profile.emailVerified;
      }

      if (!emailVerified) {
        waitForVerification(sessionToken);
        return;
      }
      await runCheckout(sessionToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStage('form');
    }
  }

  if (stage === 'waiting-for-verification') {
    return (
      <section className="shop-view" id="view-checkout">
        <div className="shop-verify-wait" id="checkout-verify-wait">
          <h1>Проверьте почту</h1>
          <p>
            Мы отправили письмо на <b>{email}</b>. Перейдите по ссылке в письме, чтобы подтвердить
            email — эта страница сама продолжит оформление, ничего нажимать не нужно.
          </p>
          <p className="shop-empty-note">Можно закрыть эту вкладку и вернуться позже.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="shop-view" id="view-checkout">
      <div className="shop-view-header">
        <h1>Оформление заказа</h1>
      </div>

      {error && <p className="shop-error">{error}</p>}

      <form onSubmit={handleSubmit} className="shop-checkout-form">
        <div className="shop-form-section">
          <span className="shop-field-label">Способ получения</span>
          <p id="checkout-fulfillment-method">Самовывоз в павильоне</p>
        </div>

        <div className="shop-form-section">
          <span className="shop-field-label">Способ оплаты</span>
          <p>Картой при оформлении</p>
        </div>

        <div className="shop-form-section">
          <span className="shop-field-label">Аккаунт</span>
          {session ? (
            <p id="checkout-account-email">{session.email}</p>
          ) : (
            <>
              <div className="shop-mode-toggle">
                <button
                  type="button"
                  className={mode === 'register' ? 'active' : ''}
                  onClick={() => setMode('register')}
                >
                  Новый аккаунт
                </button>
                <button
                  type="button"
                  className={mode === 'login' ? 'active' : ''}
                  onClick={() => setMode('login')}
                >
                  Уже есть аккаунт
                </button>
              </div>
              <input
                type="email"
                id="checkout-email"
                className="shop-input"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                id="checkout-password"
                className="shop-input"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </>
          )}
        </div>

        <div className="shop-form-section">
          <label className="shop-checkbox-label">
            <input
              type="checkbox"
              id="checkout-needs-invoice"
              checked={needsInvoice}
              onChange={(e) => setNeedsInvoice(e.target.checked)}
            />
            Мне нужен счёт для юрлица
          </label>
          {needsInvoice && (
            <div className="shop-invoice-fields">
              <input
                type="text"
                id="checkout-invoice-company"
                className="shop-input"
                placeholder="Название компании"
                value={invoiceCompanyName}
                onChange={(e) => setInvoiceCompanyName(e.target.value)}
              />
              <input
                type="text"
                id="checkout-invoice-tax-id"
                className="shop-input"
                placeholder="Налоговый номер"
                value={invoiceTaxId}
                onChange={(e) => setInvoiceTaxId(e.target.value)}
              />
            </div>
          )}
        </div>

        <button
          type="submit"
          className="shop-btn shop-btn-primary"
          id="checkout-submit"
          disabled={stage === 'submitting'}
        >
          {stage === 'submitting' ? 'Обрабатываем…' : 'Далее'}
        </button>
      </form>
    </section>
  );
}
