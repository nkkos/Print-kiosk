import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Modality } from '@google/genai';
import type { Part } from '@google/genai';

// "AI бэкграунд"'s generative compositor — Nano Banana Pro (Gemini 3 Pro
// Image), replacing a flat matte-and-paste composite (photo-kiosk's own
// portraitMatting.ts, which stays as-is for "Фото на документы") that the
// product owner judged too "кустарно" (amateurish) without real
// harmonization of lighting, shadow, and perspective. Picked over cheaper
// candidates (FLUX.1 Kontext, OpenAI GPT Image) after a 2026-09-16 cost/
// capability research pass specifically for its identity-preservation
// benchmarks and explicit "place subject in a different background"
// capability — see that session's comparison for the other options and
// why the ORIGINAL "Nano Banana" (Gemini 2.5 Flash Image) wasn't used
// (deprecated, shut down 2026-10-02).
//
// A deliberate, narrow exception to this project's "photo pixel data
// never leaves the client" principle (confirmed accepted 2026-09-16,
// scoped ONLY to this optional/decorative branch — document photos and
// everything else stay fully local). GEMINI_API_KEY unset → returns
// null, caller (server/routes.ts) reports the branch as unavailable —
// same graceful-missing-credential convention as emailSender.ts's
// RESEND_API_KEY handling, just without a meaningful local fallback for
// a generative edit the way that file has a "log to console instead".
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Google's current model id for Nano Banana Pro as of 2026-09 — the
// "-preview" suffix is Google's own naming, not a signal we're depending
// on something unstable. A wrong/renamed id fails loudly with a clear API
// error, not silently, so this is safe to adjust later without ceremony.
const MODEL_ID = 'gemini-3-pro-image-preview';

interface AiBackgroundLook {
  // A background reference image to send alongside the shot — omit when
  // the prompt fully describes the scene on its own (2026-09-16: the
  // "night flash portrait" look below needs no reference photo at all,
  // everything about the setting is written directly into its prompt).
  file?: string;
  aspectRatio: '2:3' | '3:2';
  // The COMPLETE, standalone prompt for this look — deliberately NOT built
  // from any shared base text (2026-09-16, revised after the product owner
  // pointed out a look isn't necessarily "photorealistic scene compositing"
  // at all — one might be an art-portrait style transform, or something
  // else entirely unrelated to lighting/perspective matching). Each look
  // is its own product; write its prompt for what THAT product actually
  // needs, not as a fragment plugged into someone else's structure.
  prompt: string;
}

// Mirrors photo-kiosk/aiBackgroundLooks.ts's catalog — kept in sync by hand
// for now (a small, single-entry, discovery-stage list; see that file's
// own comment for why it isn't admin-managed yet, and consider a real
// shared source of truth if this branch graduates past that stage).
const LOOKS: Record<string, AiBackgroundLook> = {
  'test-1': {
    file: 'test-1.jpg',
    aspectRatio: '3:2',
    prompt:
      'The first image shows a real person. The second image shows a night cityscape ' +
      '(Bratislava, seen from above), lit by warm orange/amber street and building ' +
      'lights mixed with cooler white and blue illuminated windows, under a dark ' +
      'night sky — there is no sunlight or single strong light source.\n\n' +
      "Composite the person from the first image into the second image's environment, " +
      'as if both photos were taken by the same camera at the same moment — the person ' +
      'is really standing there, not pasted on top.\n\n' +
      'Preserve the person exactly as shown in the first photo: their face, skin tone, ' +
      'hairstyle, body proportions, and clothing must not change in any way.\n\n' +
      'Relight the person with soft, ambient light consistent with standing in this ' +
      'city at night: a warm, low-intensity glow from the city lights below and around ' +
      'them (not from directly overhead), gentle multi-directional fill rather than one ' +
      'hard shadow, and skin/clothing tones slightly warmed to match the amber ambient ' +
      'light. Match the scale and camera perspective of the background so their size in ' +
      'the frame looks physically correct for their apparent distance.\n\n' +
      'The result must look like one real, unedited photograph taken at this exact spot ' +
      'at night — no visible seam, halo, or colour mismatch at the edges of the person. ' +
      'Keep the same framing and aspect ratio as the first photo.',
  },
  // 2026-09-16: the original version of this prompt (given verbatim by the
  // product owner, see git history) came back from a real customer-face
  // test as a DIFFERENT-looking, unflattering person — not the requested
  // "same person, subtly improved." The likely culprits were "direct
  // camera flash illuminating her face" and "glossy skin highlights":
  // asking for a flash-photography look seems to have given the model
  // licence to reinterpret the face heavily to match that aesthetic,
  // rather than doing a careful, identity-preserving edit. Rewritten with
  // identity preservation stated first and most strongly, only a
  // barely-perceptible retouch permitted, and warm ambient streetlamp
  // light in place of a harsh flash (also a closer match to what the
  // product owner actually asked for: "залитого тёплым светом фонарей").
  // Renamed from 'night-flash-portrait' since it's no longer about flash
  // at all — keep photo-kiosk/aiBackgroundLooks.ts's id in sync.
  'night-street-portrait': {
    aspectRatio: '2:3',
    prompt:
      'The attached photo shows a real person. This is the most important ' +
      'requirement: the result must be immediately recognizable as the SAME ' +
      'person — do not change their facial structure, eye shape, nose, mouth, ' +
      'jawline, or any other identifying feature. You may apply only a very ' +
      'subtle, natural skin retouch, the way a professional portrait photographer ' +
      'gently evens out skin tone and minor texture — this must be barely ' +
      'perceptible and must never alter their actual facial features. Keep their ' +
      'expression soft, calm, and natural.\n\n' +
      'Render this person into the following scene: a portrait of them standing ' +
      'on a city sidewalk at night, beside a red and white traffic cone, ' +
      'illuminated by warm, soft ambient light from the surrounding streetlamps ' +
      '(not a flash) — their skin and clothes gently warmed by this golden ' +
      'streetlight glow. In the background: warm yellow streetlights, cars with ' +
      'glowing lights, and pedestrians and buildings all softly blurred out of ' +
      'focus. Cinematic nighttime atmosphere, street photography style, high ' +
      'detail, realistic lighting, shallow depth of field, 35mm photography.',
  },
};

const looksDir = dirname(fileURLToPath(import.meta.url));
const publicAiBackgroundsDir = join(looksDir, '..', 'public', 'photo-kiosk', 'ai-backgrounds');

export interface NanoBananaResult {
  mimeType: string;
  base64: string;
}

/** Composites `shotBase64` (the customer's confirmed, already-cropped
 * photo) via Nano Banana Pro, using the given look's own reference image
 * and complete, independent prompt (see LOOKS above — every look is its
 * own product, not a shared template). Returns null if GEMINI_API_KEY
 * isn't configured, `lookId` doesn't match a known look, or the model
 * returned no image part — callers must treat all of these as "AI
 * compositing unavailable right now," not a hard crash. */
export async function compositeViaNanoBanana(
  lookId: string,
  shotBase64: string,
  shotMimeType: string,
): Promise<NanoBananaResult | null> {
  const look = LOOKS[lookId];
  if (!ai || !look) return null;

  const contents: Part[] = [{ inlineData: { mimeType: shotMimeType, data: shotBase64 } }];
  if (look.file) {
    const backgroundBuffer = await readFile(join(publicAiBackgroundsDir, look.file));
    contents.push({
      inlineData: { mimeType: 'image/jpeg', data: backgroundBuffer.toString('base64') },
    });
  }
  contents.push({ text: look.prompt });

  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents,
    config: {
      // personGeneration is Vertex-AI/Enterprise-only — confirmed by a real
      // call against a plain Gemini Developer API key (AI Studio), which
      // rejects it outright. No equivalent knob exists on this API surface;
      // nothing else needed it removed.
      responseModalities: [Modality.IMAGE],
      imageConfig: { aspectRatio: look.aspectRatio, imageSize: '2K' },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) return null;
  return { mimeType: imagePart.inlineData.mimeType, base64: imagePart.inlineData.data };
}
