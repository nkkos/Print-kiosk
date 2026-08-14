import { useState } from 'react';
import { changePassword, deleteAccount } from '../src/services/accountApi';
import { usePortalSession } from './useSession';
import { PortalShell } from './PortalShell';
import { LoginForm } from './LoginForm';

// "Account information" (docs/screens/portal-personal-account-spec.md) —
// change-password and delete-account, now inside the shared shell as the
// sidebar's fourth real destination (confirmed to be shown enabled, not
// disabled/"coming soon" like Invoices/My promo codes/Payment methods,
// since this functionality already existed).
export function AccountPage() {
  const { session, login, logout } = usePortalSession();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeDone, setChangeDone] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setIsChanging(true);
    setChangeError(null);
    try {
      await changePassword(session.sessionToken, currentPassword, newPassword);
      setChangeDone(true);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : 'Password change failed');
    } finally {
      setIsChanging(false);
    }
  }

  // Right to erasure (docs/data-privacy-requirements.md, "Account data") —
  // a two-step inline confirm, since the portal has no shared Modal
  // component (portal/portal.css is deliberately plain).
  async function handleDeleteAccount() {
    if (!session) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(session.sessionToken);
      logout();
      window.location.href = './start.html';
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Account deletion failed');
      setIsDeleting(false);
    }
  }

  if (!session) {
    return (
      <LoginForm
        onLogin={async (email, password) => {
          await login(email, password);
          window.location.href = './start.html';
        }}
      />
    );
  }

  return (
    <PortalShell email={session.email} active="account" onLogout={logout}>
      <h1>Account information</h1>
      <h2>Change password</h2>
      <form onSubmit={handleChangePassword}>
        <label>
          Current password
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        {changeError && <p className="error">{changeError}</p>}
        {changeDone && <p className="success">Password changed.</p>}
        <button type="submit" disabled={isChanging}>
          Change password
        </button>
      </form>

      <h2>Delete account</h2>
      {isConfirmingDelete ? (
        <>
          <p className="error">This will permanently delete your account. Are you sure?</p>
          {deleteError && <p className="error">{deleteError}</p>}
          <button type="button" onClick={handleDeleteAccount} disabled={isDeleting}>
            Confirm delete
          </button>
          <button type="button" onClick={() => setIsConfirmingDelete(false)} disabled={isDeleting}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setIsConfirmingDelete(true)}>
          Delete account
        </button>
      )}
    </PortalShell>
  );
}
