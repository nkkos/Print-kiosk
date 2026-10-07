// Which deployment this backend is (README.md, "Staging environment"):
//   APP_ENV=production — the pavilion's live service;
//   APP_ENV=staging    — the test copy on Railway, fed from the `staging`
//                        branch, where changes are checked before `main`;
//   unset              — a developer machine.
// Staging marks everything a person might mistake for the real thing —
// Telegram alerts, e-mails, the screens (GET /api/config → appEnv) — and
// refuses live payment credentials.

export type AppEnv = 'production' | 'staging' | 'development';

export function appEnv(): AppEnv {
  const value = process.env.APP_ENV;
  return value === 'production' || value === 'staging' ? value : 'development';
}

/** Prefix for anything a person reads outside the app (alerts, e-mails). */
export function environmentPrefix(): string {
  return appEnv() === 'staging' ? '[STAGING] ' : '';
}

/** Boot-time guard (server/index.ts): a staging service must never take
 * real money, so live Viva credentials stop it from starting at all. */
export function assertSafeEnvironment(): void {
  if (appEnv() === 'staging' && process.env.VIVA_ENV === 'live') {
    throw new Error('APP_ENV=staging refuses VIVA_ENV=live — use the Viva demo account on staging');
  }
}
