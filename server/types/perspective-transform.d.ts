// No official types ship with this package (npm view confirms no @types
// package exists either) — minimal ambient declaration covering only what
// server/scanProcessor.ts actually uses.
declare module 'perspective-transform' {
  interface PerspectiveTransform {
    transform(x: number, y: number): [number, number];
    transformInverse(x: number, y: number): [number, number];
    coeffs: number[];
    coeffsInv: number[];
  }

  // srcCorners/dstCorners are flat [x0,y0, x1,y1, x2,y2, x3,y3] arrays.
  function PerspT(srcCorners: number[], dstCorners: number[]): PerspectiveTransform;

  export default PerspT;
}
