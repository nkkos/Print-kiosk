// Background replacement against the booth's own known physical backdrop —
// NOT ML segmentation (backgroundSegmentation.ts, kept in the codebase but
// no longer wired into CaptureScreen). Confirmed 2026-09-XX after real
// testing: the general selfie-segmenter model, trained on natural photos,
// performed WORSE on a saturated/contrasting backdrop than on a plain wall
// — an artificial solid-color backdrop is out-of-distribution input for
// that model. Chroma-key is the right tool specifically because the booth
// has (or will have) a controlled, uniform backdrop — the exact scenario
// this decades-old broadcast/photography technique was built for.
//
// 2026-09-15, three iterations in one session before landing here (see git
// history for the first two — plain RGB Euclidean distance, then a
// hand-rolled colour-channel-dominance metric, then a hand-rolled
// hue+saturation metric): each hand-rolled version, driven by real
// captured pixel data, fixed the failure the previous one had just proven
// (dark backdrops collapsing into dark faces; then light/neutral hair and
// clothing landing in the ambiguous middle) but still produced hard,
// jagged cutout edges with no real feathering, and no actual green-fringe
// removal on loose hair strands — both expected once you're re-deriving
// chroma-key from first principles instead of using a tool built by people
// who've spent years on exactly this. Switched to `gl-chromakey`
// (https://github.com/bhj/gl-chromakey, MIT, zero dependencies, ~35KB):
// real edge smoothness (feathering) and real spill suppression
// (desaturates the green cast that bleeds onto hair/edges near the key
// colour) instead of a single hard/ramped threshold. Requires WebGL2 — an
// acceptable requirement for one fixed, known kiosk PC (unlike a public
// web app with unknown visitor hardware), not attempted before adopting
// this because it wasn't needed until this session's real captures proved
// the "roll our own" approach's ceiling.
import GLChromaKey from 'gl-chromakey';

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// 2026-09-15, same-day follow-up: a fixed guessed key hex (eyeballed from a
// screenshot — grey, orange, a dark-navy print, and pale blue/green were
// all tried and rejected first this session before a real saturated-green
// fabric) is what kept going wrong all session, regardless of which
// distance formula wrapped around it: too loose a guess recolored the
// whole frame, too tight a guess (this library's default tolerance,
// against the same guessed hex) recolored NOTHING at all — both are the
// same root problem, not two different bugs. gl-chromakey's own `'auto'`
// key mode sidesteps guessing entirely: it samples the real corner pixels
// of the CURRENT captured frame each render and keys on those, the same
// real-data-over-guesswork discipline this session's diagnostics already
// established, just automated. Only really reliable when the backdrop
// fills the frame's corners — true once real hardware is installed, not
// yet true of the various hand-held fabric tests this session.
let keyer: GLChromaKey | null = null;
let keyedCanvas: HTMLCanvasElement | null = null;

// One GL context + offscreen canvas, reused across every capture rather
// than recreated per shot — browsers cap the number of live WebGL contexts
// a page may hold at once, and repeatedly creating/discarding one per
// capture on a kiosk that runs for hours would risk hitting that ceiling.
// `.source()` swaps in the real video/canvas before each render; the tiny
// placeholder here only satisfies the constructor's required parameter and
// is never actually rendered from.
function getKeyer(): { keyer: GLChromaKey; canvas: HTMLCanvasElement } {
  if (keyer && keyedCanvas) return { keyer, canvas: keyedCanvas };

  keyedCanvas = document.createElement('canvas');
  const placeholder = document.createElement('canvas');
  keyer = new GLChromaKey(placeholder, keyedCanvas);
  // 'auto' re-samples the real current frame's corners on every render()
  // call (see the module comment) — smoothness/spill bumped above the
  // library's own defaults (0.1 each) given this session's real footage
  // showed both a hard edge and real green fringe on loose hair; tune
  // further from the next real capture, not from these numbers alone.
  keyer.key({ color: 'auto', smoothness: 0.25, spill: 0.4 });
  return { keyer, canvas: keyedCanvas };
}

// Kept exported (still a no-op) for CaptureScreen.tsx's mount-effect call
// site — real GL setup happens lazily on first recolorBackground() call
// instead, since GLChromaKey's constructor requires an actual source
// element that isn't available yet at mount time.
export function preloadBackgroundRemoval(): void {
  // Intentionally empty.
}

/** Keys the booth's backdrop out of `source` (via gl-chromakey's `'auto'`
 * mode — see the module comment) and composites the result onto a solid
 * `targetHex` background — returns a new canvas. Async signature kept for
 * drop-in parity with backgroundSegmentation.ts's same-named export, even
 * though the actual GPU work inside gl-chromakey is synchronous. */
export async function recolorBackground(
  source: HTMLVideoElement | HTMLCanvasElement,
  targetHex: string,
): Promise<HTMLCanvasElement> {
  const width = 'videoWidth' in source ? source.videoWidth : source.width;
  const height = 'videoHeight' in source ? source.videoHeight : source.height;

  const { keyer: chroma, canvas: keyed } = getKeyer();
  keyed.width = width;
  keyed.height = height;
  chroma.source(source);
  chroma.render();

  // Temporary diagnostic (2026-09-15) — real corner/centre RGB, so the next
  // real test can ground any tolerance/smoothness/spill tuning in what the
  // camera actually captured instead of guessing from a screenshot again.
  // Remove once the real backdrop is installed and settings are confirmed
  // against it.
  if (import.meta.env.DEV) {
    const probe = document.createElement('canvas');
    probe.width = width;
    probe.height = height;
    const probeCtx = probe.getContext('2d');
    if (probeCtx) {
      probeCtx.drawImage(source, 0, 0, width, height);
      const data = probeCtx.getImageData(0, 0, width, height).data;
      const rgbAt = (x: number, y: number): [number, number, number] => {
        const idx = (Math.floor(y) * width + Math.floor(x)) * 4;
        return [data[idx], data[idx + 1], data[idx + 2]];
      };
      console.log('[chromaKey debug]', {
        target: targetHex,
        topLeft: toHex(rgbAt(2, 2)),
        topRight: toHex(rgbAt(width - 3, 2)),
        bottomLeft: toHex(rgbAt(2, height - 3)),
        bottomRight: toHex(rgbAt(width - 3, height - 3)),
        center: toHex(rgbAt(width / 2, height / 2)),
      });
    }
  }

  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  const ctx = result.getContext('2d');
  if (!ctx) return result;
  ctx.fillStyle = targetHex;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(keyed, 0, 0);
  return result;
}
