# Native Module API — `modules/ai-image-processing`

> ⚠️ **Status: original design draft (aspirational) — NOT the shipped surface.**
> The **canonical, implemented** native contract is the code itself —
> [`modules/ai-image-processing/index.ts`](../modules/ai-image-processing/index.ts) —
> with iOS⇄Android behaviour documented in
> [`PARITY.md`](../modules/ai-image-processing/PARITY.md). The implemented API uses
> `FilmMode = 'color' | 'bw' | 'slide'` (not `FilmType`) and adds
> `estimateFilmBaseNeutral` (one-tap WB), `averageFrames` (multi-shot denoise), an
> `applyLut` seam, and a `maxDimension` preview option. Treat the richer signatures
> below as the design target, not current behaviour.

This document was the original **design contract** between the Pipeline agent (TypeScript orchestration in `src/processing/`) and the Native agent (Swift + Kotlin implementations in `modules/ai-image-processing/`). Function-signature or type changes are coordinated through the orchestrator as breaking changes.

The module's entry point is `modules/ai-image-processing/index.ts`. All types below are exported from that file or from `src/processing/types.ts` (see the shared-contract note in AGENTS.md).

---

## Design Principles

1. **File-URI passing**: heavy image data is never serialised through the JS bridge. Every pipeline function receives an input file URI and writes its result to a new file URI (in `expo-file-system`'s cache directory), which it returns. Callers are responsible for cleaning up intermediate files.

2. **Async everywhere**: all functions return `Promise`. The native side dispatches work to a background queue (Swift `DispatchQueue.global(qos: .userInitiated)` / Kotlin `Dispatchers.Default`) and resolves on the main/JS thread.

3. **Progress events**: long-running operations emit `ProcessingProgressEvent` through a native event emitter. The JS pipeline subscribes via `NativeEventEmitter`.

4. **No `any`**: all input and output types are explicitly typed. Strict TypeScript applies.

5. **Error shape**: all rejections throw `ProcessingError` (defined below).

---

## Core Types

```typescript
// ─── Input / Config types ────────────────────────────────────────────────────

/** 0.0 = infinity, 1.0 = closest macro distance */
export type LensPosition = number;

/** Film stock archetype — determines inversion and orange-mask behaviour */
export type FilmType = 'colorNegative' | 'blackAndWhite' | 'slide';

/** Export format identifier */
export type ExportFormat = 'jpeg' | 'heic' | 'png' | 'dng';

/** Export quality tier — maps to compression parameters */
export type ExportQuality = 'low' | 'medium' | 'high' | 'maximum';

/**
 * Four corner points for perspective correction, in normalised image coordinates
 * (0.0–1.0 relative to image dimensions, origin top-left).
 */
export interface PerspectiveQuad {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

/**
 * User-facing image adjustments, all sliders normalised to their natural range.
 * Default (no-op) value for every field is 0.0.
 */
export interface UserAdjustmentParams {
  /** Exposure compensation in EV stops. Range: -2.0 to +2.0 */
  exposure: number;
  /** Colour temperature shift. -1.0 = cool/blue (8500 K), +1.0 = warm/orange (4500 K) */
  warmth: number;
  /** Contrast boost or reduction. Range: -1.0 to +1.0 */
  contrast: number;
  /** Saturation boost or reduction. Range: -1.0 (desaturated) to +1.0 (vivid) */
  saturation: number;
  /** Highlight recovery or boost. Range: -1.0 (recover) to +1.0 (boost) */
  highlights: number;
  /** Shadow lift or crush. Range: -1.0 (crush) to +1.0 (lift) */
  shadows: number;
  /** Selective saturation (less effect on already-saturated colours). Range: -1.0 to +1.0 */
  vibrance: number;
}

// ─── Output / Result types ───────────────────────────────────────────────────

/**
 * The estimated orange mask for a colour negative.
 * Density values are normalised relative to the red channel (which is always 1.0).
 */
export interface OrangeMaskEstimate {
  redDensity: number;    // Always 1.0 (reference channel)
  greenDensity: number;  // Typically ~0.65 for Kodak-style C-41 film
  blueDensity: number;   // Typically ~0.40 for Kodak-style C-41 film
  /** Prominence of the orange cast; 0.0 = none, 1.0 = strong */
  strength: number;
}

/**
 * A per-channel histogram with 256 bins each.
 * Values are normalised pixel counts in [0.0, 1.0] (bin count / total pixels).
 */
export interface HistogramData {
  red: Float32Array;       // 256 elements
  green: Float32Array;     // 256 elements
  blue: Float32Array;      // 256 elements
  luminance: Float32Array; // 256 elements (ITU-R BT.601 luma)
}

/** Derived statistics computed from a HistogramData on the JS side */
export interface HistogramStats {
  shadowClippingPercent: number;    // % of pixels below the 2% threshold
  highlightClippingPercent: number; // % of pixels above the 98% threshold
  meanLuminance: number;            // 0.0–1.0
  medianLuminance: number;          // 0.0–1.0
  dynamicRange: number;             // whitePoint - blackPoint
}

/**
 * Detected film-frame boundary as corner points (normalised image coordinates).
 * confidence is in [0.0, 1.0]; below 0.5 treat as unreliable.
 */
export interface FrameDetectionResult {
  found: boolean;
  confidence: number;
  quad: PerspectiveQuad | null;
}

/** Progress event emitted during processImage */
export interface ProcessingProgressEvent {
  jobId: string;
  step: ProcessingStep;
  /** 0.0–1.0 */
  progress: number;
}

export type ProcessingStep =
  | 'crop'
  | 'linearize'
  | 'invert'
  | 'removeOrangeMask'
  | 'normalize'
  | 'autoTone'
  | 'adjust'
  | 'sharpenExport';

/** Thrown (rejected) by all module functions on failure */
export interface ProcessingError {
  code:
    | 'FILE_NOT_FOUND'
    | 'INVALID_IMAGE'
    | 'FILTER_UNAVAILABLE'
    | 'PROCESSING_FAILED'
    | 'NO_RAW_DATA'
    | 'UNSUPPORTED_FORMAT'
    | 'FRAME_NOT_DETECTED';
  message: string;
  /** The pipeline step at which failure occurred, if applicable */
  step?: ProcessingStep;
}

/** Calibration lock state returned from the native camera backend */
export interface CalibrationState {
  isFocusLocked: boolean;
  isExposureLocked: boolean;
  isWhiteBalanceLocked: boolean;
  lensPosition: LensPosition | null;
  iso: number | null;
  /** Shutter speed in seconds (e.g. 0.008 for 1/125 s) */
  shutterSpeedSeconds: number | null;
  /** Colour temperature in Kelvin */
  colourTemperatureK: number | null;
}
```

---

## Pipeline Functions

### `processImage`

The primary entry point. Runs the full 8-step pipeline sequentially on the native side. Emits `ProcessingProgressEvent` for each step transition.

```typescript
/**
 * Run the full negative-to-positive pipeline on a captured image.
 *
 * @param inputUri  - expo-file-system URI of the source image (JPEG, HEIC, or processed DNG)
 * @param jobId     - caller-supplied UUID used to correlate progress events
 * @param config    - pipeline configuration
 * @returns         - expo-file-system URI of the processed output image
 * @throws          - ProcessingError on any step failure
 */
export function processImage(
  inputUri: string,
  jobId: string,
  config: ProcessImageConfig,
): Promise<string>;

export interface ProcessImageConfig {
  filmType: FilmType;
  /** If provided, perspective-correct before processing */
  perspectiveQuad?: PerspectiveQuad;
  /** Crop rect in normalised coordinates; applied after perspective correction */
  cropRect?: { x: number; y: number; width: number; height: number };
  autoOrangeMask: boolean;
  autoColorCorrection: boolean;
  /** 0.0 = no sharpening, 1.0 = maximum */
  sharpenAmount: number;
  userAdjustments: UserAdjustmentParams;
  exportFormat: ExportFormat;
  exportQuality: ExportQuality;
  /** If true, composite watermark before export */
  applyWatermark: boolean;
}
```

### `applyUserAdjustments`

Re-runs only Step 7 on a previously fully-processed image. Used by the Adjust screen for real-time slider feedback. Skips the expensive steps 1–6.

```typescript
/**
 * Re-apply user adjustments to a base-processed image without re-running the
 * full pipeline. The baseUri should point to the output of steps 1–6
 * (after auto-tone, before user adjustments).
 *
 * @param baseUri    - expo-file-system URI of the tone-corrected image (steps 1–6 output)
 * @param params     - user adjustment parameters
 * @returns          - expo-file-system URI of the adjusted image
 */
export function applyUserAdjustments(
  baseUri: string,
  params: UserAdjustmentParams,
): Promise<string>;
```

### `computeHistogram`

Computes a 256-bin per-channel histogram for any image URI. Used by the Insights module and live histogram overlay.

```typescript
/**
 * Compute a 256-bin RGBA + luminance histogram for the given image.
 *
 * @param imageUri - expo-file-system URI or a camera frame buffer reference
 * @returns        - HistogramData with Float32Array for each channel
 */
export function computeHistogram(imageUri: string): Promise<HistogramData>;
```

### `detectFilmFrame`

Runs rectangle detection (Vision framework on iOS, ML Kit on Android) to locate a film frame within the image.

```typescript
/**
 * Attempt to detect a film-frame rectangle within the image.
 * Returns the best candidate quad in normalised image coordinates.
 *
 * @param imageUri  - expo-file-system URI of the full capture
 * @returns         - FrameDetectionResult
 */
export function detectFilmFrame(imageUri: string): Promise<FrameDetectionResult>;
```

---

## Camera Control Functions

These functions are called by `src/camera/CalibrationService.ts` and delegate to the camera session managed by react-native-vision-camera. They are thin wrappers that invoke AVCaptureDevice (iOS) or Camera2 CaptureRequest (Android) APIs.

```typescript
/**
 * Set manual focus to the given lens position and lock it.
 * @param lensPosition - 0.0 (infinity) to 1.0 (closest)
 */
export function setFocusLocked(lensPosition: LensPosition): Promise<void>;

/**
 * Set manual exposure (ISO + shutter speed) and lock it.
 * @param iso              - ISO sensitivity value within device-reported range
 * @param shutterSpeedSec  - Shutter speed in seconds (e.g. 0.004 for 1/250 s)
 */
export function setExposureLocked(
  iso: number,
  shutterSpeedSec: number,
): Promise<void>;

/**
 * Set white balance to the given colour temperature and lock it.
 * @param kelvin - Colour temperature in Kelvin (3000–8000 K)
 */
export function setWhiteBalanceLocked(kelvin: number): Promise<void>;

/** Release all camera locks and return to automatic modes */
export function unlockCalibration(): Promise<void>;

/** Return the current calibration state */
export function getCalibrationState(): Promise<CalibrationState>;

/**
 * Query device-reported camera capabilities.
 * Values needed for UI slider range clamping.
 */
export function getCameraCapabilities(): Promise<CameraCapabilities>;

export interface CameraCapabilities {
  minISO: number;
  maxISO: number;
  /** Minimum shutter speed in seconds */
  minShutterSpeedSec: number;
  /** Maximum shutter speed in seconds */
  maxShutterSpeedSec: number;
  supportsRawCapture: boolean;
  supportsManualFocus: boolean;
  supportsManualExposure: boolean;
  supportsManualWhiteBalance: boolean;
}
```

---

## Event Emitter

The module emits events via a `NativeEventEmitter`. Subscribe in `src/processing/pipeline.ts`:

```typescript
import { NativeEventEmitter, NativeModules } from 'react-native';

const emitter = new NativeEventEmitter(NativeModules.AiImageProcessing);

/**
 * Subscribe to processing progress events.
 * Unsubscribe when the component / store unmounts.
 */
const subscription = emitter.addListener(
  'onProcessingProgress',
  (event: ProcessingProgressEvent) => {
    // update useProcessingStore
  },
);
```

Event name: `'onProcessingProgress'`
Payload type: `ProcessingProgressEvent` (defined above)

---

## Pipeline Step Progress Mapping

Each step corresponds to a `ProcessingStep` value and an approximate progress range:

| Step | `ProcessingStep` value | Approx. progress range |
|---|---|---|
| 1. Crop / perspective | `'crop'` | 0.00 → 0.10 |
| 2. Linearise to linear RGB | `'linearize'` | 0.10 → 0.20 |
| 3. Invert negative | `'invert'` | 0.20 → 0.35 |
| 4. Remove orange mask | `'removeOrangeMask'` | 0.35 → 0.50 |
| 5. Normalise colour channels | `'normalize'` | 0.50 → 0.60 |
| 6. Auto tone curve | `'autoTone'` | 0.60 → 0.75 |
| 7. User adjustments | `'adjust'` | 0.75 → 0.85 |
| 8. Sharpen + export | `'sharpenExport'` | 0.85 → 1.00 |

---

## Module Entry Point Shape

`modules/ai-image-processing/index.ts` must export exactly:

```typescript
export {
  // Pipeline
  processImage,
  applyUserAdjustments,
  computeHistogram,
  detectFilmFrame,
  // Camera controls
  setFocusLocked,
  setExposureLocked,
  setWhiteBalanceLocked,
  unlockCalibration,
  getCalibrationState,
  getCameraCapabilities,
  // Types (re-exported for consumers)
  FilmType,
  ExportFormat,
  ExportQuality,
  ProcessingStep,
} from './src/NativeAiImageProcessing';

export type {
  LensPosition,
  PerspectiveQuad,
  UserAdjustmentParams,
  OrangeMaskEstimate,
  HistogramData,
  HistogramStats,
  FrameDetectionResult,
  ProcessingProgressEvent,
  ProcessingError,
  CalibrationState,
  CameraCapabilities,
  ProcessImageConfig,
};
```

The actual Turbo Module spec lives in `modules/ai-image-processing/src/NativeAiImageProcessing.ts` and is generated from the above using the Codegen spec format required by Expo SDK 56 / RN 0.85.

---

## Versioning and Breaking Change Policy

This API is at v1. The contract follows these rules:

- **Additive changes** (new optional fields in config objects, new functions, new event types): any agent may propose; add `?` to new fields for backwards compat; document in this file.
- **Breaking changes** (rename/remove a function, change a required parameter type, change a return type): require orchestrator approval; bump the module's internal version constant; coordinate with Pipeline agent.
- **Do not add `any`** to this file under any circumstance. If a value is genuinely variable, use a discriminated union.
