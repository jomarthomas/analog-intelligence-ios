/**
 * src/camera/useCaptureGuidance.ts
 *
 * Live capture guidance — a lightweight frame-processor that reads the preview's
 * luma plane, samples a coarse grid for mean brightness + shadow/highlight
 * clipping, and turns it into a one-line lighting hint shown while you line up a
 * scan (no sensors, no extra deps). Independent of focus peaking so it can't
 * regress it.
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

/** Sample grid — coarse enough to stay well under a frame interval. */
const COLS = 40;
const ROWS = 30;
/** JS-side debounce so the chip updates ~1.4×/s, not every frame. */
const UPDATE_INTERVAL_MS = 700;

/**
 * Returns a frame output to attach to `<Camera outputs={[...]}>` plus the latest
 * lighting hint. Pass `enabled = false` (e.g. while capturing or screen
 * unfocused) to skip all work.
 */
export function useCaptureGuidance(enabled: boolean): {
  output: CameraFrameOutput;
  hint: CaptureHint | null;
} {
  const [stats, setStats] = useState<ExposureStats | null>(null);
  const enabledRef = useRef(enabled);
  const lastUpdateRef = useRef(0);

  // Sync the worklet-captured ref outside render (React Compiler safe).
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const pushStats = useCallback((s: ExposureStats) => {
    const now = Date.now();
    if (now - lastUpdateRef.current < UPDATE_INTERVAL_MS) return;
    lastUpdateRef.current = now;
    setStats(s);
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
        }
      }
      frame.dispose();
      if (count === 0) return;

      runOnJS(pushStats)({
        mean: sum / count / 255,
        shadowClip: shadow / count,
        highlightClip: highlight / count,
      });
    },
  });

  // Gate on `enabled` so a stale reading never lingers after the camera idles.
  return { output, hint: enabled ? captureHint(stats) : null };
}
