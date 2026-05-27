/**
 * src/camera/useFrameProcessors.ts
 *
 * Frame-processor wiring for focus peaking + automatic film-frame detection.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │  STATUS: STUBBED (non-blocking).                                        │
 * │                                                                         │
 * │  VisionCamera v5's frame-processor API (`useFrameOutput`) requires the  │
 * │  `react-native-vision-camera-worklets` package PLUS                     │
 * │  `react-native-worklets` and the worklets Babel plugin to be wired up.  │
 * │  As of this workstream:                                                 │
 * │    • `react-native-worklets@0.8.3`            ✅ installed               │
 * │    • `react-native-vision-camera-worklets`    ❌ NOT installed          │
 * │    • `react-native-worklets/plugin` in babel  ❌ NOT configured         │
 * │                                                                         │
 * │  Per task #5: "if that isn't set up, implement focus-peaking +          │
 * │  frame-detection as clearly-marked non-blocking TODO stubs rather than  │
 * │  breaking the build — capture MUST work regardless."                    │
 * │                                                                         │
 * │  So this module returns `undefined` (no frame output is attached to the │
 * │  Camera), and the Scan UI falls back to:                                │
 * │    • focus peaking → a static "manual focus" affordance (no live edges) │
 * │    • frame detection → the manual FrameAlignmentOverlay guide rectangle │
 * │                                                                         │
 * │  Capture, manual controls, and calibration lock are all fully           │
 * │  functional without frame processors.                                   │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * ── TO ENABLE (orchestrator follow-up, P0 gaps M2.3 / M2.4) ──────────────
 *   1. `npx expo install react-native-vision-camera-worklets`
 *   2. Add the worklets plugin to babel.config.js:
 *        plugins: ['react-native-worklets/plugin']
 *      (must be the LAST plugin in the list).
 *   3. Replace `buildFocusPeakingFrameOutput` / `buildFrameDetectionFrameOutput`
 *      below with real `useFrameOutput({ onFrame(frame){ 'worklet'; … } })`
 *      calls — Sobel luma edge detection for peaking (ported from
 *      legacy-ios/FocusPeakingProcessor.swift), and the native
 *      `detectFilmFrame` bridge for frame detection (legacy-ios/Vision/
 *      FrameDetector.swift → modules/ai-image-processing detectFilmFrame).
 *   4. Composite peaking results onto a Skia overlay (@shopify/react-native-skia
 *      is already installed) and write detection corners into captureStore.
 */

import type { CameraOutput } from 'react-native-vision-camera';
import type { PeakingColor, PeakingSensitivity } from '@/state/captureStore';

/**
 * Compile-time flag describing whether the worklets toolchain is available.
 * Kept as a const (not a runtime require) so bundlers don't try to resolve the
 * missing `react-native-vision-camera-worklets` module and break the build.
 *
 * Flip to `true` only after completing the "TO ENABLE" steps above and wiring
 * the real frame outputs.
 */
export const FRAME_PROCESSORS_AVAILABLE = false as const;

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

export interface FrameProcessorsResult {
  /**
   * VisionCamera `CameraOutput`s to attach to `<Camera outputs={[...]} />`.
   * Empty while stubbed — no frame output is created, so the camera pipeline
   * runs at full photo-capture performance with zero worklet overhead.
   */
  outputs: CameraOutput[];
  /** Whether a live focus-peaking overlay is actually being produced. */
  isPeakingActive: boolean;
  /** Whether live frame detection is actually running. */
  isDetectionActive: boolean;
  /** Latest detected frame, or `null` (always `null` while stubbed). */
  detectedFrame: DetectedFrame | null;
}

/**
 * Hook returning frame-processor outputs + live results for the Scan screen.
 *
 * While {@link FRAME_PROCESSORS_AVAILABLE} is `false`, this is a no-op that
 * returns empty outputs and inactive flags. The signature is intentionally the
 * shape the real implementation will use, so swapping in worklets later is a
 * drop-in change for `CameraScanView`.
 *
 * NOTE: not prefixed with `use` arguments that would violate hook rules — it is
 * a hook (stable across renders) and currently allocates nothing per render.
 */
export function useFrameProcessors(
  _peaking: FocusPeakingOptions,
  _detectionEnabled: boolean,
): FrameProcessorsResult {
  // STUB: no frame output attached. See module banner for the enable path.
  return {
    outputs: [],
    isPeakingActive: false,
    isDetectionActive: false,
    detectedFrame: null,
  };
}
