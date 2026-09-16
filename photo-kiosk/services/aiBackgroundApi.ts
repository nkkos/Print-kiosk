// Talks to server/routes.ts's POST /api/photo-kiosk/ai-background — the
// generative (Nano Banana Pro) compositor, a deliberate, narrow exception
// to this app's "photo pixel data never leaves the client" rule, scoped
// only to this optional/decorative branch (see that route's own comment).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

/** Sends the confirmed shot + chosen look's id to the backend, gets back a
 * harmonized composite as a data URL. Throws on any failure (missing API
 * key, network error, the model returning no image) — callers should fall
 * back to something else (portraitMatting.ts's local compositeOntoImageBackground)
 * rather than leaving the customer stuck. */
export async function compositeViaNanoBanana(shotDataUrl: string, lookId: string): Promise<string> {
  const shotBlob = await (await fetch(shotDataUrl)).blob();
  const formData = new FormData();
  formData.append('shot', shotBlob, 'shot.jpg');
  formData.append('lookId', lookId);

  const response = await fetch(`${API_BASE_URL}/api/photo-kiosk/ai-background`, {
    method: 'POST',
    body: formData,
  });
  const data = (await response.json().catch(() => ({}))) as {
    mimeType?: string;
    base64?: string;
    error?: string;
  };
  if (!response.ok || !data.mimeType || !data.base64) {
    throw new Error(data.error ?? 'AI compositing failed');
  }
  return `data:${data.mimeType};base64,${data.base64}`;
}
