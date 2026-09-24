import { useEffect, useState } from 'react';
import { listMyCompanyInvoices, type CompanyInvoice } from '../services/businessApi';

interface InvoicesScreenProps {
  sessionToken: string;
}

const STATUS_LABEL: Record<CompanyInvoice['status'], string> = {
  draft: 'Draft (not sent yet)',
  issued: 'Issued',
  paid: 'Paid',
  failed: 'Failed',
};

function centsToEuro(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Admin-only within the company (server/routes.ts 403s a 'member' role) —
// BusinessApp.tsx only shows this nav item for role: 'admin' to begin with,
// this is the server-side half of that same rule.
export function InvoicesScreen({ sessionToken }: InvoicesScreenProps) {
  const [invoices, setInvoices] = useState<CompanyInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMyCompanyInvoices(sessionToken)
      .then(setInvoices)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [sessionToken]);

  return (
    <section className="view" id="view-invoices">
      <div className="view-header">
        <div>
          <h1 className="view-title">Invoices</h1>
        </div>
      </div>

      {error && <p className="login-error">{error}</p>}

      {!invoices ? (
        <p className="empty-note">Loading…</p>
      ) : invoices.length === 0 ? (
        <p className="empty-note">No invoices yet.</p>
      ) : (
        <div className="incident-feed" id="business-invoices-list">
          {invoices.map((invoice) => (
            <div className="incident-row incident-row-static" key={invoice.id}>
              <span className="incident-time" style={{ width: 'auto' }}>
                {new Date(invoice.periodStart).toLocaleDateString()} –{' '}
                {new Date(invoice.periodEnd).toLocaleDateString()}
              </span>
              <span className="incident-code">{centsToEuro(invoice.totalCents)} €</span>
              <span className="incident-target">
                net {centsToEuro(invoice.totalNetCents)} € + VAT {invoice.vatRatePercent}% (
                {centsToEuro(invoice.totalVatCents)} €)
              </span>
              <span className="incident-target">{STATUS_LABEL[invoice.status]}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
