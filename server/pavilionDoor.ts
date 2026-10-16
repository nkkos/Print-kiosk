import { and, desc, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { db } from './db/client.js';
import { doorClosures, doorEvents, pavilionDoor, staffAccounts } from './db/schema.js';
import { hasOpenIncident, reportIncident, resolveOpenIncidents } from './incidentStore.js';
import {
  nextPlanChange,
  OPENING_HOURS,
  PAVILION_TIME_ZONE,
  planMode,
  type DoorMode,
  type DoorPlan,
} from './doorSchedule.js';

// The pavilion's entrance door, cloud side (docs/pavilion-security-requirements.md,
// section 1). The lock itself is driven by the pavilion print agent
// (agent/doorController.ts), which pulls the plan from here, keeps a copy so
// the schedule survives an internet outage, and reports the lock's state and
// what it did. Staff commands — senior only — are stored here and picked up
// by the agent on its next pull (within seconds).

const ROW_ID = 'main';

export type LockState = 'locked' | 'unlocked' | 'moving' | 'unknown';
export type DoorState = 'closed' | 'open' | 'unknown';

const LOCK_STATES: LockState[] = ['locked', 'unlocked', 'moving', 'unknown'];
const DOOR_STATES: DoorState[] = ['closed', 'open', 'unknown'];

/** What the agent can tell the cloud happened at the door. */
export type DoorEventKind =
  | 'unlocked'
  | 'locked'
  | 'inside-exit'
  | 'visit-entry'
  | 'door-forced'
  | 'door-held-open'
  | 'lock-failed'
  | 'unlock-failed';

const AGENT_EVENT_KINDS: DoorEventKind[] = [
  'unlocked',
  'locked',
  'inside-exit',
  'visit-entry',
  'door-forced',
  'door-held-open',
  'lock-failed',
  'unlock-failed',
];

const INCIDENT = {
  forced: 'security.door-forced',
  heldOpen: 'security.door-held-open',
  lockFailed: 'security.lock-failed',
  unreachable: 'security.lock-unreachable',
  battery: 'security.lock-battery-low',
} as const;

async function doorRow() {
  const [row] = await db
    .insert(pavilionDoor)
    .values({ id: ROW_ID })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [existing] = await db.select().from(pavilionDoor).where(eq(pavilionDoor.id, ROW_ID));
  return existing;
}

async function recordEvent(kind: string, detail: string | null, staffAccountId?: string | null) {
  await db.insert(doorEvents).values({ kind, detail, staffAccountId: staffAccountId ?? null });
}

/** Closures still ahead or running, plus the override if it hasn't run out. */
export async function getDoorPlan(): Promise<DoorPlan> {
  const now = new Date();
  const closures = await db
    .select()
    .from(doorClosures)
    .where(
      and(
        isNull(doorClosures.cancelledAt),
        or(isNull(doorClosures.endsAt), gt(doorClosures.endsAt, now)),
      ),
    )
    .orderBy(doorClosures.startsAt);
  const row = await doorRow();
  const override =
    row.overrideMode && row.overrideUntil && row.overrideUntil > now
      ? { mode: row.overrideMode as DoorMode, until: row.overrideUntil.toISOString() }
      : null;
  return {
    closures: closures.map((closure) => ({
      id: closure.id,
      startsAt: closure.startsAt.toISOString(),
      endsAt: closure.endsAt?.toISOString() ?? null,
      reason: closure.reason,
    })),
    override,
  };
}

/** What the agent pulls: the plan, and a visit staff asked for that it
 * hasn't carried out yet. */
export async function getAgentDoorInstructions(): Promise<{
  plan: DoorPlan;
  visit: { id: string } | null;
}> {
  const plan = await getDoorPlan();
  const row = await doorRow();
  return {
    plan,
    visit: row.visitRequestedAt ? { id: row.visitRequestedAt.toISOString() } : null,
  };
}

export type DoorOpenResult = 'visit' | 'reopened' | 'already-open';

/** "Open now". Outside the plan's open hours this is one visit: the agent
 * unlocks, then locks again once the door has been opened and shut — the
 * pavilion doesn't stay open for the night. Within open hours it only
 * cancels an earlier "Close now". */
export async function requestDoorOpen(staffAccountId: string): Promise<DoorOpenResult> {
  const plan = await getDoorPlan();
  const now = new Date();
  let result: DoorOpenResult = 'already-open';
  if (plan.override?.mode === 'closed') {
    await db
      .update(pavilionDoor)
      .set({ overrideMode: null, overrideUntil: null })
      .where(eq(pavilionDoor.id, ROW_ID));
    result = 'reopened';
  }
  if (planMode(now, plan, { ignoreOverride: true }).mode === 'closed') {
    await db.update(pavilionDoor).set({ visitRequestedAt: now }).where(eq(pavilionDoor.id, ROW_ID));
    result = 'visit';
  }
  await recordEvent('admin-open', result, staffAccountId);
  return result;
}

/** "Close now". Within the plan's open hours: closed until the plan next
 * changes (normally 22:00), then the plan takes over again. Outside them the
 * door is closed anyway — this just cancels a visit still waiting. */
export async function requestDoorClose(staffAccountId: string): Promise<{ until: string | null }> {
  const plan = await getDoorPlan();
  const now = new Date();
  let until: Date | null = null;
  if (planMode(now, plan, { ignoreOverride: true }).mode === 'open') {
    // Open with no end in a week would be odd, but cap it rather than
    // leave the override open-ended.
    until = nextPlanChange(now, plan) ?? new Date(now.getTime() + 7 * 24 * 3600_000);
  }
  await db
    .update(pavilionDoor)
    .set({ overrideMode: until ? 'closed' : null, overrideUntil: until, visitRequestedAt: null })
    .where(eq(pavilionDoor.id, ROW_ID));
  await recordEvent('admin-close', until ? `until ${until.toISOString()}` : null, staffAccountId);
  return { until: until?.toISOString() ?? null };
}

export async function addDoorClosure(
  input: { startsAt: Date; endsAt: Date | null; reason: string },
  staffAccountId: string,
): Promise<string> {
  const [row] = await db
    .insert(doorClosures)
    .values({ ...input, createdBy: staffAccountId })
    .returning({ id: doorClosures.id });
  await recordEvent(
    'closure-added',
    `${input.startsAt.toISOString()} – ${input.endsAt?.toISOString() ?? '…'}: ${input.reason}`,
    staffAccountId,
  );
  return row.id;
}

/** False when there is no such closure still in force. */
export async function cancelDoorClosure(id: string, staffAccountId: string): Promise<boolean> {
  const updated = await db
    .update(doorClosures)
    .set({ cancelledAt: new Date(), cancelledBy: staffAccountId })
    .where(and(eq(doorClosures.id, id), isNull(doorClosures.cancelledAt)))
    .returning({ reason: doorClosures.reason });
  if (updated.length === 0) return false;
  await recordEvent('closure-cancelled', updated[0].reason, staffAccountId);
  return true;
}

export interface DoorReport {
  lock: LockState;
  door: DoorState;
  lockReachable: boolean;
  batteryCritical: boolean;
  appliedMode: DoorMode;
  handledVisit: string | null;
  events: { kind: DoorEventKind; detail: string | null }[];
}

/** Validates the agent's POST body; null when it isn't a report. */
export function parseDoorReport(body: unknown): DoorReport | null {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (
    !LOCK_STATES.includes(raw.lock as LockState) ||
    !DOOR_STATES.includes(raw.door as DoorState) ||
    (raw.appliedMode !== 'open' && raw.appliedMode !== 'closed')
  ) {
    return null;
  }
  const events = Array.isArray(raw.events) ? raw.events : [];
  return {
    lock: raw.lock as LockState,
    door: raw.door as DoorState,
    lockReachable: raw.lockReachable === true,
    batteryCritical: raw.batteryCritical === true,
    appliedMode: raw.appliedMode,
    handledVisit: typeof raw.handledVisit === 'string' ? raw.handledVisit : null,
    events: events
      .map((event) => (event ?? {}) as Record<string, unknown>)
      .filter((event) => AGENT_EVENT_KINDS.includes(event.kind as DoorEventKind))
      .slice(0, 100)
      .map((event) => ({
        kind: event.kind as DoorEventKind,
        detail: typeof event.detail === 'string' ? event.detail.slice(0, 200) : null,
      })),
  };
}

async function raiseOnce(
  code: string,
  severity: 'warning' | 'critical' | 'emergency',
  message: string,
  context: Record<string, unknown>,
) {
  if (await hasOpenIncident(code)) return;
  await reportIncident({ source: 'security', code, severity, message, context });
}

/** Stores the agent's latest reading, journals what it did, and opens or
 * closes the door incidents (docs/pavilion-security-requirements.md, section 4). */
export async function recordDoorReport(report: DoorReport): Promise<void> {
  const row = await doorRow();
  const visitHandled =
    !!row.visitRequestedAt && report.handledVisit === row.visitRequestedAt.toISOString();
  await db
    .update(pavilionDoor)
    .set({
      lockState: report.lock,
      doorState: report.door,
      lockReachable: report.lockReachable,
      batteryCritical: report.batteryCritical,
      appliedMode: report.appliedMode,
      reportedAt: new Date(),
      ...(visitHandled ? { visitRequestedAt: null } : {}),
    })
    .where(eq(pavilionDoor.id, ROW_ID));

  for (const event of report.events) {
    await recordEvent(event.kind, event.detail);
    if (event.kind === 'door-forced') {
      // Every forced opening is its own emergency, not deduplicated — a
      // second one after the first was handled is a new break-in.
      await reportIncident({
        source: 'security',
        code: INCIDENT.forced,
        severity: 'emergency',
        message:
          'The pavilion entrance was opened while the lock was locked — a break-in, or the lock was forced. Check the hall camera.',
        context: { detail: event.detail },
      });
    } else if (event.kind === 'door-held-open') {
      await raiseOnce(
        INCIDENT.heldOpen,
        'critical',
        'The pavilion entrance has been open for over 2 minutes while the pavilion is closed.',
        { detail: event.detail },
      );
    } else if (event.kind === 'lock-failed' || event.kind === 'unlock-failed') {
      await raiseOnce(
        INCIDENT.lockFailed,
        'critical',
        event.kind === 'lock-failed'
          ? 'The pavilion failed to lock — the door may be ajar or the lock blocked. The agent keeps retrying.'
          : 'The pavilion failed to unlock for opening hours — customers may not get in. The agent keeps retrying.',
        { kind: event.kind, detail: event.detail },
      );
    } else if (event.kind === 'locked' || event.kind === 'unlocked') {
      await resolveOpenIncidents([INCIDENT.lockFailed], { reason: `the door ${event.kind}` });
    }
  }

  if (report.door === 'closed') {
    await resolveOpenIncidents([INCIDENT.heldOpen], { reason: 'the door was shut' });
  }
  if (!report.lockReachable) {
    await raiseOnce(
      INCIDENT.unreachable,
      'critical',
      'The print agent gets no answer from the entrance lock — schedule and admin commands cannot reach it. Use the key if someone needs in.',
      {},
    );
  } else {
    await resolveOpenIncidents([INCIDENT.unreachable], { reason: 'the lock answers again' });
  }
  if (report.batteryCritical) {
    await raiseOnce(
      INCIDENT.battery,
      'warning',
      'The entrance lock reports a critically low battery — charge or replace it.',
      {},
    );
  } else {
    await resolveOpenIncidents([INCIDENT.battery], { reason: 'battery no longer critical' });
  }
}

/** Readings older than this are shown as stale — the agent reports every
 * 15 s while it runs. */
const REPORT_STALE_AFTER_MS = 60_000;

export interface DoorStatusForStaff {
  timeZone: string;
  openingHours: { opensAt: string; closesAt: string };
  plannedMode: DoorMode;
  plannedReason: 'schedule' | 'closure' | 'override';
  override: { mode: DoorMode; until: string } | null;
  visitPending: boolean;
  reading: {
    lock: string | null;
    door: string | null;
    lockReachable: boolean | null;
    batteryCritical: boolean | null;
    appliedMode: string | null;
    reportedAt: string | null;
    stale: boolean;
  };
  closures: { id: string; startsAt: string; endsAt: string | null; reason: string }[];
  events: {
    id: string;
    kind: string;
    detail: string | null;
    staffEmail: string | null;
    at: string;
  }[];
}

function hhmm(minuteOfDay: number): string {
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

export async function getDoorStatusForStaff(): Promise<DoorStatusForStaff> {
  const plan = await getDoorPlan();
  const row = await doorRow();
  const planned = planMode(new Date(), plan);
  const events = await db
    .select({
      id: doorEvents.id,
      kind: doorEvents.kind,
      detail: doorEvents.detail,
      staffEmail: staffAccounts.email,
      at: doorEvents.createdAt,
    })
    .from(doorEvents)
    .leftJoin(staffAccounts, eq(doorEvents.staffAccountId, staffAccounts.id))
    .orderBy(desc(doorEvents.createdAt))
    .limit(30);
  return {
    timeZone: PAVILION_TIME_ZONE,
    openingHours: {
      opensAt: hhmm(OPENING_HOURS.opensAtMinute),
      closesAt: hhmm(OPENING_HOURS.closesAtMinute),
    },
    plannedMode: planned.mode,
    plannedReason: planned.reason,
    override: plan.override,
    visitPending: !!row.visitRequestedAt,
    reading: {
      lock: row.lockState,
      door: row.doorState,
      lockReachable: row.lockReachable,
      batteryCritical: row.batteryCritical,
      appliedMode: row.appliedMode,
      reportedAt: row.reportedAt?.toISOString() ?? null,
      stale: !row.reportedAt || Date.now() - row.reportedAt.getTime() > REPORT_STALE_AFTER_MS,
    },
    closures: plan.closures,
    events: events.map((event) => ({ ...event, at: event.at.toISOString() })),
  };
}

export const DOOR_EVENT_RETENTION_DAYS = 365;

/** The journal is kept 12 months (docs/pavilion-security-requirements.md, "Journal"). */
export async function deleteDoorEventsPastRetention(): Promise<number> {
  const cutoff = new Date(Date.now() - DOOR_EVENT_RETENTION_DAYS * 24 * 3600_000);
  const deleted = await db
    .delete(doorEvents)
    .where(lt(doorEvents.createdAt, cutoff))
    .returning({ id: doorEvents.id });
  return deleted.length;
}
