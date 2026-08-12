import { useState } from 'react';
import { login, changePassword, deleteAccount, type Account } from '../src/services/accountApi';

// Login + change-password — the only portal page that needs a session
// token (docs/personal-account-requirements.md; the kiosk itself never
// needs one). Kept in component state only, never persisted — a page
// reload always requires logging in again, same "no smart session
// restore" principle the kiosk already follows for its own login.
export function AccountPage() {
  const [session, setSession] = useState<(Account & { sessionToken: string }) | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeDone, setChangeDone] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      setSession(await login(email, password));
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  }

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
      setSession(null);
      setAccountDeleted(true);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Account deletion failed');
    } finally {
      setIsDeleting(false);
    }
  }

  if (!session) {
    return (
      <>
        <h1>Log in</h1>
        {accountDeleted && <p className="success">Your account has been deleted.</p>}
        <form onSubmit={handleLogin}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {loginError && <p className="error">{loginError}</p>}
          <button type="submit" disabled={isLoggingIn}>
            Log in
          </button>
        </form>
        <p>
          <a href="./forgot-password.html">Forgot password?</a> ·{' '}
          <a href="./register.html">Create account</a>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>My account</h1>
      <p>Logged in as {session.email}.</p>
      <p>
        <a href="./files.html">My files</a>
      </p>
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
    </>
  );
}
