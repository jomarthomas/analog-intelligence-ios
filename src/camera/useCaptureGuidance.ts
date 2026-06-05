/**
 * src/camera/useCaptureGuidance.ts
 *
 * Live capture guidance — a lightweight frame-processor that reads the preview's
 * luma plane, samples a coarse grid, and turns it into:
 *   1. a one-line LIGHTING hint (blown-out / too-dark / uneven backlight), and
 *   2. a FILM-FRAMING state for the dimmed alignment guide ("✓ film detected /
 *      move closer / fill the frame"), derived from the bounding box of the
 *      bright back-lit region on the SAME grid scan — no extra cost, no extra
 *      camera output.
 *
 * IMPORTANT (camera-session invariant): this hook intentionally exposes a
 * SINGLE `output`. The scan camera must never attach two simultaneous frame
 * outputs (it breaks session configuration), so all live preview analysis the
 * scan screen needs is funnelled through this one worklet.
 *
 * Perf: YUV preview-sized buffers + `dropFramesWhileBusy` + a ~40×30 sample
 * (~1200 reads) keep the worklet cheap; updates are debounced on the JS side to
 * ~1.4 Hz so the chip doesn't flicker and React isn't spammed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useFrameOutput, type CameraFrameOutput } from 'react-native-vision-camera';
import { runOnJS } from 'react-native-worklets';

/** Coarse exposure summary of the live preview (luma in 0..1, clip = fraction). */
export interface ExposureStats {
  mean: number;
  shadowClip: number;
  highlightClip: number;
}

export interface CaptureHint {
  tone: 'good' | 'warn';
  message: string;
}

/**
 * Coverage summary of the bright (back-lit film) region within the frame, in
 * normalized 0..1 coordinates (origin top-left). Produced by the same worklet
 * scan that drives the exposure stats. All fields default sensibly when no
 * bright region is detected (`coverage === 0`).
 */
export interface FrameCoverage {
  /** Fraction of sampled cells that are "bright" (the back-lit film + light). */
  coverage: number;
  /** Bounding box of the bright region, normalized 0..1 (origin top-left). */
  bounds: { x: number; y: number; width: number; height: number };
  /** Centre of the bright region, normalized 0..1. */
  center: { x: number; y: number };
}

/** Discrete framing state for the dimmed alignment guide. */
export type FrameGuideState =
  /** No clear back-lit region yet — keep looking. */
  | 'searching'
  /** Film found but small — user should move the phone closer. */
  | 'tooSmall'
  /** Film found but off to one side — nudge it into the centre lane. */
  | 'offCenter'
  /** Film fills and is centred in the guide — good to shoot. */
  | 'aligned';

export interface FrameGuidance {
  state: FrameGuideState;
  /** Short, friendly instruction matching `state`. */
  message: string;
  /** True when `state === 'aligned'` (convenience for styling the guide). */
  ready: boolean;
}

/**
 * Map an exposure summary to a single actionable lighting hint, or null while
 * warming up. Pure + deterministic. Tuned for backlit film: the loud failure
 * modes are a blown-out light source and an under-powered one.
 */
export function captureHint(s: ExposureStats | null): CaptureHint | null {
  if (s == null) return null;
  if (s.highlightClip > 0.1) {
    return { tone: 'warn', message: 'Light source is blown out — dim it or diffuse it' };
  }
  if (s.mean < 0.17) {
    return { tone: 'warn', message: 'Too dark — use a brighter, even backlight' };
  }
  if (s.mean > 0.85) {
    return { tone: 'warn', message: 'Overexposed — lower the backlight brightness' };
  }
  if (s.shadowClip > 0.14 && s.mean < 0.4) {
    return { tone: 'warn', message: 'Uneven light — spread it evenly behind the frame' };
  }
  return { tone: 'good', message: 'Lighting looks good' };
}

// --- Film-framing thresholds (normalized; tuned for the centre-lane guide) ---

/** Below this bright-coverage we assume there is no film in view yet. */
const COVERAGE_SEARCHING = 0.06;
/** A back-lit frame should fill at least this much of the view to shoot. */
const COVERAGE_FILL = 0.32;
/** Bright region centre must be within this distance of frame centre (each axis). */
const CENTER_TOLERANCE = 0.18;

/**
 * Map a bright-region coverage summary to a discrete framing state + message
 * for the dimmed alignment guide. Pure + deterministic so it's unit-testable
 * and free of camera coupling.
 *
 * The order matters: "is there film at all?" → "is it big enough?" →
 * "is it centred?" → otherwise it's aligned.
 */
export function frameGuidance(c: FrameCoverage | null): FrameGuidance {
  if (c == null || c.coverage < COVERAGE_SEARCHING) {
    return {
      state: 'searching',
      message: 'Place the negative in the frame',
      ready: false,
    };
  }
  if (c.coverage < COVERAGE_FILL) {
    return { state: 'tooSmall', message: 'Move closer — fill the frame', ready: false };
  }
  const dx = Math.abs(c.center.x - 0.5);
  const dy = Math.abs(c.center.y - 0.5);
  if (dx > CENTER_TOLERANCE || dy > CENTER_TOLERANCE) {
    return { state: 'offCenter', message: 'Centre the negative', ready: false };
  }
  return { state: 'aligned', message: '✓ Film detected', ready: true };
}

/** Sample grid — coarse enough to stay well under a frame interval. */
const COLS = 40;
const ROWS = 30;
/**
 * Luma (0–255) above which a cell counts as part of the bright back-lit film /
 * light source. Back-lit negatives are far brighter than the surrounding room,
 * so a high cut cleanly separates the lit frame from the scene behind it.
 */
const BRIGHT_CUT = 150;
/** JS-side debounce so the chip updates ~1.4×/s, not every frame. */
const UPDATE_INTERVAL_MS = 700;

/** What the worklet ships back to JS each (debounced) tick. */
interface GuidanceSample {
  stats: ExposureStats;
  coverage: FrameCoverage;
}

/**
 * Returns a frame output to attach to `<Camera outputs={[...]}>` plus the latest
 * lighting hint AND film-framing guidance. Pass `enabled = false` (e.g. while
 * capturing or screen unfocused) to skip all work.
 */
export function useCaptureGuidance(enabled: boolean): {
  output: CameraFrameOutput;
  hint: CaptureHint | null;
  coverage: FrameCoverage | null;
  guidance: FrameGuidance;
} {
  const [sample, setSample] = useState<GuidanceSample | null>(null);
  const enabledRef = useRef(enabled);
  const lastUpdateRef = useRef(0);

  // Sync the worklet-captured ref outside render (React Compiler safe).
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const pushSample = useCallback((s: GuidanceSample) => {
    const now = Date.now();
    if (now - lastUpdateRef.current < UPDATE_INTERVAL_MS) return;
    lastUpdateRef.current = now;
    setSample(s);
  }, []);

  const output = useFrameOutput({
    pixelFormat: 'yuv',
    enablePreviewSizedOutputBuffers: true,
    dropFramesWhileBusy: true,
    allowDeferredStart: true,

    onFrame(frame) {
      'worklet';

      if (!enabledRef.current || !frame.isValid || !frame.isPlanar) {
        frame.dispose();
        return;
      }
      const planes = frame.getPlanes();
      if (planes.length === 0) {
        frame.dispose();
        return;
      }
      const y = planes[0];
      if (!y.isValid || y.width === 0 || y.height === 0) {
        frame.dispose();
        return;
      }

      const data = new Uint8Array(y.getPixelBuffer());
      const bytesPerRow = y.bytesPerRow;
      const w = y.width;
      const h = y.height;

      let sum = 0;
      let count = 0;
      let shadow = 0;
      let highlight = 0;

      // Bright-region accumulators (for the film-framing bounding box).
      let bright = 0;
      let minCol = COLS;
      let maxCol = -1;
      let minRow = ROWS;
      let maxRow = -1;
      let sumCol = 0;
      let sumRow = 0;

      for (let r = 0; r < ROWS; r += 1) {
        const yy = Math.floor((r + 0.5) * (h / ROWS));
        const rowOffset = yy * bytesPerRow;
        for (let c = 0; c < COLS; c += 1) {
          const xx = Math.floor((c + 0.5) * (w / COLS));
          const v = data[rowOffset + xx];
          sum += v;
          count += 1;
          if (v < 10) shadow += 1;
          if (v > 245) highlight += 1;
          if (v >= BRIGHT_CUT) {
            bright += 1;
            if (c < minCol) minCol = c;
            if (c > maxCol) maxCol = c;
            if (r < minRow) minRow = r;
            if (r > maxRow) maxRow = r;
            sumCol += c;
            sumRow += r;
          }
        }
      }
      frame.dispose();
      if (count === 0) return;

      // Normalize the bright bounding box to 0..1 (cell index → fraction). When
      // no bright cells were found we report an empty box centred at the middle.
      const hasBright = bright > 0 && maxCol >= 0 && maxRow >= 0;
      const bx = hasBright ? minCol / COLS : 0.5;
      const by = hasBright ? minRow / ROWS : 0.5;
      const bw = hasBright ? (maxCol - minCol + 1) / COLS : 0;
      const bh = hasBright ? (maxRow - minRow + 1) / ROWS : 0;
      const cx = hasBright ? sumCol / bright / COLS : 0.5;
      const cy = hasBright ? sumRow / bright / ROWS : 0.5;

      runOnJS(pushSample)({
        stats: {
          mean: sum / count / 255,
          shadowClip: shadow / count,
          highlightClip: highlight / count,
        },
        coverage: {
          coverage: bright / count,
          bounds: { x: bx, y: by, width: bw, height: bh },
          center: { x: cx, y: cy },
        },
      });
    },
  });

  // Gate on `enabled` so stale readings never linger after the camera idles.
  const stats = enabled ? (sample?.stats ?? null) : null;
  const coverage = enabled ? (sample?.coverage ?? null) : null;
  return {
    output,
    hint: captureHint(stats),
    coverage,
    guidance: frameGuidance(coverage),
  };
}
