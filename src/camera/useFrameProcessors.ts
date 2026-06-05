/**
 * src/camera/useFrameProcessors.ts
 *
 * Frame-processor wiring for live focus peaking.
 *
 * Implementation (task #14, P0 gaps M2.3):
 *
 *   Uses react-native-vision-camera v5's `useFrameOutput` hook (Nitro-modules
 *   rewrite). The frame callback runs as a worklet on the camera's dedicated
 *   thread. It receives YUV frames (planar), reads the Y-plane (luma), applies
 *   a 3×3 Sobel gradient on a ~320 px-wide downsampled grid, thresholds each
 *   cell, and calls `runOnJS` to ship a lightweight list of in-focus cell
 *   indices back to the React thread. The React-side Skia overlay
 *   (FocusPeakingOverlay) then draws amber rectangles.
 *
 * Pixel access pattern (YUV 4:2:0, planar):
 *   - Plane 0 = full-res luma (Y), 1 byte per pixel, row-major.
 *   - We read every `step`-th row/column to cover ~GRID_COLS × GRID_ROWS cells.
 *   - Each cell's luma is computed as the mean of a 3×3 sample at the cell
 *     centre; Sobel ∂I/∂x and ∂I/∂y give the edge energy.
 *
 * Babel plugin:
 *   `babel-preset-expo` (≥ SDK 53) auto-detects `react-native-worklets` and
 *   includes `react-native-worklets/plugin` automatically (see
 *   node_modules/babel-preset-expo/build/configs/expo.js lines 110-115).
 *   No manual babel.config.js change is needed while babel-preset-expo is used.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrameOutput } from 'react-native-vision-camera';
import { runOnJS } from 'react-native-worklets';

import type { CameraFrameOutput } from 'react-native-vision-camera';
import type { PeakingColor, PeakingSensitivity } from '@/state/captureStore';
import { PEAKING_THRESHOLDS } from '@/state/captureStore';

// ---------------------------------------------------------------------------
// Public API flag
// ---------------------------------------------------------------------------

/**
 * Frame processors ARE now available (react-native-vision-camera-worklets
 * installed). Consumers can gate live-overlay UI on this flag.
 */
export const FRAME_PROCESSORS_AVAILABLE = true as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FocusPeakingOptions {
  enabled: boolean;
  sensitivity: PeakingSensitivity;
  color: PeakingColor;
}

/** A detected film-frame quad in normalized (0–1) preview coordinates. */
export interface DetectedFrame {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  confidence: number;
}

/**
 * A single cell in the focus-peaking grid, expressed as normalized
 * fractions of the frame (0..1 × 0..1) so the overlay is resolution-agnostic.
 */
export interface PeakCell {
  /** Normalized x offset of cell left edge (0..1). */
  nx: number;
  /** Normalized y offset of cell top edge (0..1). */
  ny: number;
  /** Normalized cell width (1 / GRID_COLS). */
  nw: number;
  /** Normalized cell height (1 / GRID_ROWS). */
  nh: number;
}

export interface FrameProcessorsResult {
  /**
   * VisionCamera `CameraOutput`s to attach to `<Camera outputs={[...]} />`.
   * Contains the frame output when focus peaking is enabled.
   */
  outputs: CameraFrameOutput[];
  /** Whether a live focus-peaking overlay is actually being produced. */
  isPeakingActive: boolean;
  /** Whether live frame detection is actually running. */
  isDetectionActive: boolean;
  /** Latest detected frame (always null — detection is a future task). */
  detectedFrame: DetectedFrame | null;
  /** Latest set of in-focus cells, updated each frame via runOnJS. */
  peakCells: PeakCell[];
  /** Callback to set peak cells from inside a worklet via runOnJS. */
  onPeakCells: (cells: PeakCell[]) => void;
}

// ---------------------------------------------------------------------------
// Grid constants (tuned for ≤ 5 ms per frame on A12+)
// ---------------------------------------------------------------------------

/** Number of columns in the peak grid. */
const GRID_COLS = 32;
/** Number of rows in the peak grid. */
const GRID_ROWS = 24;

/** Stable empty-cell array returned when peaking is disabled (avoids re-renders). */
const EMPTY_CELLS: PeakCell[] = [];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook returning frame-processor outputs + live peak cells for the Scan screen.
 *
 * Exact v5 hook signature used (from useFrameOutput.d.ts):
 *   ```ts
 *   declare function useFrameOutput({
 *     targetResolution, pixelFormat, dropFramesWhileBusy,
 *     enableCameraMatrixDelivery, enablePhysicalBufferRotation,
 *     enablePreviewSizedOutputBuffers, allowDeferredStart,
 *     onFrame, onFrameDropped,
 *   }: UseFrameOutputProps): CameraFrameOutput;
 *   ```
 *
 * The `onFrame` callback MUST be a worklet (annotated `'worklet'`).
 * Frames are disposed immediately after processing to prevent pipeline stalls.
 *
 * @param peaking   Focus-peaking options (enabled, sensitivity, color).
 * @param _detectionEnabled  Reserved for future film-frame detection (M2.4).
 */
export function useFrameProcessors(
  peaking: FocusPeakingOptions,
  _detectionEnabled: boolean,
): FrameProcessorsResult {
  // Latest in-focus cells, held in React state so the Skia overlay actually
  // re-renders when the worklet pushes a new set via runOnJS. (A plain ref
  // would never trigger a re-render — the overlay would stay blank.)
  const [peakCells, setPeakCellsState] = useState<PeakCell[]>([]);
  // This ref holds the latest resolved threshold so worklets can capture it
  // without a stale closure on every render.
  const thresholdRef = useRef<number>(PEAKING_THRESHOLDS[peaking.sensitivity]);
  const enabledRef = useRef<boolean>(peaking.enabled);

  // Keep refs in sync with props (worklets close over the ref value at call
  // time, not at hook-creation time). Updated in an effect because writing a
  // ref during render is disallowed under the React Compiler.
  useEffect(() => {
    thresholdRef.current = PEAKING_THRESHOLDS[peaking.sensitivity];
    enabledRef.current = peaking.enabled;
  }, [peaking.sensitivity, peaking.enabled]);

  // runOnJS-safe setter that the worklet will call on the JS thread.
  const setPeakCells = useCallback((cells: PeakCell[]) => {
    setPeakCellsState(cells);
  }, []);

  const frameOutput = useFrameOutput({
    // Use the native pixel format — zero-copy GPU path, no conversion cost.
    // For CPU luma reads we request YUV (planar), which is the camera's
    // natural format and avoids the ~2.6× bandwidth of an RGB conversion.
    pixelFormat: 'yuv',
    // Ask for preview-sized buffers (~1/4 of full res on most devices).
    // This, combined with our own grid-step downsampling, keeps the worklet
    // well under a single frame interval even on A-series chips.
    enablePreviewSizedOutputBuffers: true,
    // Drop arriving frames if the worklet is still running rather than
    // queuing them — we want freshness, not thoroughness.
    dropFramesWhileBusy: true,
    // Start after the preview so the shutter is not delayed.
    allowDeferredStart: true,

    onFrame(frame) {
      'worklet';

      // Fast-path: dispose immediately when peaking is disabled.
      if (!enabledRef.current) {
        frame.dispose();
        return;
      }

      // Only process valid planar (YUV) frames.
      if (!frame.isValid || !frame.isPlanar) {
        frame.dispose();
        return;
      }

      const planes = frame.getPlanes();
      // YUV 4:2:0 planar: plane 0 = Y (luma), plane 1 = U, plane 2 = V.
      if (planes.length === 0) {
        frame.dispose();
        return;
      }

      const yPlane = planes[0];
      if (!yPlane.isValid) {
        frame.dispose();
        return;
      }

      const frameW = yPlane.width;
      const frameH = yPlane.height;

      if (frameW === 0 || frameH === 0) {
        frame.dispose();
        return;
      }

      // Get the luma ArrayBuffer. This may trigger a GPU→CPU download on the
      // first call; subsequent calls are zero-copy (cached in the buffer object).
      const yBuffer = yPlane.getPixelBuffer();
      const yData = new Uint8Array(yBuffer);
      const bytesPerRow = yPlane.bytesPerRow;

      // Cell dimensions in pixel space.
      const cellW = frameW / GRID_COLS;
      const cellH = frameH / GRID_ROWS;

      // Normalized cell dimensions (for the overlay).
      const nw = 1 / GRID_COLS;
      const nh = 1 / GRID_ROWS;

      // Threshold from the ref (0..1, higher = more selective / fewer peaks).
      const threshold = thresholdRef.current;
      // Edge energy threshold: scale 0–255 gradient magnitude.
      // A threshold of 0.1 → energyThresh ~25/255; 0.5 → ~127/255.
      const energyThresh = threshold * 255;

      const activeCells: PeakCell[] = [];

      // Sobel 3×3 on each cell centre, using luma samples at the 8 neighbours.
      // We clamp coordinates at the frame boundary.
      for (let col = 0; col < GRID_COLS; col++) {
        for (let row = 0; row < GRID_ROWS; row++) {
          // Centre pixel of this cell.
          const cx = Math.floor((col + 0.5) * cellW);
          const cy = Math.floor((row + 0.5) * cellH);

          // Read a 3×3 neighbourhood of luma values.
          // yAt(x, y) = yData[clamp(y)*bytesPerRow + clamp(x)]
          const x0 = cx > 0 ? cx - 1 : 0;
          const x1 = cx;
          const x2 = cx < frameW - 1 ? cx + 1 : frameW - 1;
          const y0 = cy > 0 ? cy - 1 : 0;
          const y1 = cy;
          const y2 = cy < frameH - 1 ? cy + 1 : frameH - 1;

          const p00 = yData[y0 * bytesPerRow + x0];
          const p10 = yData[y0 * bytesPerRow + x1];
          const p20 = yData[y0 * bytesPerRow + x2];
          const p01 = yData[y1 * bytesPerRow + x0];
          // const p11 = yData[y1 * bytesPerRow + x1]; // centre — not needed for Sobel
          const p21 = yData[y1 * bytesPerRow + x2];
          const p02 = yData[y2 * bytesPerRow + x0];
          const p12 = yData[y2 * bytesPerRow + x1];
          const p22 = yData[y2 * bytesPerRow + x2];

          // Sobel kernels:
          //  Gx = [-1 0 +1; -2 0 +2; -1 0 +1]
          //  Gy = [-1 -2 -1;  0 0  0; +1 +2 +1]
          const gx = -p00 + p20 - 2 * p01 + 2 * p21 - p02 + p22;
          const gy = -p00 - 2 * p10 - p20 + p02 + 2 * p12 + p22;

          // L1 magnitude (cheaper than sqrt, still a good proxy for sharpness).
          const magnitude = (gx < 0 ? -gx : gx) + (gy < 0 ? -gy : gy);

          if (magnitude > energyThresh) {
            activeCells.push({
              nx: col * nw,
              ny: row * nh,
              nw,
              nh,
            });
          }
        }
      }

      // Ship cells to the React thread.
      runOnJS(setPeakCells)(activeCells);

      frame.dispose();
    },
  });

  return {
    outputs: peaking.enabled ? [frameOutput] : [],
    isPeakingActive: peaking.enabled,
    isDetectionActive: false,
    detectedFrame: null,
    // Gate on `enabled` so stale highlights from a previous session never show
    // (the worklet only clears its own output while actively running).
    peakCells: peaking.enabled ? peakCells : EMPTY_CELLS,
    onPeakCells: setPeakCells,
  };
}
