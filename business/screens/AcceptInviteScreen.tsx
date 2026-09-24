import { useState, type FormEvent } from 'react';

interface AcceptInviteScreenProps {
  onAccept: (password: string) => Promise<void>;
}

// Reached via server/emailSender.ts's sendCompanyInviteEmail link
// (business/?token=...) — BusinessApp.tsx renders this instead of
// SignInScreen when a token is present in the URL and there's no active
// session yet. The invited person's account already exists (an unusable
// random password, server/companyStore.ts's inviteCompanyMember) — this
// just sets their real one.
export function AcceptInviteScreen({ onAccept }: AcceptInviteScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onAccept(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept invite');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Set your password</h1>
        <p className="view-sub" style={{ marginBottom: '1rem' }}>
          You've been invited to a company on Digital.Point Business — set a password to finish
          joining.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="business-invite-password">Password</label>
            <input
              id="business-invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              autoFocus
            />
          </div>
          <div className="login-field">
            <label htmlFor="business-invite-confirm">Confirm password</label>
            <input
              id="business-invite-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            Join company
          </button>
        </form>
      </div>
    </div>
  );
}
