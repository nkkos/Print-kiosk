import { useState } from 'react';

// Shared by every shell page — extracted once a fourth consumer (this
// portal's real destinations: Start/My files/My orders/Account information)
// needed the identical login form (docs/implementation/project-architecture.md,
// Section 9).
interface LoginFormProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsLoggingIn(true);
    setError(null);
    try {
      await onLogin(email, password);
      // No setIsLoggingIn(false) here — the caller navigates away
      // (docs/screens/portal-personal-account-spec.md: login always lands
      // on Start), so this component unmounts before it would matter.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setIsLoggingIn(false);
    }
  }

  return (
    <>
      <h1>Log in</h1>
      <form onSubmit={handleSubmit}>
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
        {error && <p className="error">{error}</p>}
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
