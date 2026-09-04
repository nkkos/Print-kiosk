import { useState } from 'react';
import type { CaptureSpec } from '../types';

interface CustomSizeScreenProps {
  onConfirm: (spec: CaptureSpec) => void;
}

// docs/photo-kiosk-requirements.md's "Произвольный размер" branch — only size is
// required; margin/eye-level are optional and deliberately not asked as if the
// customer knows precise official numbers (confirmed 2026-08-25: most don't, even
// when their document has real requirements). Left blank, a standard default crop
// applies at capture time (cropUtil.ts's DEFAULT_MARGIN_RATIO/DEFAULT_EYE_LINE_RATIO
// — placeholder values pending product-owner sign-off, per that document's own
// open item) rather than this screen guessing at anything itself.
export function CustomSizeScreen({ onConfirm }: CustomSizeScreenProps) {
  const [widthMm, setWidthMm] = useState('35');
  const [heightMm, setHeightMm] = useState('45');
  const [marginMm, setMarginMm] = useState('');
  const [eyeLevelMm, setEyeLevelMm] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const width = Number(widthMm);
    const height = Number(heightMm);
    if (!width || !height) return;
    onConfirm({
      label: `Свой размер ${width}×${height} мм`,
      widthMm: width,
      heightMm: height,
      marginMm: marginMm ? Number(marginMm) : undefined,
      eyeLineFromBottomMm: eyeLevelMm ? Number(eyeLevelMm) : undefined,
    });
  }

  return (
    <div className="pk-screen" id="view-custom-size">
      <h1 className="pk-title">Произвольный размер</h1>

      <form onSubmit={handleSubmit} className="pk-form">
        <div className="pk-form-row">
          <label>
            Ширина, мм *
            <input
              type="number"
              id="custom-size-width"
              className="pk-input"
              value={widthMm}
              onChange={(e) => setWidthMm(e.target.value)}
              required
            />
          </label>
          <label>
            Высота, мм *
            <input
              type="number"
              id="custom-size-height"
              className="pk-input"
              value={heightMm}
              onChange={(e) => setHeightMm(e.target.value)}
              required
            />
          </label>
        </div>
        <p className="pk-form-hint">Необязательно — если не знаете, оставьте пустым:</p>
        <div className="pk-form-row">
          <label>
            Отступ от края, мм
            <input
              type="number"
              id="custom-size-margin"
              className="pk-input"
              value={marginMm}
              onChange={(e) => setMarginMm(e.target.value)}
            />
          </label>
          <label>
            Уровень глаз, мм от низа
            <input
              type="number"
              id="custom-size-eye-level"
              className="pk-input"
              value={eyeLevelMm}
              onChange={(e) => setEyeLevelMm(e.target.value)}
            />
          </label>
        </div>
        <button type="submit" className="pk-btn pk-btn-primary" id="custom-size-submit">
          Далее
        </button>
      </form>
    </div>
  );
}
