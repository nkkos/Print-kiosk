import { useState } from 'react';
import type { PhotoCartItem } from '../types';

type PrintOutcome = 'success' | 'paper-jam' | 'out-of-paper' | 'out-of-ink';

interface PrintScreenProps {
  cartItems: PhotoCartItem[];
  onPrintComplete: () => void;
}

const ERROR_MESSAGES: Record<Exclude<PrintOutcome, 'success'>, string> = {
  'paper-jam': 'Замятие бумаги. Обратитесь к оператору или повторите попытку.',
  'out-of-paper': 'Закончилась бумага. Обратитесь к оператору.',
  'out-of-ink': 'Закончились чернила. Обратитесь к оператору.',
};

// Mirrors src/features/print-status/PrintStatusScreen.tsx's structure but
// WITHOUT real pdf-to-printer job submission — no photo-printer hardware is
// chosen yet (docs/photo-kiosk-requirements.md's "Printer hardware" open
// item), so this stays manual "Simulate ..." buttons only, same fidelity the
// main kiosk itself has for jam/out-of-paper/out-of-ink outcomes. No Back
// action (docs/domain/kiosk-session.md: "Print Status has no Back action —
// this screen is fully system-controlled") — an already-paid order can only
// retry, never cancel.
export function PrintScreen({ cartItems, onPrintComplete }: PrintScreenProps) {
  const [error, setError] = useState<Exclude<PrintOutcome, 'success'> | null>(null);

  function handleOutcome(outcome: PrintOutcome) {
    if (outcome === 'success') {
      setError(null);
      onPrintComplete();
    } else {
      setError(outcome);
    }
  }

  return (
    <div className="pk-screen pk-screen-center" id="view-print">
      <h1 className="pk-title">Печать</h1>

      {error && <p className="pk-error">{ERROR_MESSAGES[error]}</p>}

      <div className="pk-gallery-grid" id="print-sheets">
        {cartItems.map((item) => (
          <img
            key={item.id}
            src={item.sheetPreviewDataUrl}
            alt={item.spec.label}
            className="pk-sheet-preview"
          />
        ))}
      </div>

      <div className="pk-hero-actions">
        <button
          type="button"
          className="pk-btn pk-btn-primary"
          id="print-simulate-success"
          onClick={() => handleOutcome('success')}
        >
          Симулировать успешную печать
        </button>
        <button
          type="button"
          className="pk-btn pk-btn-ghost"
          id="print-simulate-paper-jam"
          onClick={() => handleOutcome('paper-jam')}
        >
          Замятие бумаги
        </button>
        <button
          type="button"
          className="pk-btn pk-btn-ghost"
          id="print-simulate-out-of-paper"
          onClick={() => handleOutcome('out-of-paper')}
        >
          Нет бумаги
        </button>
        <button
          type="button"
          className="pk-btn pk-btn-ghost"
          id="print-simulate-out-of-ink"
          onClick={() => handleOutcome('out-of-ink')}
        >
          Нет чернил
        </button>
      </div>
    </div>
  );
}
