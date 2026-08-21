import { eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { staffRoster, staffAccounts } from './db/schema.js';

// Fixed weekly on-call schedule (docs/screens/admin-panel-wireframes.md,
// Alerts & on-call screen) — view-only in the admin panel; edited directly
// via server/scripts/setRosterDay.ts, not a UI, per the confirmed decision.

export type DayOfWeek =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export const DAYS_OF_WEEK: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export interface RosterEntry {
  dayOfWeek: DayOfWeek;
  staffAccountId: string;
  email: string;
  role: string;
}

export async function listRoster(): Promise<RosterEntry[]> {
  const rows = await db
    .select({
      dayOfWeek: staffRoster.dayOfWeek,
      staffAccountId: staffRoster.staffAccountId,
      email: staffAccounts.email,
      role: staffAccounts.role,
    })
    .from(staffRoster)
    .innerJoin(staffAccounts, eq(staffRoster.staffAccountId, staffAccounts.id));
  return rows as RosterEntry[];
}

/** Upserts one day's assignment — the only write path, used by
 * server/scripts/setRosterDay.ts (no HTTP route exposes this, matching the
 * confirmed "no editing UI in this pass" decision). */
export async function setRosterDay(day: DayOfWeek, staffAccountId: string): Promise<void> {
  await db
    .insert(staffRoster)
    .values({ dayOfWeek: day, staffAccountId })
    .onConflictDoUpdate({ target: staffRoster.dayOfWeek, set: { staffAccountId } });
}

const JS_DAY_TO_DAY_OF_WEEK: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/** Who's on duty right now, by the server's own local day-of-week — no
 * timezone configuration exists for this yet (see Open items). */
export async function getCurrentOnCall(): Promise<RosterEntry | null> {
  const today = JS_DAY_TO_DAY_OF_WEEK[new Date().getDay()];
  const roster = await listRoster();
  return roster.find((entry) => entry.dayOfWeek === today) ?? null;
}
