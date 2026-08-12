import { useState } from 'react';
import { Button } from '../Button/Button';
import { useTranslation } from '../../i18n';
import { requestPasswordReset } from '../../services/accountApi';
import styles from './LoginPanel.module.css';

// See docs/personal-account-requirements.md ("Kiosk-side login"). Baseline
// email/password login — required regardless of any other login method,
// since it's the only one that works for a first-time user with no prior
// session on any device. QR quick-login (reusing docs/qr-upload-requirements.md's
// mechanism) is a separate, not-yet-built addition on top of this.
//
// Real backend authentication (server/routes.ts, POST /api/accounts/login) —
// onLogin does the network call and throws on failure.

type Mode = 'login' | 'forgot-password' | 'reset-sent' | 'register';

interface LoginPanelProps {
  onLogin: (email: string, password: string) => Promise<void>;
  /** QR-code image (data URL) linking to the portal's register.html — null
   * until KioskScreenLayout has fetched the portal's real URL
   * (GET /api/config) and generated it. Registration itself only ever
   * happens on the portal, from the user's own device
   * (docs/personal-account-requirements.md) — the kiosk never collects a
   * new account's credentials directly. */
  registerQrImageUrl: string | null;
}

export function LoginPanel({ onLogin, registerQrImageUrl }: LoginPanelProps) {
  const t = useTranslation();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await onLogin(email, password);
    } catch {
      setError(t.login.incorrectCredentials);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Backend response is intentionally the same either way (no confirmation
  // of whether the email exists) — proceed to the same "check your
  // email" screen regardless, including on a network error.
  async function handleSendReset() {
    setIsSendingReset(true);
    try {
      await requestPasswordReset(resetEmail);
    } catch (err) {
      console.error('[LoginPanel] Failed to request password reset:', err);
    } finally {
      setIsSendingReset(false);
      setMode('reset-sent');
    }
  }

  if (mode === 'register') {
    return (
      <div className={styles.root}>
        <h2 className={styles.title}>{t.login.registerTitle}</h2>
        <div className={styles.qrBox}>
          {registerQrImageUrl ? (
            <img src={registerQrImageUrl} alt={t.login.registerQrImageAlt} />
          ) : (
            t.login.preparingQrCode
          )}
        </div>
        <p>{t.login.registerQrHint}</p>
        <Button
          id="login-back-to-login-from-register"
          label={t.login.backToLogin}
          onClick={() => setMode('login')}
        />
      </div>
    );
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
          {t.login.email}
          <input
            type="email"
            value={resetEmail}
            onChange={(event) => setResetEmail(event.target.value)}
          />
        </label>
        <Button
          id="login-send-reset"
          label={t.login.sendResetInstructions}
          onClick={handleSendReset}
          disabled={resetEmail.trim() === '' || isSendingReset}
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
        {t.login.email}
        <input
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
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
        disabled={email.trim() === '' || password.trim() === '' || isSubmitting}
      />
      <Button
        id="login-forgot-password"
        label={t.login.forgotPassword}
        onClick={() => setMode('forgot-password')}
      />
      <Button id="login-register" label={t.login.register} onClick={() => setMode('register')} />
    </div>
  );
}
