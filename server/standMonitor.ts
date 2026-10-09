import { and, eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { stands } from './db/schema.js';
import { hasOpenIncidentFor, reportIncident, resolveOpenIncidentsFor } from './incidentStore.js';
import { configuredStandIds } from './security.js';

// Kiosk stand liveness (docs/equipment-monitoring-requirements.md, "Detecting
// total failure" and section A, `pc.dead`): nothing on a frozen browser or a
// dead PC can report its own failure, so each stand reports in every minute
// (POST /api/stands/heartbeat, src/App.tsx) and this watchdog raises pc.dead
// — emergency, so Telegram at once — for a stand silent past the threshold,
// closing it by itself when the stand calls in again. Network loss at the
// stand looks the same from here, which is fine: both need a person.
//
// Watched stands: MONITORED_STANDS="A,B" if set ("none" = off), else the
// stands that have a key (STAND_API_KEYS). Neither set — a developer
// machine — watches nothing.

const STAND_DEAD_INCIDENT = 'pc.dead';
const WATCHDOG_INTERVAL_MS = 30_000;
/** Three missed minutely heartbeats — a reload or a brief blip never pages. */
export const STAND_SILENT_AFTER_MS = 3 * 60_000;
const SCREEN_PATTERN = /^[a-z0-9-]{1,40}$/;

export function monitoredStandIds(): string[] {
  // 'none' switches the watchdog off while keys exist but the stands don't
  // yet (before the pavilion opens) — otherwise every keyed stand pages.
  if (process.env.MONITORED_STANDS?.trim() === 'none') return [];
  const explicit = (process.env.MONITORED_STANDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return explicit.length > 0 ? explicit : configuredStandIds();
}

/** A reload staff asked for (POST /api/admin/stands/:id/reload). `id` is
 * echoed back by the stand once it has reloaded, which is what clears the
 * request — a token rather than a time comparison, so a stand with a wrong
 * clock can't miss or repeat it. */
export interface PendingStandReload {
  id: string;
  force: boolean;
}

/** Records the heartbeat and returns the reload still waiting for this
 * stand, if any. `handledReload` is the id of the reload the stand has just
 * carried out (sent by its first heartbeat after reloading). */
export async function recordStandHeartbeat(
  standId: string,
  screen: unknown,
  userAgent: string | undefined,
  handledReload: unknown,
): Promise<PendingStandReload | null> {
  const lastScreen = typeof screen === 'string' && SCREEN_PATTERN.test(screen) ? screen : null;
  const now = new Date();
  const [row] = await db
    .insert(stands)
    .values({ id: standId, lastSeenAt: now, lastScreen, userAgent: userAgent?.slice(0, 300) })
    .onConflictDoUpdate({
      target: stands.id,
      set: { lastSeenAt: now, lastScreen, userAgent: userAgent?.slice(0, 300) },
    })
    .returning();
  if (!row.reloadRequestedAt) return null;
  const pending = { id: row.reloadRequestedAt.toISOString(), force: row.reloadForce };
  if (handledReload !== pending.id) return pending;
  // Only the request the stand actually carried out — staff may have asked
  // again in the meantime, and that newer one still stands.
  await db
    .update(stands)
    .set({ reloadRequestedAt: null, reloadForce: false })
    .where(and(eq(stands.id, standId), eq(stands.reloadRequestedAt, row.reloadRequestedAt)));
  return null;
}

/** Staff's "reload this stand" (admin Overview). `force` reloads even in
 * the middle of a customer's session; otherwise the stand waits until it is
 * free. False when the stand has never reported in. */
export async function requestStandReload(standId: string, force: boolean): Promise<boolean> {
  const updated = await db
    .update(stands)
    .set({ reloadRequestedAt: new Date(), reloadForce: force })
    .where(eq(stands.id, standId))
    .returning({ id: stands.id });
  return updated.length > 0;
}

export interface StandStatus {
  id: string;
  monitored: boolean;
  online: boolean;
  lastSeenAt: string | null;
  lastScreen: string | null;
  /** A reload staff asked for that the stand hasn't carried out yet. */
  reloadPending: { requestedAt: string; force: boolean } | null;
}

/** Every stand that has reported in, plus every watched one that never has. */
export async function listStandStatus(): Promise<StandStatus[]> {
  const rows = await db.select().from(stands);
  const watched = new Set(monitoredStandIds());
  const ids = [...new Set([...watched, ...rows.map((row) => row.id)])].sort();
  return ids.map((id) => {
    const row = rows.find((candidate) => candidate.id === id);
    return {
      id,
      monitored: watched.has(id),
      online: !!row && Date.now() - row.lastSeenAt.getTime() < STAND_SILENT_AFTER_MS,
      lastSeenAt: row?.lastSeenAt.toISOString() ?? null,
      lastScreen: row?.lastScreen ?? null,
      reloadPending: row?.reloadRequestedAt
        ? { requestedAt: row.reloadRequestedAt.toISOString(), force: row.reloadForce }
        : null,
    };
  });
}

export function startStandWatchdog(): void {
  const bootedAt = Date.now();
  const state = new Map<string, 'online' | 'offline'>();
  setInterval(() => {
    void (async () => {
      const watched = monitoredStandIds();
      if (watched.length === 0) return;
      const rows = await db.select().from(stands);
      for (const standId of watched) {
        const lastSeen = rows.find((row) => row.id === standId)?.lastSeenAt.getTime() ?? null;
        const silentSince = lastSeen ?? bootedAt;
        const online = Date.now() - silentSince < STAND_SILENT_AFTER_MS;
        if (online && lastSeen != null) {
          if (state.get(standId) !== 'online') {
            state.set(standId, 'online');
            await resolveOpenIncidentsFor(STAND_DEAD_INCIDENT, 'standId', standId, {
              reason: 'the stand called in again',
            });
          }
          continue;
        }
        if (online || state.get(standId) === 'offline') continue;
        state.set(standId, 'offline');
        if (await hasOpenIncidentFor(STAND_DEAD_INCIDENT, 'standId', standId)) continue;
        await reportIncident({
          source: 'pc',
          code: STAND_DEAD_INCIDENT,
          severity: 'emergency',
          message:
            lastSeen == null
              ? `Stand ${standId} has not reported in since the backend started — its screen may be off, frozen or offline. Customers can't use it.`
              : `Stand ${standId} has been silent since ${new Date(lastSeen).toISOString()} — its browser may be frozen, or the PC or its network down. Customers can't use it.`,
          context: { standId, lastSeenAt: lastSeen ? new Date(lastSeen).toISOString() : null },
        });
      }
    })().catch((err: unknown) => console.error('[standMonitor] watchdog failed:', err));
  }, WATCHDOG_INTERVAL_MS).unref();
}
