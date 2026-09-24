import { useEffect, useState } from 'react';
import { login } from '../src/services/accountApi';
import { getMyCompany, acceptCompanyInvite, type CompanyMembership } from './services/businessApi';
import {
  saveBusinessSession,
  loadBusinessSession,
  clearBusinessSession,
  type BusinessSession,
} from './businessSession';
import { SignInScreen } from './screens/SignInScreen';
import { AcceptInviteScreen } from './screens/AcceptInviteScreen';
import { NewPrintJobScreen } from './screens/NewPrintJobScreen';
import { OrdersScreen } from './screens/OrdersScreen';
import { InvoicesScreen } from './screens/InvoicesScreen';

type Screen = 'new-print-job' | 'orders' | 'invoices';

// Composition root — same "no router yet" pattern as src/App.tsx and
// admin/AdminApp.tsx (docs, "B2B company-billing portal" plan): a handful
// of screens an employee moves between repeatedly in one visit, no genuine
// need for URL-addressable routing.
export function BusinessApp() {
  const [session, setSession] = useState<BusinessSession | null>(() => loadBusinessSession());
  const [membership, setMembership] = useState<CompanyMembership | null | 'loading'>('loading');
  const [screen, setScreen] = useState<Screen>('new-print-job');

  const inviteToken = new URLSearchParams(window.location.search).get('token');

  useEffect(() => {
    if (!session) {
      setMembership('loading');
      return;
    }
    let cancelled = false;
    getMyCompany(session.sessionToken)
      .then((result) => {
        if (!cancelled) setMembership(result);
      })
      .catch(() => {
        if (!cancelled) {
          clearBusinessSession();
          setSession(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  function logout() {
    clearBusinessSession();
    setSession(null);
  }

  // An invite link takes priority over an existing session — a link is only
  // ever opened once, right after receiving the email, so there's no real
  // case where an already-signed-in employee should see this instead of
  // just being logged in already.
  if (inviteToken && !session) {
    return (
      <AcceptInviteScreen
        onAccept={async (password) => {
          const result = await acceptCompanyInvite(inviteToken, password);
          const account = {
            id: result.accountId,
            email: result.email,
            sessionToken: result.sessionToken,
          };
          saveBusinessSession(account);
          setSession(account);
          window.history.replaceState({}, '', window.location.pathname);
        }}
      />
    );
  }

  if (!session) {
    return (
      <SignInScreen
        onSignIn={async (email, password) => {
          const account = await login(email, password);
          saveBusinessSession(account);
          setSession(account);
        }}
      />
    );
  }

  if (membership === 'loading') {
    return <div className="login-wrap">Loading…</div>;
  }

  if (!membership) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>No company access</h1>
          <p className="view-sub">
            This account isn't linked to a company yet — ask your company admin to invite you.
          </p>
          <button type="button" className="btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="mark">DP</span>
          <span>{membership.company.name}</span>
        </div>
        <nav className="topbar-nav">
          <button
            id="business-nav-new-print-job"
            className={`nav-link${screen === 'new-print-job' ? ' current' : ''}`}
            onClick={() => setScreen('new-print-job')}
          >
            New print job
          </button>
          <button
            id="business-nav-orders"
            className={`nav-link${screen === 'orders' ? ' current' : ''}`}
            onClick={() => setScreen('orders')}
          >
            Orders
          </button>
          {membership.role === 'admin' && (
            <button
              id="business-nav-invoices"
              className={`nav-link${screen === 'invoices' ? ' current' : ''}`}
              onClick={() => setScreen('invoices')}
            >
              Invoices
            </button>
          )}
        </nav>
        <div className="topbar-spacer" />
        <button className="logout-btn" onClick={logout}>
          {session.email} · Sign out
        </button>
      </div>
      {screen === 'new-print-job' && (
        <NewPrintJobScreen
          sessionToken={session.sessionToken}
          companyName={membership.company.name}
        />
      )}
      {screen === 'orders' && <OrdersScreen sessionToken={session.sessionToken} />}
      {screen === 'invoices' && membership.role === 'admin' && (
        <InvoicesScreen sessionToken={session.sessionToken} />
      )}
    </div>
  );
}
