/**
 * src/state/captureStore.ts
 *
 * Zustand store for the camera / scan capture flow. Distinct from
 * `galleryStore` (which owns persisted ScannedImages) — this store holds only
 * transient, in-session camera UI state:
 *
 *   • capture format selection (HEIC / JPEG / DNG)
 *   • torch + flash modes
 *   • manual-control values (focus / ISO / shutter / white balance)
 *   • calibration lock flags (focus / exposure / white balance)
 *   • live device capabilities + a snapshot of current 3A values
 *   • focus-peaking + frame-alignment overlay toggles
 *
 * It is a pure state container: the actual VisionCamera calls live in
 * `CameraScanView` / `ManualControlsPanel`, which read from and write to this
 * store. This mirrors the legacy split between `CameraManager` /
 * `CalibrationManager` (logic) and the SwiftUI views (presentation), but with
 * Combine `@Published` replaced by zustand selectors.
 *
 * Owned by the Camera workstream (task #5). NEW file — see DECISIONS.md: camera
 * control state belongs to the Camera layer, not modules/ai-image-processing.
 */

import { create } from 'zustand';

import {
  DEFAULT_CAPABILITIES,
  type CalibrationLocks,
  type CalibrationSnapshot,
  type CameraCapabilities,
  type CaptureFormat,
  type WhiteBalancePreset,
} from '@/camera/types';

// ---------------------------------------------------------------------------
// Focus-peaking config (ported from FocusPeakingProcessor presets)
// ---------------------------------------------------------------------------

/** Focus-peaking sensitivity. Maps to a threshold (legacy `Sensitivity`). */
export type PeakingSensitivity = 'low' | 'medium' | 'high';

/** Overlay colour for focus peaking (legacy `FocusPeakingProcessor.Color`). */
export type PeakingColor = 'red' | 'green' | 'blue' | 'yellow' | 'white';

/** Legacy `Sensitivity.threshold` mapping (0–1, higher = fewer/sharper edges). */
export const PEAKING_THRESHOLDS: Record<PeakingSensitivity, number> = {
  low: 0.5,
  medium: 0.3,
  high: 0.1,
};

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface CaptureState {
  // --- Capture configuration ---
  captureFormat: CaptureFormat;
  /** Continuous-light torch during preview (legacy `TorchMode`). */
  torchEnabled: boolean;
  /** Flash for the actual photo capture (legacy `FlashMode`). */
  flashMode: 'off' | 'on' | 'auto';

  // --- Device capabilities (refreshed when a controller binds) ---
  capabilities: CameraCapabilities;

  // --- Live 3A snapshot (refreshed from the controller) ---
  snapshot: CalibrationSnapshot;

  // --- Calibration locks ---
  locks: CalibrationLocks;
  /** True when focus + exposure + white balance are all locked. */
  isCalibrated: boolean;

  // --- Manual control selections (UI-facing, may differ from snapshot) ---
  /** White-balance preset selected in the manual panel. */
  whiteBalancePreset: WhiteBalancePreset;

  // --- Overlays ---
  showFrameGuide: boolean;
  focusPeakingEnabled: boolean;
  peakingSensitivity: PeakingSensitivity;
  peakingColor: PeakingColor;

  // --- Transient capture status ---
  isCapturing: boolean;

  // --- Actions ---
  setCaptureFormat: (format: CaptureFormat) => void;
  cycleFlashMode: () => void;
  setTorchEnabled: (enabled: boolean) => void;
  toggleTorch: () => void;

  setCapabilities: (capabilities: CameraCapabilities) => void;
  setSnapshot: (snapshot: Partial<CalibrationSnapshot>) => void;

  setLocks: (locks: Partial<CalibrationLocks>) => void;
  /** Sets all three locks to `locked` and recomputes `isCalibrated`. */
  setAllLocks: (locked: boolean) => void;

  setWhiteBalancePreset: (preset: WhiteBalancePreset) => void;

  toggleFrameGuide: () => void;
  setShowFrameGuide: (show: boolean) => void;
  toggleFocusPeaking: () => void;
  setPeakingSensitivity: (sensitivity: PeakingSensitivity) => void;
  setPeakingColor: (color: PeakingColor) => void;

  setIsCapturing: (capturing: boolean) => void;

  /** Reset transient state (e.g. when leaving the scan screen). */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FLASH_CYCLE: readonly CaptureState['flashMode'][] = ['off', 'on', 'auto'];

function computeCalibrated(locks: CalibrationLocks): boolean {
  return locks.focus && locks.exposure && locks.whiteBalance;
}

const INITIAL_SNAPSHOT: CalibrationSnapshot = {
  lensPosition: 0,
  iso: 0,
  exposureDuration: 0,
  whiteBalanceGains: null,
};

const INITIAL_LOCKS: CalibrationLocks = {
  focus: false,
  exposure: false,
  whiteBalance: false,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCaptureStore = create<CaptureState>((set, get) => ({
  captureFormat: 'heic',
  torchEnabled: false,
  flashMode: 'off',

  capabilities: DEFAULT_CAPABILITIES,
  snapshot: INITIAL_SNAPSHOT,

  locks: INITIAL_LOCKS,
  isCalibrated: false,

  whiteBalancePreset: 'auto',

  showFrameGuide: true,
  focusPeakingEnabled: false,
  peakingSensitivity: 'medium',
  peakingColor: 'red',

  isCapturing: false,

  // -----------------------------------------------------------------------
  setCaptureFormat: (format) => set({ captureFormat: format }),

  cycleFlashMode: () => {
    const current = get().flashMode;
    const idx = FLASH_CYCLE.indexOf(current);
    const next = FLASH_CYCLE[(idx + 1) % FLASH_CYCLE.length];
    set({ flashMode: next });
  },

  setTorchEnabled: (enabled) => set({ torchEnabled: enabled }),
  toggleTorch: () => set((s) => ({ torchEnabled: !s.torchEnabled })),

  setCapabilities: (capabilities) => {
    // If the bound device cannot capture RAW, downgrade a stale DNG selection.
    const { captureFormat } = get();
    const patch: Partial<CaptureState> = { capabilities };
    if (captureFormat === 'dng' && !capabilities.supportsRawCapture) {
      patch.captureFormat = 'heic';
    }
    set(patch);
  },

  setSnapshot: (snapshot) =>
    set((s) => ({ snapshot: { ...s.snapshot, ...snapshot } })),

  setLocks: (locks) =>
    set((s) => {
      const merged = { ...s.locks, ...locks };
      return { locks: merged, isCalibrated: computeCalibrated(merged) };
    }),

  setAllLocks: (locked) => {
    const merged: CalibrationLocks = {
      focus: locked,
      exposure: locked,
      whiteBalance: locked,
    };
    set({ locks: merged, isCalibrated: computeCalibrated(merged) });
  },

  setWhiteBalancePreset: (preset) => set({ whiteBalancePreset: preset }),

  toggleFrameGuide: () => set((s) => ({ showFrameGuide: !s.showFrameGuide })),
  setShowFrameGuide: (show) => set({ showFrameGuide: show }),
  toggleFocusPeaking: () =>
    set((s) => ({ focusPeakingEnabled: !s.focusPeakingEnabled })),
  setPeakingSensitivity: (sensitivity) =>
    set({ peakingSensitivity: sensitivity }),
  setPeakingColor: (color) => set({ peakingColor: color }),

  setIsCapturing: (capturing) => set({ isCapturing: capturing }),

  reset: () =>
    set({
      torchEnabled: false,
      flashMode: 'off',
      snapshot: INITIAL_SNAPSHOT,
      locks: INITIAL_LOCKS,
      isCalibrated: false,
      whiteBalancePreset: 'auto',
      isCapturing: false,
    }),
}));
