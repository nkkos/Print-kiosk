import { useEffect, useState } from 'react';
import {
  listCompanies,
  createCompany,
  listCompanyMembers,
  inviteCompanyMember,
  listCompanyInvoices,
  generateCompanyInvoice,
  issueCompanyInvoice,
  type Company,
  type CompanyFormFields,
  type CompanyMember,
  type CompanyInvoice,
} from '../services/adminApi';
import type { AdminSession } from '../adminSession';

interface CompaniesScreenProps {
  session: AdminSession;
}

const EMPTY_FORM: CompanyFormFields = {
  name: '',
  ico: '',
  dic: '',
  icDph: '',
  billingEmail: '',
  billingAddress: '',
  pricePerPageBwCents: 0,
  pricePerPageColorCents: 0,
  vatRatePercent: 20,
};

const INVOICE_STATUS_LABEL: Record<CompanyInvoice['status'], string> = {
  draft: 'черновик',
  issued: 'выставлен',
  paid: 'оплачен',
  failed: 'ошибка',
};

function centsToEuroInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
function euroInputToCents(value: string): number {
  return Math.round(parseFloat(value || '0') * 100);
}

function firstOfThisMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}
function firstOfNextMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}

// B2B company-billing portal (docs, "B2B company-billing portal" plan,
// 2026-09-17) — same "real form, not script-only" call already made for the
// shop catalog (ShopCatalogScreen.tsx), whose list/create form shape this
// mirrors. Master-detail: the list on the left, a selected company's
// members + invoices on the right — kept as this component's own local
// state rather than a new AdminScreen union entry, same reasoning
// PrintQueueScreen.tsx stayed self-contained.
export function CompaniesScreen({ session }: CompaniesScreenProps) {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CompanyFormFields>(EMPTY_FORM);
  const [bwPriceInput, setBwPriceInput] = useState('0.00');
  const [colorPriceInput, setColorPriceInput] = useState('0.00');
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function reload() {
    listCompanies(session.sessionToken)
      .then(setCompanies)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }

  useEffect(reload, [session.sessionToken]);

  function startNew() {
    setCreating(true);
    setForm(EMPTY_FORM);
    setBwPriceInput('0.00');
    setColorPriceInput('0.00');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createCompany(session.sessionToken, {
        ...form,
        pricePerPageBwCents: euroInputToCents(bwPriceInput),
        pricePerPageColorCents: euroInputToCents(colorPriceInput),
      });
      setCreating(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const selected = companies?.find((c) => c.id === selectedId) ?? null;

  return (
    <section className="view" id="view-companies">
      <div className="view-header">
        <div>
          <h1 className="view-title">Компании</h1>
          <p className="view-sub">B2B-клиенты: сотрудники, ставки, счета</p>
        </div>
        {!creating && (
          <button
            type="button"
            className="btn btn-primary"
            id="companies-new"
            onClick={startNew}
            style={{ width: 'auto' }}
          >
            + Новая компания
          </button>
        )}
      </div>

      {error && <p className="login-error">{error}</p>}

      {creating && (
        <form className="calc" onSubmit={handleCreate} style={{ marginBottom: '1.5rem' }}>
          <div className="calc-form">
            <input
              type="text"
              className="admin-input"
              placeholder="Название компании"
              id="companies-form-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              type="text"
              className="admin-input"
              placeholder="IČO"
              id="companies-form-ico"
              value={form.ico}
              onChange={(e) => setForm({ ...form, ico: e.target.value })}
              required
            />
            <input
              type="text"
              className="admin-input"
              placeholder="DIČ"
              id="companies-form-dic"
              value={form.dic}
              onChange={(e) => setForm({ ...form, dic: e.target.value })}
              required
            />
            <input
              type="text"
              className="admin-input"
              placeholder="IČ DPH (можно позже)"
              id="companies-form-ic-dph"
              value={form.icDph}
              onChange={(e) => setForm({ ...form, icDph: e.target.value })}
            />
            <input
              type="email"
              className="admin-input"
              placeholder="E-mail для счетов"
              id="companies-form-billing-email"
              value={form.billingEmail}
              onChange={(e) => setForm({ ...form, billingEmail: e.target.value })}
              required
            />
            <input
              type="text"
              className="admin-input"
              placeholder="Адрес для счёта (можно позже)"
              id="companies-form-billing-address"
              value={form.billingAddress}
              onChange={(e) => setForm({ ...form, billingAddress: e.target.value })}
            />
            <input
              type="text"
              className="admin-input"
              placeholder="Ставка Ч/Б, €/стр"
              id="companies-form-price-bw"
              value={bwPriceInput}
              onChange={(e) => setBwPriceInput(e.target.value)}
              required
            />
            <input
              type="text"
              className="admin-input"
              placeholder="Ставка Цвет, €/стр"
              id="companies-form-price-color"
              value={colorPriceInput}
              onChange={(e) => setColorPriceInput(e.target.value)}
              required
            />
            <input
              type="number"
              className="admin-input"
              placeholder="Ставка НДС, %"
              id="companies-form-vat-rate"
              value={form.vatRatePercent}
              onChange={(e) => setForm({ ...form, vatRatePercent: Number(e.target.value) || 0 })}
              min={0}
              max={100}
              required
              title="Стандартная ставка в Словакии — 20%. Ниже для случаев освобождения от НДС (например, дипмиссии)."
            />
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button
                type="submit"
                className="btn btn-primary"
                id="companies-form-save"
                disabled={saving}
              >
                {saving ? 'Сохраняем…' : 'Добавить'}
              </button>
              <button type="button" className="btn" onClick={() => setCreating(false)}>
                Отмена
              </button>
            </div>
          </div>
        </form>
      )}

      {!companies ? (
        <p className="empty-note">Загрузка…</p>
      ) : companies.length === 0 ? (
        <p className="empty-note">Пока нет ни одной компании.</p>
      ) : (
        <div className="incident-feed" id="companies-list">
          {companies.map((company) => (
            <button
              type="button"
              className="incident-row"
              key={company.id}
              id={`companies-row-${company.id}`}
              onClick={() => setSelectedId(company.id)}
            >
              <span className="incident-code">{company.name}</span>
              <span className="incident-target">IČO {company.ico}</span>
              <span className="incident-target">
                Ч/Б {centsToEuroInput(company.pricePerPageBwCents)} € · Цвет{' '}
                {centsToEuroInput(company.pricePerPageColorCents)} € · НДС {company.vatRatePercent}%
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <CompanyDetail session={session} company={selected} onClose={() => setSelectedId(null)} />
      )}
    </section>
  );
}

function CompanyDetail({
  session,
  company,
  onClose,
}: {
  session: AdminSession;
  company: Company;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<CompanyMember[] | null>(null);
  const [invoices, setInvoices] = useState<CompanyInvoice[] | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    listCompanyMembers(session.sessionToken, company.id)
      .then(setMembers)
      .catch(() => {});
    listCompanyInvoices(session.sessionToken, company.id)
      .then(setInvoices)
      .catch(() => {});
  }

  useEffect(reload, [session.sessionToken, company.id]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await inviteCompanyMember(session.sessionToken, company.id, inviteEmail, inviteRole);
      setInviteEmail('');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateInvoice() {
    setError(null);
    setBusy(true);
    try {
      await generateCompanyInvoice(
        session.sessionToken,
        company.id,
        firstOfThisMonthIso(),
        firstOfNextMonthIso(),
      );
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleIssue(invoiceId: string) {
    setError(null);
    setBusy(true);
    try {
      await issueCompanyInvoice(session.sessionToken, invoiceId);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Issuing failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div
        className="modal-card"
        id="companies-detail-modal"
        role="dialog"
        aria-modal
        style={{ maxWidth: '40rem', textAlign: 'left' }}
      >
        <h2>{company.name}</h2>

        {error && <p className="login-error">{error}</p>}

        <h3 style={{ marginTop: '1rem' }}>Сотрудники</h3>
        {!members ? (
          <p className="empty-note">Загрузка…</p>
        ) : members.length === 0 ? (
          <p className="empty-note">Ещё никого не пригласили.</p>
        ) : (
          <div className="incident-feed">
            {members.map((member) => (
              <div className="incident-row incident-row-static" key={member.id}>
                <span className="incident-code">{member.email}</span>
                <span className="incident-target">{member.role}</span>
                <span className="incident-target">
                  {member.joinedAt ? 'принял приглашение' : 'приглашение отправлено'}
                </span>
              </div>
            ))}
          </div>
        )}
        <form
          onSubmit={handleInvite}
          style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem', flexWrap: 'wrap' }}
        >
          <input
            type="email"
            className="admin-input"
            placeholder="Email сотрудника"
            id="companies-invite-email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
            style={{ flex: 1, minWidth: '12rem' }}
          />
          <select
            className="admin-input"
            id="companies-invite-role"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
            style={{ width: 'auto' }}
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" className="btn" id="companies-invite-submit" disabled={busy}>
            Пригласить
          </button>
        </form>

        <h3 style={{ marginTop: '1.25rem' }}>Счета</h3>
        {!invoices ? (
          <p className="empty-note">Загрузка…</p>
        ) : invoices.length === 0 ? (
          <p className="empty-note">Ещё не выставлялись.</p>
        ) : (
          <div className="incident-feed">
            {invoices.map((invoice) => (
              <div className="incident-row incident-row-static" key={invoice.id}>
                <span className="incident-time" style={{ width: 'auto' }}>
                  {new Date(invoice.periodStart).toLocaleDateString()} –{' '}
                  {new Date(invoice.periodEnd).toLocaleDateString()}
                </span>
                <span className="incident-code">{centsToEuroInput(invoice.totalCents)} €</span>
                <span className="incident-target">
                  нетто {centsToEuroInput(invoice.totalNetCents)} € + НДС {invoice.vatRatePercent}%
                  ({centsToEuroInput(invoice.totalVatCents)} €)
                </span>
                <span className="incident-target">{INVOICE_STATUS_LABEL[invoice.status]}</span>
                {invoice.status === 'draft' && (
                  <button
                    type="button"
                    className="filter-reset"
                    id={`companies-invoice-issue-${invoice.id}`}
                    onClick={() => handleIssue(invoice.id)}
                    disabled={busy}
                  >
                    Выставить
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="btn"
          id="companies-generate-invoice"
          onClick={handleGenerateInvoice}
          disabled={busy}
          style={{ marginTop: '0.75rem', width: 'auto' }}
        >
          Сформировать счёт за текущий месяц
        </button>

        <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
          <button type="button" className="btn" id="companies-detail-close" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
