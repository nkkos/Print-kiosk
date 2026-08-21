// Talks to the real admin panel backend (server/adminRoutes.ts) — see
// docs/screens/admin-panel-spec.md. Mirrors src/services/accountApi.ts's
// shape (same postJson-helper pattern), plus a getJson counterpart since
// this panel is mostly read endpoints.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export interface StaffAccount {
  id: string;
  email: string;
  role: 'operator' | 'senior';
}

export interface Incident {
  id: string;
  source: string;
  code: string;
  severity: string;
  message: string;
  context: string | null;
  autoRemediation: string | null;
  correlationId: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  notifiedAt: string | null;
  createdAt: string;
}

export interface RosterEntry {
  dayOfWeek: string;
  staffAccountId: string;
  email: string;
  role: string;
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  sessionToken?: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? 'Request failed');
  }
  return data as T;
}

export async function login(
  email: string,
  password: string,
): Promise<StaffAccount & { sessionToken: string }> {
  return request('POST', '/api/admin/login', undefined, { email, password });
}

export async function getMe(sessionToken: string): Promise<StaffAccount> {
  return request('GET', '/api/admin/me', sessionToken);
}

export interface ListIncidentsParams {
  source?: string;
  severity?: string;
  openOnly?: boolean;
  limit?: number;
}

export async function listIncidents(
  sessionToken: string,
  params: ListIncidentsParams = {},
): Promise<Incident[]> {
  const query = new URLSearchParams();
  if (params.source) query.set('source', params.source);
  if (params.severity) query.set('severity', params.severity);
  if (params.openOnly) query.set('openOnly', 'true');
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return request('GET', `/api/admin/incidents${qs ? `?${qs}` : ''}`, sessionToken);
}

export async function getRoster(
  sessionToken: string,
): Promise<{ roster: RosterEntry[]; current: RosterEntry | null }> {
  return request('GET', '/api/admin/roster', sessionToken);
}

export async function getKioskSessionActive(sessionToken: string): Promise<boolean> {
  const { active } = await request<{ active: boolean }>(
    'GET',
    '/api/admin/kiosk-session-active',
    sessionToken,
  );
  return active;
}

export async function restartBackendProcess(
  sessionToken: string,
  incidentId?: string,
): Promise<void> {
  await request('POST', '/api/admin/equipment/backend/restart-process', sessionToken, {
    incidentId,
  });
}
