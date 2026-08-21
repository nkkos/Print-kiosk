import { and, eq, gt } from 'drizzle-orm';
import { db } from './db/client.js';
import { incidents } from './db/schema.js';
import { getCurrentOnCall } from './rosterStore.js';
import type { IncidentRow } from './incidentStore.js';

// Real Telegram alerting (docs/equipment-monitoring-requirements.md,
// Methodology → "Notification & escalation"). Simplified from that
// document's original design in two ways, both because building the full
// version wasn't realistic to verify live in this pass — see this file's
// own Open-items note at the bottom:
//
// 1. One shared chat, not a personal DM to whoever's on duty — a bot can't
//    message an arbitrary person without them starting a chat with it
//    first (a real onboarding step this project hasn't built), and there's
//    no public webhook endpoint available locally to capture per-person
//    chat ids anyway. The on-duty person is still named in the message
//    text, resolved from server/rosterStore.ts.
// 2. Deduplication is a plain (source, code, recent notifiedAt) time-window
//    check, not a correlationId chain — no real reportIncident() call site
//    populates correlationId yet, so there's nothing to chain against.
//
// Dev fallback matches every other external-service integration in this
// project (Resend, ClamAV): missing config logs instead of sending, rather
// than throwing.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Illustrative, not tuned — same honesty as the retry/cooldown numbers
// already called out as unconfirmed in docs/equipment-monitoring-requirements.md's
// Open items.
const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;

const NOTIFIABLE_SEVERITIES = ['critical', 'emergency'];

async function sendTelegramMessage(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log(`[telegramNotifier] TELEGRAM_BOT_TOKEN/CHAT_ID not set — would send:\n${text}`);
    return;
  }
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Telegram API responded ${response.status}: ${body}`);
  }
}

function severityEmoji(severity: string): string {
  return severity === 'emergency' ? '🆘' : '🚨';
}

/** Called right after a new incident is inserted (server/incidentStore.ts's
 * reportIncident). Never throws — a notification failure shouldn't mask
 * the incident that was already successfully recorded. */
export async function notifyIfNeeded(incident: IncidentRow): Promise<void> {
  try {
    if (!NOTIFIABLE_SEVERITIES.includes(incident.severity)) return;

    const cooldownCutoff = new Date(Date.now() - NOTIFY_COOLDOWN_MS);
    const [recentlyNotified] = await db
      .select({ id: incidents.id })
      .from(incidents)
      .where(
        and(
          eq(incidents.source, incident.source),
          eq(incidents.code, incident.code),
          gt(incidents.notifiedAt, cooldownCutoff),
        ),
      )
      .limit(1);
    if (recentlyNotified) return;

    const onCall = await getCurrentOnCall();
    const onCallLine = onCall
      ? `Дежурит: ${onCall.email} (${onCall.role})`
      : 'Дежурство не назначено на сегодня';

    await sendTelegramMessage(
      `${severityEmoji(incident.severity)} ${incident.severity.toUpperCase()}: ${incident.code}\n${incident.message}\n${onCallLine}`,
    );
    await db.update(incidents).set({ notifiedAt: new Date() }).where(eq(incidents.id, incident.id));
  } catch (err) {
    console.error('[telegramNotifier] Failed to send/record notification:', err);
  }
}
