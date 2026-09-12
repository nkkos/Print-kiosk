import { useState } from 'react';
import type { CaptureSpec } from '../types';

interface CustomSizeScreenProps {
  onConfirm: (spec: CaptureSpec) => void;
}

// docs/photo-kiosk-requirements.md's "Произвольный размер" branch — only size is
// required; everything else is optional and deliberately not forced as if the
// customer knows precise official numbers (confirmed 2026-08-25: most don't, even
// when their document has real requirements). Left blank, sensible defaults apply
// at capture time (cropUtil.ts's DEFAULT_EYE_LINE_RATIO/DEFAULT_HEAD_HEIGHT_RATIO)
// rather than this screen guessing at anything itself.
//
// headHeightMinMm/MaxMm and backgroundColorHex added 2026-09 after country
// research showed these are the two most commonly published requirements this
// branch didn't yet expose — head-height is also what calibrates the real
// detected-face crop scale (cropUtil.ts's computeCropSize) instead of the
// cruder frame-relative fallback, so filling it in (even approximately)
// noticeably improves crop accuracy for a document we don't have preset.
// headWidthMinMm/MaxMm added alongside for the same reason, even though the
// same research found it published far less often (~2% of documents) — the
// crop pipeline already fully supports it (guide brackets, crop-bounds
// clamp), so exposing it here cost nothing once head-height was already
// being added.
export function CustomSizeScreen({ onConfirm }: CustomSizeScreenProps) {
  const [widthMm, setWidthMm] = useState('35');
  const [heightMm, setHeightMm] = useState('45');
  const [marginTopMm, setMarginTopMm] = useState('');
  const [eyeLevelMm, setEyeLevelMm] = useState('');
  const [headHeightMinMm, setHeadHeightMinMm] = useState('');
  const [headHeightMaxMm, setHeadHeightMaxMm] = useState('');
  const [headWidthMinMm, setHeadWidthMinMm] = useState('');
  const [headWidthMaxMm, setHeadWidthMaxMm] = useState('');
  const [backgroundColorHex, setBackgroundColorHex] = useState<string | undefined>(undefined);
  const [instructions, setInstructions] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const width = Number(widthMm);
    const height = Number(heightMm);
    if (!width || !height) return;
    onConfirm({
      label: `Свой размер ${width}×${height} мм`,
      widthMm: width,
      heightMm: height,
      marginTopMm: marginTopMm ? Number(marginTopMm) : undefined,
      eyeLineFromBottomMm: eyeLevelMm ? Number(eyeLevelMm) : undefined,
      headHeightMinMm: headHeightMinMm ? Number(headHeightMinMm) : undefined,
      headHeightMaxMm: headHeightMaxMm ? Number(headHeightMaxMm) : undefined,
      headWidthMinMm: headWidthMinMm ? Number(headWidthMinMm) : undefined,
      headWidthMaxMm: headWidthMaxMm ? Number(headWidthMaxMm) : undefined,
      backgroundColorHex,
      instructions: instructions.trim() || undefined,
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
              value={marginTopMm}
              onChange={(e) => setMarginTopMm(e.target.value)}
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
        <div className="pk-form-row">
          <label>
            Рост головы от, мм
            <input
              type="number"
              id="custom-size-head-height-min"
              className="pk-input"
              value={headHeightMinMm}
              onChange={(e) => setHeadHeightMinMm(e.target.value)}
            />
          </label>
          <label>
            Рост головы до, мм
            <input
              type="number"
              id="custom-size-head-height-max"
              className="pk-input"
              value={headHeightMaxMm}
              onChange={(e) => setHeadHeightMaxMm(e.target.value)}
            />
          </label>
        </div>
        <div className="pk-form-row">
          <label>
            Ширина головы от, мм
            <input
              type="number"
              id="custom-size-head-width-min"
              className="pk-input"
              value={headWidthMinMm}
              onChange={(e) => setHeadWidthMinMm(e.target.value)}
            />
          </label>
          <label>
            Ширина головы до, мм
            <input
              type="number"
              id="custom-size-head-width-max"
              className="pk-input"
              value={headWidthMaxMm}
              onChange={(e) => setHeadWidthMaxMm(e.target.value)}
            />
          </label>
        </div>
        <div className="pk-form-row pk-background-color-row">
          <span className="pk-form-hint" style={{ margin: 0 }}>
            Цвет фона
          </span>
          <input
            type="color"
            id="custom-size-background-color"
            value={backgroundColorHex ?? '#ffffff'}
            onChange={(e) => setBackgroundColorHex(e.target.value)}
          />
          {backgroundColorHex != null && (
            <button
              type="button"
              className="pk-cart-item-remove"
              id="custom-size-background-color-clear"
              onClick={() => setBackgroundColorHex(undefined)}
            >
              Сбросить (не менять фон)
            </button>
          )}
        </div>
        <div className="pk-form-row">
          <label>
            Особые требования (необязательно)
            <textarea
              id="custom-size-instructions"
              className="pk-input"
              rows={2}
              placeholder="Например: без очков, нейтральное выражение лица"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
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
