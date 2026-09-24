import { useState, type FormEvent } from 'react';

interface SignInScreenProps {
  onSignIn: (email: string, password: string) => Promise<void>;
}

// Mirrors admin/LoginScreen.tsx exactly — same shape, different copy/branding.
export function SignInScreen({ onSignIn }: SignInScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onSignIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Digital.Point Business</h1>
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="business-signin-email">Email</label>
            <input
              id="business-signin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="login-field">
            <label htmlFor="business-signin-password">Password</label>
            <input
              id="business-signin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
