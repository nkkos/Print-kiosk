// What the pavilion's printer (Brother HL-L9430CDN) can physically do —
// its automatic duplex unit only handles A4 (Brother spec; A5 would fall
// back to the driver's manual duplex, which needs a person to re-feed the
// sheets). Mirrored server-side in server/printerAdapter.ts's
// supportsDuplex and the order validation in server/routes.ts.
// Paper sizes customers can order. Both trays hold A4 (the LT-330CL is a
// reserve A4 tray, decided 2026-09-25 — see docs/pavilion-launch-checklist.md),
// so A5 is hidden until a tray holds it again: add 'A5' back here and in
// server/printerAdapter.ts's OFFERED_PAPER_SIZES. The paper-size choice itself
// disappears from the UI while only one size is offered.
export const OFFERED_PAPER_SIZES: readonly ('A4' | 'A5')[] = ['A4'];

export function supportsDuplex(paperSize: 'A4' | 'A5'): boolean {
  return paperSize === 'A4';
}
