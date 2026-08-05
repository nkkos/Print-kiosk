import { useState } from 'react';
import { Button } from '../Button/Button';
import { useTranslation } from '../../i18n';
import { requestPasswordReset } from '../../services/accountApi';
import styles from './LoginPanel.module.css';

// See docs/personal-account-requirements.md ("Kiosk-side login"). Baseline
// username/password login — required regardless of any other login method,
// since it's the only one that works for a first-time user with no prior
// session on any device. QR quick-login (reusing docs/qr-upload-requirements.md's
// mechanism) is a separate, not-yet-built addition on top of this.
//
// Real backend authentication (server/routes.ts, POST /api/accounts/login) —
// onLogin does the network call and throws on failure.

type Mode = 'login' | 'forgot-password' | 'reset-sent';

interface LoginPanelProps {
  onLogin: (username: string, password: string) => Promise<void>;
}

export function LoginPanel({ onLogin }: LoginPanelProps) {
  const t = useTranslation();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetUsername, setResetUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await onLogin(username, password);
    } catch {
      setError(t.login.incorrectCredentials);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Backend response is intentionally the same either way (no confirmation
  // of whether the username exists) — proceed to the same "check your
  // email" screen regardless, including on a network error.
  async function handleSendReset() {
    setIsSendingReset(true);
    try {
      await requestPasswordReset(resetUsername);
    } catch (err) {
      console.error('[LoginPanel] Failed to request password reset:', err);
    } finally {
      setIsSendingReset(false);
      setMode('reset-sent');
    }
  }

  if (mode === 'reset-sent') {
    return (
      <div className={styles.root}>
        <h2 className={styles.title}>{t.login.checkYourEmail}</h2>
        <p>{t.login.resetInstructionsSent}</p>
        <Button
          id="login-back-to-login"
          label={t.login.backToLogin}
          onClick={() => setMode('login')}
        />
      </div>
    );
  }

  if (mode === 'forgot-password') {
    return (
      <div className={styles.root}>
        <h2 className={styles.title}>{t.login.resetPassword}</h2>
        <label className={styles.field}>
          {t.login.username}
          <input
            type="text"
            value={resetUsername}
            onChange={(event) => setResetUsername(event.target.value)}
          />
        </label>
        <Button
          id="login-send-reset"
          label={t.login.sendResetInstructions}
          onClick={handleSendReset}
          disabled={resetUsername.trim() === '' || isSendingReset}
        />
        <Button
          id="login-cancel-reset"
          label={t.login.backToLogin}
          onClick={() => setMode('login')}
        />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <h2 className={styles.title}>{t.login.logIn}</h2>
      <label className={styles.field}>
        {t.login.username}
        <input
          type="text"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            setError(null);
          }}
        />
      </label>
      <label className={styles.field}>
        {t.login.password}
        <input
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
        />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <Button
        id="login-submit"
        label={t.login.logIn}
        onClick={handleSubmit}
        disabled={username.trim() === '' || password.trim() === '' || isSubmitting}
      />
      <Button
        id="login-forgot-password"
        label={t.login.forgotPassword}
        onClick={() => setMode('forgot-password')}
      />
    </div>
  );
}
