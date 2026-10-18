import { environmentPrefix } from './appEnv.js';
import type { IncidentRow } from './incidentStore.js';

// Phone call + SMS for the few incidents a Telegram message can sleep through
// (docs/pavilion-security-requirements.md, Open items, "Who responds at
// night"): smoke, a fast heat rise, a forced door, broken glass. Everything
// else stays Telegram-only, as docs/equipment-monitoring-requirements.md
// decided. Twilio's REST API, called with plain fetch — one provider, no SDK.
//
//   URGENT_ALERT_PHONES   comma-separated numbers in +421… form; unset = off
//   URGENT_CALL_CODES     incident codes that call (default below)
//   URGENT_CALL_LANGUAGE  language of the spoken message (default ru-RU)
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER
//
// Missing Twilio settings log the would-be call instead, like every other
// external service here (Telegram, Resend).

const DEFAULT_CODES = [
  'security.smoke',
  'security.heat',
  'security.door-forced',
  'security.glass-break',
];

/** Spoken and texted in Russian — the people on call read Russian
 * (docs/i18n-requirements.md covers the customer side only). */
const SPOKEN_LABEL: Record<string, string> = {
  'security.smoke': 'датчик дыма',
  'security.heat': 'резкий рост температуры',
  'security.door-forced': 'входную дверь открыли при запертом замке',
  'security.glass-break': 'разбито стекло витрины',
};

/** One alarm (smoke going off for minutes, a door kept being forced) calls
 * once, not every few seconds. */
const CALL_COOLDOWN_MS = 5 * 60_000;
const lastCalledAt = new Map<string, number>();

function urgentCodes(): string[] {
  const configured = (process.env.URGENT_CALL_CODES ?? '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_CODES;
}

function phones(): string[] {
  return (process.env.URGENT_ALERT_PHONES ?? '')
    .split(',')
    .map((phone) => phone.trim())
    .filter(Boolean);
}

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

async function twilio(resource: 'Calls' | 'Messages', form: Record<string, string>) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/${resource}.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Twilio ${resource} responded ${response.status}: ${body.slice(0, 300)}`);
  }
}

/** Called right after a new incident is inserted (server/incidentStore.ts),
 * next to the Telegram notification. Never throws. */
export async function callIfUrgent(incident: IncidentRow): Promise<void> {
  try {
    if (!urgentCodes().includes(incident.code)) return;
    const numbers = phones();
    if (numbers.length === 0) return;
    const last = lastCalledAt.get(incident.code);
    if (last && Date.now() - last < CALL_COOLDOWN_MS) return;
    lastCalledAt.set(incident.code, Date.now());

    const label = SPOKEN_LABEL[incident.code] ?? incident.code;
    const spoken = `Внимание! Тревога в павильоне печати: ${label}. Подробности в Телеграме.`;
    const sms = `${environmentPrefix()}ТРЕВОГА: ${label}. ${incident.message}`.slice(0, 600);
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !from) {
      console.log(
        `[urgentCaller] Twilio not configured — would call and text ${numbers.join(', ')}: ${spoken}`,
      );
      return;
    }
    const language = process.env.URGENT_CALL_LANGUAGE || 'ru-RU';
    // Said three times: the first words are lost while someone wakes up.
    const twiml = `<Response><Say language="${escapeXml(language)}" loop="3">${escapeXml(spoken)}</Say></Response>`;
    for (const to of numbers) {
      await Promise.allSettled([
        twilio('Calls', { To: to, From: from, Twiml: twiml }),
        twilio('Messages', { To: to, From: from, Body: sms }),
      ]).then((results) =>
        results.forEach((result) => {
          if (result.status === 'rejected') {
            console.error(`[urgentCaller] ${to}:`, result.reason);
          }
        }),
      );
    }
  } catch (err) {
    console.error('[urgentCaller] Failed:', err);
  }
}
