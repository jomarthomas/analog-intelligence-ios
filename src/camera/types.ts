/**
 * src/camera/types.ts
 *
 * Shared camera-layer types for the Analog Intelligence scan flow.
 *
 * Ported from the legacy iOS app:
 *   - legacy-ios/CaptureMode.swift       → CaptureFormat + format metadata
 *   - legacy-ios/ManualControlsPanel.swift (WBPreset) → WhiteBalancePreset
 *   - legacy-ios/CalibrationManager.swift → CalibrationSnapshot / lock flags
 *
 * These are intentionally framework-agnostic (no react-native-vision-camera
 * imports) so the store, hooks and UI can share them without coupling.
 */

import type { WhiteBalanceGains } from 'react-native-vision-camera';

// ---------------------------------------------------------------------------
// Capture format (HEIC / JPEG / RAW-DNG)
// ---------------------------------------------------------------------------

/**
 * The still-image container the camera captures into.
 * Maps 1:1 onto VisionCamera's `TargetPhotoContainerFormat`
 * (excluding the `'native'` passthrough, which we resolve to HEIC/JPEG).
 *
 * Legacy parity: `CaptureMode` (.heic / .jpeg / .raw).
 */
export type CaptureFormat = 'heic' | 'jpeg' | 'dng';

export interface CaptureFormatInfo {
  readonly format: CaptureFormat;
  /** User-facing label (matches legacy `CaptureMode.displayName`). */
  readonly displayName: string;
  /** Lowercase file extension (matches legacy `CaptureMode.fileExtension`). */
  readonly fileExtension: string;
  /**
   * Whether this format requires explicit device capability checks.
   * HEIC/JPEG are always available; DNG (RAW) only where the device +
   * VisionCamera support it.
   */
  readonly requiresRawSupport: boolean;
}

export const CAPTURE_FORMATS: Record<CaptureFormat, CaptureFormatInfo> = {
  heic: {
    format: 'heic',
    displayName: 'HEIC',
    fileExtension: 'heic',
    requiresRawSupport: false,
  },
  jpeg: {
    format: 'jpeg',
    displayName: 'JPEG',
    fileExtension: 'jpg',
    requiresRawSupport: false,
  },
  dng: {
    format: 'dng',
    displayName: 'RAW (DNG)',
    fileExtension: 'dng',
    requiresRawSupport: true,
  },
};

/** Ordered list for cycling / pickers (matches legacy `CaptureMode.allCases`). */
export const CAPTURE_FORMAT_ORDER: readonly CaptureFormat[] = ['heic', 'jpeg', 'dng'];

// ---------------------------------------------------------------------------
// White-balance presets
// ---------------------------------------------------------------------------

/**
 * White-balance presets. Ported from legacy `WBPreset`
 * (legacy-ios/ManualControlsPanel.swift). `auto` resets WB to continuous
 * auto-white-balance; every other preset locks WB to a Kelvin temperature.
 */
export type WhiteBalancePreset =
  | 'auto'
  | 'daylight'
  | 'cloudy'
  | 'tungsten'
  | 'fluorescent'
  | 'flash';

export interface WhiteBalancePresetInfo {
  readonly preset: WhiteBalancePreset;
  /** Short label for the segmented picker (matches legacy raw values). */
  readonly label: string;
  /** Longer description shown under the picker. */
  readonly description: string;
  /**
   * Target colour temperature in Kelvin, or `null` for `auto`
   * (continuous auto-white-balance, no lock).
   */
  readonly temperature: number | null;
}

/**
 * Preset metadata. Kelvin values match the legacy Swift `WBPreset`:
 *   daylight ~5500K, cloudy ~6500K, tungsten ~3200K,
 *   fluorescent ~4000K, flash ~5500K.
 */
export const WHITE_BALANCE_PRESETS: Record<WhiteBalancePreset, WhiteBalancePresetInfo> = {
  auto: {
    preset: 'auto',
    label: 'Auto',
    description: 'Automatic white balance',
    temperature: null,
  },
  daylight: {
    preset: 'daylight',
    label: 'Day',
    description: '~5500K (sunny daylight)',
    temperature: 5500,
  },
  cloudy: {
    preset: 'cloudy',
    label: 'Cloudy',
    description: '~6500K (overcast sky)',
    temperature: 6500,
  },
  tungsten: {
    preset: 'tungsten',
    label: 'Tungsten',
    description: '~3200K (incandescent bulbs)',
    temperature: 3200,
  },
  fluorescent: {
    preset: 'fluorescent',
    label: 'Fluor',
    description: '~4000K (office lighting)',
    temperature: 4000,
  },
  flash: {
    preset: 'flash',
    label: 'Flash',
    description: '~5500K (camera flash)',
    temperature: 5500,
  },
};

export const WHITE_BALANCE_PRESET_ORDER: readonly WhiteBalancePreset[] = [
  'auto',
  'daylight',
  'cloudy',
  'tungsten',
  'fluorescent',
  'flash',
];

/**
 * Approximate Kelvin → {@link WhiteBalanceGains} conversion.
 *
 * Ported verbatim from the legacy Swift `WBPreset.gains` simplified model
 * (legacy-ios/ManualControlsPanel.swift). On iOS the camera controller's
 * `convertWhiteBalanceTemperatureAndTintValues()` is preferred when available
 * (it is far more accurate); this pure function is the cross-platform fallback
 * and the value used on Android, where that converter does not exist.
 *
 * Gains are NOT yet clamped to the device's `maxWhiteBalanceGain` — the caller
 * must clamp against the live device before locking.
 */
export function gainsForTemperature(temperature: number): WhiteBalanceGains {
  const normalizedTemp = (temperature - 3000) / (8000 - 3000);
  const greenGain = 1.0; // green is the reference channel

  let redGain: number;
  let blueGain: number;

  if (temperature < 5500) {
    // Warm light (more red, less blue)
    redGain = 1.0 + (1.0 - normalizedTemp) * 0.5;
    blueGain = 0.8 + normalizedTemp * 0.4;
  } else {
    // Cool light (less red, more blue)
    redGain = 1.0 - (normalizedTemp - 0.5) * 0.3;
    blueGain = 1.0 + (normalizedTemp - 0.5) * 0.6;
  }

  // Clamp to reasonable limits (legacy used [1.0, 4.0]).
  redGain = Math.min(Math.max(redGain, 1.0), 4.0);
  blueGain = Math.min(Math.max(blueGain, 1.0), 4.0);

  return { redGain, greenGain, blueGain };
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

/**
 * Which 3A subsystems are currently locked for consistent batch scanning.
 * Ported from legacy `CalibrationManager` `isFocusLocked` / `isExposureLocked`
 * / `isWhiteBalanceLocked` flags.
 */
export interface CalibrationLocks {
  focus: boolean;
  exposure: boolean;
  whiteBalance: boolean;
}

/**
 * A snapshot of live camera values, surfaced for the manual-controls UI.
 * Mirrors legacy `CalibrationManager.currentISO/…` published properties.
 */
export interface CalibrationSnapshot {
  /** Lens focus position, 0.0 (closest) … 1.0 (furthest). */
  lensPosition: number;
  iso: number;
  /** Exposure duration in seconds. */
  exposureDuration: number;
  whiteBalanceGains: WhiteBalanceGains | null;
}

/**
 * Device capability flags, queried from the live VisionCamera `CameraDevice` /
 * `CameraController`. Manual controls gate themselves on these so we never call
 * an unsupported API (legacy guarded via `isFocusModeSupported(.locked)` etc).
 */
export interface CameraCapabilities {
  supportsFocusLocking: boolean;
  supportsExposureLocking: boolean;
  supportsWhiteBalanceLocking: boolean;
  supportsRawCapture: boolean;
  hasTorch: boolean;
  hasFlash: boolean;
  minISO: number;
  maxISO: number;
  /** Min exposure duration in seconds. */
  minExposureDuration: number;
  /** Max exposure duration in seconds. */
  maxExposureDuration: number;
  maxWhiteBalanceGain: number;
}

/** Sensible defaults before a device is bound. */
export const DEFAULT_CAPABILITIES: CameraCapabilities = {
  supportsFocusLocking: false,
  supportsExposureLocking: false,
  supportsWhiteBalanceLocking: false,
  supportsRawCapture: false,
  hasTorch: false,
  hasFlash: false,
  minISO: 0,
  maxISO: 0,
  minExposureDuration: 0,
  maxExposureDuration: 0,
  maxWhiteBalanceGain: 0,
};

// ---------------------------------------------------------------------------
// Capture result
// ---------------------------------------------------------------------------

/**
 * The result handed to `CameraScanView`'s `onCaptured` callback.
 * `uri` is a `file://` URL pointing at the original, unprocessed capture in the
 * app cache — the Pipeline / Storage layers take ownership from here.
 */
export interface CaptureResult {
  /** `file://` URL of the original capture. */
  uri: string;
  format: CaptureFormat;
  width: number;
  height: number;
  isRaw: boolean;
}
