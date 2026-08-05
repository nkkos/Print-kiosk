import { useState } from 'react';
import { requestPasswordReset } from '../src/services/accountApi';

export function ForgotPasswordPage() {
  const [username, setUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Same response either way (no confirmation of whether the username
  // exists) — always show the same "check your email" result, including on
  // a network error.
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await requestPasswordReset(username);
    } catch (err) {
      console.error('[forgot-password] Request failed:', err);
    } finally {
      setIsSubmitting(false);
      setDone(true);
    }
  }

  if (done) {
    return (
      <>
        <h1>Check your email</h1>
        <p className="success">
          If an account with that username exists, password reset instructions have been sent.
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Forgot password</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <button type="submit" disabled={isSubmitting || username.trim() === ''}>
          Send reset instructions
        </button>
      </form>
    </>
  );
}
