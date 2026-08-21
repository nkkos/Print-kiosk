import { and, desc, eq, isNull } from 'drizzle-orm';
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
