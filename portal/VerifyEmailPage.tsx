import { useEffect, useState } from 'react';
import { verifyEmail } from '../src/services/accountApi';

type Status = 'verifying' | 'success' | 'error';

export function VerifyEmailPage() {
  const [status, setStatus] = useState<Status>('verifying');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setStatus('error');
      setError('Missing verification link.');
      return;
    }
    verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err: unknown) => {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Verification failed');
      });
  }, []);

  return (
    <>
      <h1>Verify email</h1>
      {status === 'verifying' && <p>Verifying...</p>}
      {status === 'success' && <p className="success">Your email is verified.</p>}
      {status === 'error' && <p className="error">{error}</p>}
    </>
  );
}
