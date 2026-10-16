import { readFile, writeFile } from 'node:fs/promises';
import { planMode, type DoorMode, type DoorPlan } from '../server/doorSchedule.js';
import type { DoorEventKind } from '../server/pavilionDoor.js';
import type { DoorLock, DoorReading } from './doorLock.js';

// Drives the pavilion's entrance lock (docs/pavilion-security-requirements.md,
// section 1). Every few seconds: pull the plan from the cloud (opening hours,
// closures, "Close now", a visit staff asked for), read the lock, and act —
// unlock for opening hours, lock outside them, and lock again behind anyone
// who leaves or visits after hours. The plan is cached on disk, so without
// internet the door still opens at 7:00 and locks at 22:00. What happened is
// reported back (server/pavilionDoor.ts), which keeps the journal and raises
// the door incidents.
//
// The Nuki's own auto-lock stays off: during opening hours the door must stay
// unlocked, and Nuki can't switch auto-lock by schedule — so relocking is done
// here. If this agent is down, the door keeps its last state; staff then use
// the key (docs/pavilion-security-requirements.md, Open items).
//
//   DOOR_PLAN_FILE  where the last plan is cached (default door-plan.json)

const TICK_MS = 3000;
const REPORT_EVERY_TICKS = 5;
/** How long a lock/unlock may take before it counts as failed. */
const COMMAND_TIMEOUT_MS = 30_000;
/** After a failed command, wait this long before trying again. */
const RETRY_AFTER_MS = 60_000;
/** Relock this long after the door was shut behind someone. */
const RELOCK_AFTER_CLOSE_MS = 10_000;
/** Unlocked after hours but nobody opened the door (a visit not used, the
 * inside knob turned and let go): lock again after this. */
const UNUSED_UNLOCK_MS = 2 * 60_000;
/** Door open this long while the pavilion is closed → incident. */
const HELD_OPEN_MS = 2 * 60_000;
/** Door opened while the lock still reads locked for this long → forced. */
const FORCED_CONFIRM_MS = 6000;

type UnlockCause = 'schedule' | 'visit' | 'manual';

interface PendingCommand {
  action: 'lock' | 'unlock';
  reason: string;
  sentAt: number;
}

interface CachedPlan {
  plan: DoorPlan;
  handledVisit: string | null;
}

type CallCloud = (path: string, init?: RequestInit) => Promise<Response>;

export async function runDoorController(lock: DoorLock, callCloud: CallCloud): Promise<never> {
  const cacheFile = process.env.DOOR_PLAN_FILE || 'door-plan.json';
  let cache: CachedPlan = { plan: { closures: [], override: null }, handledVisit: null };
  try {
    cache = JSON.parse(await readFile(cacheFile, 'utf8')) as CachedPlan;
  } catch {
    // No cache yet — opening hours alone until the cloud answers.
  }

  const events: { kind: DoorEventKind; detail: string | null }[] = [];
  const emit = (kind: DoorEventKind, detail: string | null = null) => {
    console.log(`[door] ${kind}${detail ? ` (${detail})` : ''}`);
    events.push({ kind, detail });
    if (events.length > 200) events.shift();
  };

  let previous: DoorReading | null = null;
  // Set inside send(), which TypeScript's narrowing can't see — hence the cast.
  let pending = null as PendingCommand | null;
  let lastFailureAt = 0;
  let unlockCause: UnlockCause | null = null;
  let unlockedAt = 0;
  let openedSinceUnlock = false;
  let closedAt = 0;
  let openSince: number | null = null;
  let heldOpenReported = false;
  let openedAfterHoursAt: number | null = null;
  let tick = 0;

  async function send(action: 'lock' | 'unlock', reason: string) {
    pending = { action, reason, sentAt: Date.now() };
    try {
      await (action === 'lock' ? lock.lock() : lock.unlock());
    } catch (err) {
      console.error(`[door] ${action} failed:`, err instanceof Error ? err.message : err);
    }
  }

  async function pullPlan(): Promise<{ id: string } | null> {
    try {
      const response = await callCloud('/api/agent/door');
      const body = (await response.json()) as { plan: DoorPlan; visit: { id: string } | null };
      cache = { ...cache, plan: body.plan };
      await writeFile(cacheFile, JSON.stringify(cache));
      return body.visit;
    } catch {
      return null; // offline — keep following the cached plan
    }
  }

  async function report(mode: DoorMode, reading: DoorReading) {
    const batch = events.splice(0, events.length);
    try {
      await callCloud('/api/agent/door-report', {
        method: 'POST',
        body: JSON.stringify({
          lock: reading.lock,
          door: reading.door,
          lockReachable: reading.reachable,
          batteryCritical: reading.batteryCritical,
          appliedMode: mode,
          handledVisit: cache.handledVisit,
          events: batch,
        }),
      });
    } catch {
      events.unshift(...batch); // send them with the next report
    }
  }

  console.log(`[door] lock: ${lock.name}`);
  for (;;) {
    const visit = await pullPlan();
    const now = Date.now();
    const mode = planMode(new Date(now), cache.plan).mode;
    let reading: DoorReading;
    try {
      reading = await lock.read();
    } catch {
      reading = { lock: 'unknown', door: 'unknown', reachable: false, batteryCritical: false };
    }

    // --- What changed since the last reading ---------------------------------
    if (previous) {
      if (
        previous.lock === 'locked' &&
        reading.lock === 'unlocked' &&
        pending?.action !== 'unlock'
      ) {
        // Someone turned the inside knob (or a key) — not us.
        unlockCause = 'manual';
        unlockedAt = now;
        openedSinceUnlock = false;
      }
      if (previous.door !== 'open' && reading.door === 'open') {
        openedSinceUnlock = true;
        // The door sensor and the lock state arrive separately, so a door
        // opened from inside can briefly show as open-while-locked. Judge
        // it a few seconds later instead of on this reading.
        if (mode === 'closed') openedAfterHoursAt = now;
      }
      if (previous.door === 'open' && reading.door !== 'open') closedAt = now;
    }
    if (openedAfterHoursAt !== null) {
      if (reading.lock === 'unlocked') {
        emit(unlockCause === 'visit' ? 'visit-entry' : 'inside-exit');
        openedAfterHoursAt = null;
      } else if (now - openedAfterHoursAt > FORCED_CONFIRM_MS) {
        emit('door-forced', `door opened, lock still ${reading.lock}`);
        openedAfterHoursAt = null;
      }
    }

    // --- A command we sent: did it work? -------------------------------------
    if (pending) {
      const done =
        (pending.action === 'lock' && reading.lock === 'locked') ||
        (pending.action === 'unlock' && reading.lock === 'unlocked');
      if (done) {
        emit(pending.action === 'lock' ? 'locked' : 'unlocked', pending.reason);
        if (pending.action === 'unlock') {
          unlockCause = pending.reason === 'visit' ? 'visit' : 'schedule';
          unlockedAt = now;
          openedSinceUnlock = false;
        }
        pending = null;
      } else if (now - pending.sentAt > COMMAND_TIMEOUT_MS) {
        emit(
          pending.action === 'lock' ? 'lock-failed' : 'unlock-failed',
          `${pending.reason}; lock ${reading.lock}, door ${reading.door}`,
        );
        lastFailureAt = now;
        pending = null;
      }
    }

    // --- Decide ---------------------------------------------------------------
    const canAct = reading.reachable && !pending && now - lastFailureAt > RETRY_AFTER_MS;
    if (visit && visit.id !== cache.handledVisit && reading.reachable && !pending) {
      // Handled only once the lock could hear it — until then the cloud
      // keeps the visit waiting and staff see it as pending.
      cache.handledVisit = visit.id;
      await writeFile(cacheFile, JSON.stringify(cache)).catch(() => {});
      if (mode === 'closed' && reading.lock !== 'unlocked') await send('unlock', 'visit');
    } else if (canAct && mode === 'open' && reading.lock === 'locked') {
      await send('unlock', 'schedule');
    } else if (
      canAct &&
      mode === 'closed' &&
      reading.lock === 'unlocked' &&
      reading.door !== 'open'
    ) {
      const shutBehindSomeone = openedSinceUnlock && now - closedAt >= RELOCK_AFTER_CLOSE_MS;
      const unusedUnlock =
        !openedSinceUnlock && (unlockCause === 'schedule' || now - unlockedAt >= UNUSED_UNLOCK_MS);
      if (shutBehindSomeone) await send('lock', 'relock');
      else if (unusedUnlock) {
        await send(
          'lock',
          unlockCause === 'schedule' || unlockCause === null ? 'schedule' : 'unused-unlock',
        );
      }
    }

    if (mode === 'closed' && reading.door === 'open') {
      openSince ??= now;
      if (!heldOpenReported && now - openSince > HELD_OPEN_MS) {
        emit('door-held-open');
        heldOpenReported = true;
      }
    } else {
      openSince = null;
      heldOpenReported = false;
    }

    if (unlockCause === null && reading.lock === 'unlocked') {
      // Found unlocked at start-up: treat as the schedule's doing.
      unlockCause = 'schedule';
      unlockedAt = now;
    }
    previous = reading;
    if (events.length > 0 || tick % REPORT_EVERY_TICKS === 0) await report(mode, reading);
    tick++;
    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }
}
