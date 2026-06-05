/**
 * src/processing/types.ts
 *
 * SHARED CONTRACT for the Pipeline workstream.
 *
 * This file is the single source-of-truth unification point that
 * src/storage/models.ts references with its "TODO: consolidate" comment.
 * It re-exports the canonical native-module types and provides the
 * storage-level extensions (crop, rotation) as a clean superset.
 *
 * Import hierarchy:
 *   modules/ai-image-processing (native contract)
 *     └── src/processing/types.ts   ← YOU ARE HERE
 *           └── src/storage/models.ts (ProcessParamsSnapshot)
 *
 * Additive changes only. Coordinate breaking changes with the orchestrator.
 */

// ---------------------------------------------------------------------------
// Imports — native-module contract + storage-layer types
// ---------------------------------------------------------------------------

import type {
  FilmMode,
  ProcessParams,
  ProcessResult,
  Histogram,
} from '../../modules/ai-image-processing/src/AiImageProcessing.types';
import type { CropRect, ProcessParamsSnapshot, ScannedImage } from '../storage/models';

// ---------------------------------------------------------------------------
// Re-export the native-module contract verbatim
// ---------------------------------------------------------------------------

export type { FilmMode, ProcessParams, ProcessResult, Histogram };

// ---------------------------------------------------------------------------
// Storage-layer extension: ProcessParams + TS-only fields
// ---------------------------------------------------------------------------

/**
 * FullProcessParams extends the native ProcessParams with fields that are
 * handled at the TypeScript layer only (crop rectangle, rotation). These
 * are NOT forwarded to the native processNegative call; they are applied
 * by expo-image-manipulator after the native pipeline completes.
 *
 * This is the type the Adjust screen works with at runtime.
 */
export interface FullProcessParams {
  // ----- Core native params (required, matching ProcessParams) -----

  /**
   * Exposure in EV. Range -2.0...+2.0.
   * 0 = no change. Maps to CIExposureAdjust on iOS.
   */
  exposure: number;

  /**
   * Warmth. Range -1.0 (cool/blue) ... +1.0 (warm/orange).
   * Maps to a colour temperature 4500K...8500K via CITemperatureAndTint.
   * 0 = neutral (6500K).
   */
  warmth: number;

  /**
   * Contrast. Range -1.0 (flat) ... +1.0 (punchy).
   * Maps to a 0.5...1.5 multiplier via CIColorControls.
   * 0 = no change.
   */
  contrast: number;

  /** Film mode: 'color' for C-41, 'bw' for B&W negatives. */
  mode: FilmMode;

  /**
   * When true (and mode === 'color'), runs the orange-mask estimation +
   * removal stage. Ignored for 'bw'.
   */
  removeOrangeMask: boolean;

  /**
   * Output sharpening amount. Range 0.0...1.0. Fed to CISharpenLuminance.
   * 0 disables sharpening.
   */
  sharpen: number;

  // ----- Optional fine adjustments (native, default 0) -----

  /** Saturation -1.0...+1.0. Maps to CIColorControls saturation. */
  saturation?: number;

  /** Highlights -1.0...+1.0. Maps to CIHighlightShadowAdjust. */
  highlights?: number;

  /** Shadows -1.0...+1.0. Maps to CIHighlightShadowAdjust. */
  shadows?: number;

  /** Vibrance -1.0...+1.0. Maps to CIVibrance. */
  vibrance?: number;

  // ----- Phase-3 AI hooks (forwarded to native, default false) -----

  /** AI colour-reconstruction flag (Pro). Currently no-op in native. */
  aiColor?: boolean;

  /** AI dust/scratch removal flag (Pro). Currently no-op in native. */
  aiDustRemoval?: boolean;

  /**
   * Optional maximum output dimension (longer edge, px). When set, the native
   * engine downscales the image before the heavy per-pixel passes — used by the
   * live-preview fast path for snappier slider response and lower memory.
   * Omitted / <= 0 means full resolution (used for the final commit).
   */
  maxDimension?: number;

  // ----- TS-layer-only fields (NOT forwarded to native pipeline) -----

  /**
   * Crop rectangle applied via expo-image-manipulator after native processing.
   * Coordinates are in output-image pixel space.
   */
  cropRect?: CropRect;

  /**
   * Clockwise rotation in degrees (0, 90, 180, 270) applied via
   * expo-image-manipulator after native processing.
   */
  rotationDegrees?: number;
}

// ---------------------------------------------------------------------------
// Helpers: coerce between FullProcessParams and the storage snapshot
// ---------------------------------------------------------------------------

/**
 * Extract the native-module slice from FullProcessParams.
 * Drops cropRect and rotationDegrees which are TS-layer only.
 */
export function toNativeParams(p: FullProcessParams): ProcessParams {
  return {
    exposure: p.exposure,
    warmth: p.warmth,
    contrast: p.contrast,
    mode: p.mode,
    removeOrangeMask: p.removeOrangeMask,
    sharpen: p.sharpen,
    saturation: p.saturation,
    highlights: p.highlights,
    shadows: p.shadows,
    vibrance: p.vibrance,
    aiColor: p.aiColor,
    aiDustRemoval: p.aiDustRemoval,
    maxDimension: p.maxDimension,
  };
}

/**
 * Convert a FullProcessParams to the storage ProcessParamsSnapshot shape.
 * aiColor and aiDustRemoval default to false (matching the snapshot contract).
 */
export function toSnapshot(p: FullProcessParams): ProcessParamsSnapshot {
  return {
    exposure: p.exposure,
    warmth: p.warmth,
    contrast: p.contrast,
    mode: p.mode,
    removeOrangeMask: p.removeOrangeMask,
    sharpen: p.sharpen,
    saturation: p.saturation,
    highlights: p.highlights,
    shadows: p.shadows,
    vibrance: p.vibrance,
    aiColor: p.aiColor ?? false,
    aiDustRemoval: p.aiDustRemoval ?? false,
    cropRect: p.cropRect,
    rotationDegrees: p.rotationDegrees,
  };
}

/**
 * Restore a FullProcessParams from a stored ProcessParamsSnapshot.
 * Safe to call with undefined (returns null); caller should fall back
 * to DEFAULT_FULL_PROCESS_PARAMS.
 */
export function fromSnapshot(
  snapshot: ProcessParamsSnapshot | undefined,
): FullProcessParams | null {
  if (!snapshot) return null;
  return {
    exposure: snapshot.exposure,
    warmth: snapshot.warmth,
    contrast: snapshot.contrast,
    mode: snapshot.mode,
    removeOrangeMask: snapshot.removeOrangeMask,
    sharpen: snapshot.sharpen,
    saturation: snapshot.saturation,
    highlights: snapshot.highlights,
    shadows: snapshot.shadows,
    vibrance: snapshot.vibrance,
    aiColor: snapshot.aiColor,
    aiDustRemoval: snapshot.aiDustRemoval,
    cropRect: snapshot.cropRect,
    rotationDegrees: snapshot.rotationDegrees,
  };
}

// ---------------------------------------------------------------------------
// Pipeline-level result type (superset of ProcessResult)
// ---------------------------------------------------------------------------

/**
 * What runPipeline resolves to: the fully-committed ScannedImage, plus the
 * native pipeline dimensions for the caller (e.g. for Skia canvas sizing).
 */
export interface PipelineResult {
  /** The persisted ScannedImage record (processedUri is now set). */
  image: ScannedImage;
  /** Output pixel width from the native processNegative call. */
  width: number;
  /** Output pixel height from the native processNegative call. */
  height: number;
}

/**
 * Structured pipeline error: wraps the underlying cause with a typed code
 * so the hook / UI can differentiate fatal errors from fallback notices.
 */
export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NATIVE_FAILED'
      | 'STORAGE_FAILED'
      | 'UNSUPPORTED_FORMAT'
      | 'FALLBACK_USED',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}
