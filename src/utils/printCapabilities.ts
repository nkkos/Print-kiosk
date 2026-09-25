// What the pavilion's printer (Brother HL-L9430CDN) can physically do —
// its automatic duplex unit only handles A4 (Brother spec; A5 would fall
// back to the driver's manual duplex, which needs a person to re-feed the
// sheets). Mirrored server-side in server/printerAdapter.ts's
// supportsDuplex and the order validation in server/routes.ts.
export function supportsDuplex(paperSize: 'A4' | 'A5'): boolean {
  return paperSize === 'A4';
}
