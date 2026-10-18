// When the pavilion's entrance door should be open (docs/pavilion-security-requirements.md,
// section 1). Pure functions, no database: the cloud uses them to answer staff
// and to work out how long a "Close now" lasts, and the pavilion print agent
// (agent/doorController.ts) uses the same functions on its cached copy of the
// plan — so the door keeps following the schedule when the internet is down.

export const PAVILION_TIME_ZONE = 'Europe/Bratislava';

/** Every day 7:00–22:00 (confirmed 2026-10-16), in minutes after local midnight. */
export const OPENING_HOURS = { opensAtMinute: 7 * 60, closesAtMinute: 22 * 60 } as const;

export type DoorMode = 'open' | 'closed';

/** The operator closed the pavilion for a period — repairs, a holiday, an
 * incident. `endsAt` null = until someone cancels it. ISO strings, so the
 * plan travels to the agent and into its cache file unchanged. */
export interface DoorClosure {
  id: string;
  startsAt: string;
  endsAt: string | null;
  reason: string;
}

/** "Close now" during opening hours: closed until the plan next changes. */
export interface DoorOverride {
  mode: DoorMode;
  until: string;
}

export interface DoorPlan {
  closures: DoorClosure[];
  override: DoorOverride | null;
}

export type DoorModeReason = 'schedule' | 'closure' | 'override';

const localTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: PAVILION_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function localMinuteOfDay(at: Date): number {
  const parts = localTime.formatToParts(at);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return hour * 60 + minute;
}

export function scheduledMode(at: Date): DoorMode {
  const minute = localMinuteOfDay(at);
  return minute >= OPENING_HOURS.opensAtMinute && minute < OPENING_HOURS.closesAtMinute
    ? 'open'
    : 'closed';
}

function activeClosure(at: Date, plan: DoorPlan): DoorClosure | null {
  const time = at.getTime();
  return (
    plan.closures.find(
      (closure) =>
        Date.parse(closure.startsAt) <= time &&
        (closure.endsAt === null || time < Date.parse(closure.endsAt)),
    ) ?? null
  );
}

/** The mode the door should be in at `at`: an override beats a closure,
 * which beats the opening hours. `ignoreOverride` gives the plan as staff
 * set it up, for deciding what "Open now"/"Close now" mean. */
export function planMode(
  at: Date,
  plan: DoorPlan,
  options: { ignoreOverride?: boolean } = {},
): { mode: DoorMode; reason: DoorModeReason; closure: DoorClosure | null } {
  const override = options.ignoreOverride ? null : plan.override;
  if (override && at.getTime() < Date.parse(override.until)) {
    return { mode: override.mode, reason: 'override', closure: null };
  }
  const closure = activeClosure(at, plan);
  if (closure) return { mode: 'closed', reason: 'closure', closure };
  return { mode: scheduledMode(at), reason: 'schedule', closure: null };
}

/** The next moment the door's mode switches, searched minute by minute up
 * to a week ahead — opening hours, closures and overrides all fall on whole
 * minutes. By default the plan as staff set it up (no override), which is
 * what "Close now" lasts until; `includeOverride` gives what the door will
 * actually do, for the stands. Null when nothing changes within a week
 * (e.g. an open-ended closure). */
export function nextPlanChange(
  from: Date,
  plan: DoorPlan,
  options: { includeOverride?: boolean } = {},
): Date | null {
  const ignoreOverride = !options.includeOverride;
  const start = Math.floor(from.getTime() / 60_000) * 60_000;
  const current = planMode(from, plan, { ignoreOverride }).mode;
  for (let step = 1; step <= 7 * 24 * 60; step++) {
    const at = new Date(start + step * 60_000);
    if (planMode(at, plan, { ignoreOverride }).mode !== current) return at;
  }
  return null;
}
