import type { CaptureSpec } from '../types';

interface ConfirmConfigScreenProps {
  spec: CaptureSpec;
  onConfirm: () => void;
}

export function ConfirmConfigScreen({ spec, onConfirm }: ConfirmConfigScreenProps) {
  return (
    <div className="pk-screen" id="view-confirm-config">
      <h1 className="pk-title">Подтвердите конфигурацию</h1>
      <div className="pk-confirm-card">
        <p id="confirm-config-selection">
          <b>Ваш выбор:</b> {spec.label} ({spec.widthMm}×{spec.heightMm} мм)
        </p>
        {spec.instructions && (
          <p className="pk-form-hint" id="confirm-config-instructions">
            {spec.instructions}
          </p>
        )}
      </div>
      <button
        type="button"
        className="pk-btn pk-btn-primary"
        id="confirm-config-go-to-capture"
        onClick={onConfirm}
      >
        Перейти к фотографированию
      </button>
    </div>
  );
}
