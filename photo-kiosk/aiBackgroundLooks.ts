// "AI бэкграунд" branch's catalog of decorative background pictures — a
// hardcoded list for now, not an admin-managed table like photo_documents,
// since this branch's whole content set is still a discovery-stage
// experiment (docs/photo-kiosk-requirements.md: "build it, judge the
// actual output quality, and drop the feature entirely if it doesn't
// reach an acceptable bar").
//
// 2026-09-15: only ever a handful of entries by design — the product
// owner chose to ship ONE look first purely to validate the mechanic
// (AiBackgroundGalleryScreen → capture → compositeOntoImageBackground),
// before spending any effort on the real content set (custom AI-generated
// Bratislava/souvenir art, per that same discovery conversation). Add
// entries here once real artwork exists; each `imageUrl` just needs to be
// a real file under public/photo-kiosk/ai-backgrounds/.
export interface AiBackgroundLook {
  id: string;
  label: string;
  // Gallery preview thumbnail — omitted when there's no real reference
  // photo to show (2026-09-16: a look can be a fully text-described scene
  // with no background image at all, see server/aiBackgroundCompositor.ts's
  // 'night-flash-portrait'; AiBackgroundGalleryScreen falls back to a
  // label-only card until a real sample render exists to use here).
  imageUrl?: string;
  // Drives which way PhotoKioskApp.tsx orients the photo itself (2026-09-16
  // — confirmed the customer's crop/print orientation should follow the
  // chosen look's own shape, e.g. a wide cityscape wants a landscape photo,
  // not a portrait one with the scenery squeezed into a narrow strip on
  // each side).
  orientation: 'portrait' | 'landscape';
}

// Every id here must have a matching entry in server/aiBackgroundCompositor.ts's
// own LOOKS — that file owns each look's actual prompt/reference image (never
// sent to or stored on the client), this file only owns what the gallery UI
// needs to show and pick from.
export const AI_BACKGROUND_LOOKS: AiBackgroundLook[] = [
  {
    id: 'test-1',
    label: 'Братислава ночью',
    imageUrl: '/photo-kiosk/ai-backgrounds/test-1.jpg',
    orientation: 'landscape',
  },
  {
    id: 'night-street-portrait',
    label: 'Ночной портрет на улице',
    // No imageUrl yet — no sample render exists to show as a thumbnail.
    orientation: 'portrait',
  },
];
