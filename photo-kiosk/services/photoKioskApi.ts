// Talks to the real photo-document backend (server/routes.ts's /api/photo-countries,
// /api/photo-documents) — see docs/photo-kiosk-requirements.md. Public, no auth, same
// as the shop's own catalog reads (this is reference data, not account-specific).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export interface PhotoCountry {
  id: string;
  name: string;
}

export interface PhotoDocument {
  id: string;
  countryId: string;
  label: string;
  photoWidthMm: number;
  photoHeightMm: number;
  dpi: number;
  headHeightMinMm: number;
  headHeightMaxMm: number;
  eyeLineFromBottomMm: number | null;
  marginTopMm: number | null;
  headWidthMinMm: number | null;
  headWidthMaxMm: number | null;
  backgroundRequirement: string | null;
  backgroundColorHex: string | null;
  printNotes: string | null;
  copiesPerSheet: number;
  priceCents: number;
  instructions: string | null;
  active: boolean;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? 'Request failed');
  }
  return data as T;
}

export async function listCountries(): Promise<PhotoCountry[]> {
  return getJson('/api/photo-countries');
}

export async function listDocumentsForCountry(countryId: string): Promise<PhotoDocument[]> {
  return getJson(`/api/photo-countries/${countryId}/documents`);
}

export async function getDocument(id: string): Promise<PhotoDocument> {
  return getJson(`/api/photo-documents/${id}`);
}

export interface RecordPhotoOrderRequest {
  sessionId: string | null;
  spec: { label: string; widthMm: number; heightMm: number; dpi: number | null };
  shotCount: number;
  quantity: number;
  amountCents: number;
}

// Records the fact of a simulated-paid purchase — metadata only, never photo
// content (server/photoOrderStore.ts).
export async function recordPhotoOrder(
  body: RecordPhotoOrderRequest,
): Promise<{ id: string; status: string }> {
  const response = await fetch(`${API_BASE_URL}/api/photo-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? 'Request failed');
  }
  return data as { id: string; status: string };
}

export async function markPhotoOrdersPrinted(ids: string[]): Promise<void> {
  await fetch(`${API_BASE_URL}/api/photo-orders/printed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? 'Request failed');
  }
  return data as T;
}

// "Send me a copy" (docs/photo-kiosk-requirements.md) — a deliberate, narrow
// exception to this file's own usual "metadata only, never photo content"
// rule (see recordPhotoOrder above); server/photoShareStore.ts explains why
// and how the exception is kept narrow (in-memory only, one-time-use).
export async function sharePhotoByEmail(email: string, photoDataUrl: string): Promise<void> {
  const form = new FormData();
  form.append('email', email);
  form.append('photo', dataUrlToBlob(photoDataUrl), 'photo.jpg');
  await postForm('/api/photo-kiosk/share-email', form);
}

/** Returns a one-time download token — the caller builds the actual QR-code
 * URL from it plus getKioskConfig()'s lanUploadUrl (same base URL the QR
 * upload flow already uses for the reverse direction). */
export async function createPhotoShareLink(photoDataUrl: string): Promise<string> {
  const form = new FormData();
  form.append('photo', dataUrlToBlob(photoDataUrl), 'photo.jpg');
  const { token } = await postForm<{ token: string }>('/api/photo-kiosk/share-link', form);
  return token;
}

export async function getKioskConfig(): Promise<{ lanUploadUrl: string }> {
  return getJson('/api/config');
}
