import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail, MailCheck } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
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
        <div className={styles.heading}>
          <h2 className={styles.title}>{t.login.registerTitle}</h2>
          <p className={styles.subtitle}>{t.login.registerSubtitle}</p>
        </div>
        <div className={styles.qrBox}>
          {registerQrImageUrl ? (
            <img src={registerQrImageUrl} alt={t.login.registerQrImageAlt} />
          ) : (
            <span className={styles.preparing}>{t.login.preparingQrCode}</span>
          )}
        </div>
        <ol className={styles.steps}>
          <li>{t.login.registerStep1}</li>
          <li>{t.login.registerStep2}</li>
          <li>{t.login.registerStep3}</li>
        </ol>
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
        <span className={styles.badge} aria-hidden="true">
          <MailCheck size={48} strokeWidth={1.5} />
        </span>
        <div className={styles.heading}>
          <h2 className={styles.title}>{t.login.checkYourEmail}</h2>
          <p className={styles.subtitle}>{t.login.resetInstructionsSent}</p>
        </div>
        <Button
          id="login-back-to-login"
          variant="primary"
          label={t.login.backToLogin}
          onClick={() => setMode('login')}
        />
      </div>
    );
  }

  if (mode === 'forgot-password') {
    return (
      <div className={styles.root}>
        <span className={styles.badge} aria-hidden="true">
          <Mail size={48} strokeWidth={1.5} />
        </span>
        <div className={styles.heading}>
          <h2 className={styles.title}>{t.login.resetPassword}</h2>
          <p className={styles.subtitle}>{t.login.resetSubtitle}</p>
        </div>
        <label className={styles.field}>
          <Mail size={26} strokeWidth={1.75} aria-hidden="true" />
          <input
            type="email"
            placeholder={t.login.email}
            aria-label={t.login.email}
            value={resetEmail}
            onChange={(event) => setResetEmail(event.target.value)}
          />
        </label>
        <Button
          id="login-send-reset"
          variant="primary"
          label={t.login.sendResetInstructions}
          onClick={handleSendReset}
          disabled={resetEmail.trim() === '' || isSendingReset}
        />
        <button
          type="button"
          id="login-cancel-reset"
          className={styles.link}
          onClick={() => setMode('login')}
        >
          {t.login.backToLogin}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.heading}>
        <h2 className={styles.title}>{t.login.logIn}</h2>
        <p className={styles.subtitle}>{t.login.subtitle}</p>
      </div>
      <label className={styles.field}>
        <Mail size={26} strokeWidth={1.75} aria-hidden="true" />
        <input
          type="email"
          placeholder={t.login.email}
          aria-label={t.login.email}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
        />
      </label>
      <label className={styles.field}>
        <LockKeyhole size={26} strokeWidth={1.75} aria-hidden="true" />
        <input
          type={showPassword ? 'text' : 'password'}
          placeholder={t.login.password}
          aria-label={t.login.password}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
        />
        <button
          type="button"
          id="login-toggle-password"
          className={styles.eye}
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? t.login.hidePassword : t.login.showPassword}
        >
          {showPassword ? (
            <EyeOff size={26} aria-hidden="true" />
          ) : (
            <Eye size={26} aria-hidden="true" />
          )}
        </button>
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button
        id="login-submit"
        variant="primary"
        label={t.login.logIn}
        onClick={handleSubmit}
        disabled={email.trim() === '' || password.trim() === '' || isSubmitting}
      />
      <button
        type="button"
        id="login-forgot-password"
        className={styles.link}
        onClick={() => setMode('forgot-password')}
      >
        {t.login.forgotPassword}
      </button>
      <div className={styles.divider}>
        <span>{t.login.or}</span>
      </div>
      <Button
        id="login-register"
        label={t.login.createAccount}
        onClick={() => setMode('register')}
      />
    </div>
  );
}
