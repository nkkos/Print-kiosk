import type { ReactNode } from 'react';

// The shared shell (docs/screens/portal-personal-account-spec.md) — header
// ("Welcome, {email}!" + EXIT) and sidebar (My files/My orders/Account
// information enabled and real; Invoices/My promo codes/Payment methods
// shown disabled/"coming soon", not omitted, so the account's eventual full
// scope is visible even before it's built). Real navigation between
// destinations (separate HTML pages, portal/session.ts keeps the session
// token across the page loads) rather than client-side view switching — see
// that spec's "Notes for implementation".
export type PortalDestination = 'files' | 'orders' | 'account' | null;

interface PortalShellProps {
  email: string;
  active: PortalDestination;
  onLogout: () => void;
  children: ReactNode;
}

export function PortalShell({ email, active, onLogout, children }: PortalShellProps) {
  function navClass(destination: PortalDestination): string | undefined {
    return destination === active ? 'shellNavActive' : undefined;
  }

  return (
    <div className="shell">
      <header className="shellHeader">
        <span className="shellWelcome">Welcome, {email}!</span>
        <button type="button" id="portal-exit" onClick={onLogout}>
          EXIT
        </button>
      </header>
      <div className="shellBody">
        <nav className="shellSidebar">
          <a id="portal-nav-files" href="./files.html" className={navClass('files')}>
            My files
          </a>
          <a id="portal-nav-orders" href="./orders.html" className={navClass('orders')}>
            My orders
          </a>
          <span id="portal-nav-invoices" className="shellNavDisabled">
            Invoices
          </span>
          <span id="portal-nav-promo-codes" className="shellNavDisabled">
            My promo codes
          </span>
          <a id="portal-nav-account-info" href="./account.html" className={navClass('account')}>
            Account information
          </a>
          <span id="portal-nav-payment-methods" className="shellNavDisabled">
            Payment methods
          </span>
        </nav>
        <main className="shellContent">{children}</main>
      </div>
    </div>
  );
}
