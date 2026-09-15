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
  imageUrl: string;
}

export const AI_BACKGROUND_LOOKS: AiBackgroundLook[] = [
  {
    id: 'test-1',
    label: 'Тест 1',
    imageUrl: '/photo-kiosk/ai-backgrounds/test-1.jpg',
  },
];
