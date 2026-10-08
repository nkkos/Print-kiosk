import { and, desc, eq, inArray, isNull, like } from 'drizzle-orm';
import { db } from './db/client.js';
import { incidents } from './db/schema.js';
import { notifyIfNeeded } from './telegramNotifier.js';

// Central incident log (docs/equipment-monitoring-requirements.md) — every
// equipment/service failure is recorded here in one shared shape, called
// from wherever the failure is actually caught (that document's Methodology,
// "In-process exception handling"). Powers the admin panel's Overview feed,
// Equipment detail history, and Incident log (docs/screens/admin-panel-spec.md).

export type IncidentSource =
  'pc' | 'printer' | 'display' | 'network' | 'backend' | 'payment-terminal';
export type IncidentSeverity = 'info' | 'warning' | 'critical' | 'emergency';

export interface IncidentRow {
  id: string;
  source: string;
  code: string;
  severity: string;
  message: string;
  context: string | null;
  autoRemediation: string | null;
  correlationId: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  notifiedAt: Date | null;
  createdAt: Date;
}

export interface ReportIncidentInput {
  source: IncidentSource;
  code: string;
  severity: IncidentSeverity;
  message: string;
  context?: Record<string, unknown>;
  correlationId?: string;
}

/** Records one incident. Never throws — a logging failure shouldn't compound
 * whatever it's trying to log, so callers can fire-and-forget this. */
export async function reportIncident(input: ReportIncidentInput): Promise<IncidentRow | null> {
  try {
    const [row] = await db
      .insert(incidents)
      .values({
        source: input.source,
        code: input.code,
        severity: input.severity,
        message: input.message,
        context: input.context ? JSON.stringify(input.context) : null,
        correlationId: input.correlationId ?? null,
      })
      .returning();
    void notifyIfNeeded(row as IncidentRow);
    return row as IncidentRow;
  } catch (err) {
    console.error('[incidentStore] Failed to report incident:', input.code, err);
    return null;
  }
}

/** 'auto' for a successful auto-remediation attempt, 'operator' for a manual
 * fix confirmed via the admin panel's confirmation dialog
 * (docs/screens/admin-panel-spec.md). */
export async function resolveIncident(
  id: string,
  resolvedBy: 'auto' | 'operator',
  autoRemediation?: Record<string, unknown>,
): Promise<void> {
  await db
    .update(incidents)
    .set({
      resolvedAt: new Date(),
      resolvedBy,
      ...(autoRemediation ? { autoRemediation: JSON.stringify(autoRemediation) } : {}),
    })
    .where(eq(incidents.id, id));
}

/** Whether an incident with this code is still open — lets a condition that
 * keeps being reported (a printer problem, an offline agent) raise one
 * incident, not one per report or one more after every backend restart. */
export async function hasOpenIncident(code: string): Promise<boolean> {
  const [row] = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(and(eq(incidents.code, code), isNull(incidents.resolvedAt)))
    .limit(1);
  return !!row;
}

/** Closes every open incident with one of these codes as auto-resolved —
 * for conditions that clear by themselves (the printer stops reporting a
 * jam, the agent calls in again). Never throws, same as reportIncident. */
export async function resolveOpenIncidents(
  codes: string[],
  autoRemediation: Record<string, unknown>,
): Promise<void> {
  if (codes.length === 0) return;
  try {
    await db
      .update(incidents)
      .set({
        resolvedAt: new Date(),
        resolvedBy: 'auto',
        autoRemediation: JSON.stringify(autoRemediation),
      })
      .where(and(inArray(incidents.code, codes), isNull(incidents.resolvedAt)));
  } catch (err) {
    console.error('[incidentStore] Failed to auto-resolve incidents:', codes, err);
  }
}

/** Like hasOpenIncident, for incidents about one specific thing — e.g. one
 * stand's pc.dead — told apart by a key/value in their context. */
export async function hasOpenIncidentFor(
  code: string,
  key: string,
  value: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(
      and(
        eq(incidents.code, code),
        isNull(incidents.resolvedAt),
        like(incidents.context, `%"${key}":"${value}"%`),
      ),
    )
    .limit(1);
  return !!row;
}

/** Like resolveOpenIncidents, for one specific thing's incidents only. */
export async function resolveOpenIncidentsFor(
  code: string,
  key: string,
  value: string,
  autoRemediation: Record<string, unknown>,
): Promise<void> {
  try {
    await db
      .update(incidents)
      .set({
        resolvedAt: new Date(),
        resolvedBy: 'auto',
        autoRemediation: JSON.stringify(autoRemediation),
      })
      .where(
        and(
          eq(incidents.code, code),
          isNull(incidents.resolvedAt),
          like(incidents.context, `%"${key}":"${value}"%`),
        ),
      );
  } catch (err) {
    console.error('[incidentStore] Failed to auto-resolve incidents:', code, value, err);
  }
}

export interface ListIncidentsFilters {
  source?: IncidentSource;
  severity?: IncidentSeverity;
  openOnly?: boolean;
  limit?: number;
}

/** Powers both Overview's active-incidents feed (openOnly: true) and the
 * Incident log screen's full list. */
export async function listIncidents(filters: ListIncidentsFilters = {}): Promise<IncidentRow[]> {
  const conditions = [];
  if (filters.source) conditions.push(eq(incidents.source, filters.source));
  if (filters.severity) conditions.push(eq(incidents.severity, filters.severity));
  if (filters.openOnly) conditions.push(isNull(incidents.resolvedAt));

  const rows = await db
    .select()
    .from(incidents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(incidents.createdAt))
    .limit(filters.limit ?? 200);
  return rows as IncidentRow[];
}
