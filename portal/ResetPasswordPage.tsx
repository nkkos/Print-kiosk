import { useState } from 'react';
import { resetPassword } from '../src/services/accountApi';

export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get('token');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <>
        <h1>Reset password</h1>
        <p className="error">Missing reset link.</p>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1>Password updated</h1>
        <p className="success">
          Your password was changed. You can now <a href="./start.html">log in</a>.
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Reset password</h1>
      <form onSubmit={handleSubmit}>
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
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={isSubmitting}>
          Reset password
        </button>
      </form>
    </>
  );
}
