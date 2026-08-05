import { useState } from 'react';
import { register } from '../src/services/accountApi';

// Minimal registration page (docs/personal-account-requirements.md — account
// creation is a portal concern). Deliberately plain, not reusing the kiosk's
// component library — see portal.css.
export function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await register(username, email, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (done) {
    return (
      <>
        <h1>Check your email</h1>
        <p className="success">
          We sent a verification link to {email}. Click it to verify your account.
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Create account</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
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
            minLength={8}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={isSubmitting}>
          Create account
        </button>
      </form>
      <p>
        <a href="./account.html">Already have an account?</a>
      </p>
    </>
  );
}
