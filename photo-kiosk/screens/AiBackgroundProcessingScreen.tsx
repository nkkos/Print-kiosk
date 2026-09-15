// Shown while compositeOntoImageBackground (portraitMatting.ts) runs after
// ShotReviewScreen's crop is confirmed — real ONNX inference, not
// instant, and slower again than "Фото на документы"'s chroma-key path.
export function AiBackgroundProcessingScreen() {
  return (
    <div className="pk-screen pk-screen-center" id="view-ai-background-processing">
      <p>Собираем фото с выбранным фоном…</p>
    </div>
  );
}
