/**
 * src/ai/types.ts
 *
 * Type contracts for the Phase-2 on-device AI scaffold.
 *
 * These types define the public API surface of `src/ai` and are the single
 * source of truth for the AI layer. They are intentionally decoupled from the
 * native module types in `modules/ai-image-processing` so the AI layer can
 * evolve independently (e.g. swapping heuristic placeholders for real models)
 * without touching the pipeline contract.
 *
 * INTEGRATION BOUNDARY:
 *   src/processing/pipeline.ts calls applyAIEnhancements (from src/ai/index.ts)
 *   using AIEnhancementOptions and receives an AIEnhancementResult.
 *   No other layer should import from src/ai directly.
 */

// ---------------------------------------------------------------------------
// AI operation identifiers
// ---------------------------------------------------------------------------

/**
 * The set of AI operations this module supports.
 *
 * - `colorReconstruction` — Reconstruct/enhance film colours that were lost to
 *   dye-fade, underexposure, or poor orange-mask removal. Corresponds to the
 *   `aiColor` Pro flag in FullProcessParams.
 *
 * - `dustRemoval` — Detect and inpaint dust specks and film scratches.
 *   Corresponds to the `aiDustRemoval` Pro flag in FullProcessParams.
 */
export type AIOperation = 'colorReconstruction' | 'dustRemoval';

// ---------------------------------------------------------------------------
// Options accepted by the public applyAIEnhancements entry point
// ---------------------------------------------------------------------------

/**
 * Feature flags that control which AI operations are applied.
 * Both default to false (no-op pass-through).
 */
export interface AIEnhancementOptions {
  /** Run AI colour reconstruction (Pro). Maps to FullProcessParams.aiColor. */
  aiColor?: boolean;
  /** Run AI dust/scratch removal (Pro). Maps to FullProcessParams.aiDustRemoval. */
  aiDustRemoval?: boolean;
}

// ---------------------------------------------------------------------------
// Result type returned by each AI step and the top-level entry point
// ---------------------------------------------------------------------------

/**
 * Result of a single AI operation or the combined applyAIEnhancements call.
 *
 * `uri` is always a `file://` URI pointing to the (possibly modified) image.
 * When an operation is a pass-through (model not loaded, flag off), the
 * original `uri` is returned unchanged — no extra copy is written.
 */
export interface AIEnhancementResult {
  /** file:// URI of the image after AI processing (or original if skipped). */
  uri: string;
  /**
   * Which operations were actually applied in this call. Empty array means
   * the image was returned as-is (all flags false or model unavailable).
   */
  appliedOps: AIOperation[];
}

// ---------------------------------------------------------------------------
// Model availability
// ---------------------------------------------------------------------------

/**
 * Describes the runtime availability of an on-device AI model.
 *
 * INTEGRATION BOUNDARY (for a future real model):
 *   `ModelAvailability` is the type returned by `modelManager.checkAvailability`.
 *   A real native hook (Core ML on iOS, TFLite on Android) would set
 *   `isAvailable: true` once the model file is loaded.
 */
export interface ModelAvailability {
  /** True when the model is loaded and ready to run inference. */
  isAvailable: boolean;
  /**
   * Human-readable reason when `isAvailable` is false.
   * Intended for developer logging, not end-user display.
   */
  unavailableReason?: string;
}

// ---------------------------------------------------------------------------
// Internal model descriptor (used by modelManager.ts only)
// ---------------------------------------------------------------------------

/**
 * Identifies which on-device model handles a given AI operation.
 *
 * TODO(model): extend this with a real model-file path or bundle identifier
 *   once actual Core ML / TFLite model files are bundled with the app.
 */
export interface ModelDescriptor {
  /** Stable identifier that matches the operation name. */
  id: AIOperation;
  /**
   * Display name for logging / crash reporting.
   * Example: "Color Reconstruction v1.0"
   */
  displayName: string;
  /**
   * Placeholder for the future model-file URI that the native hook will load.
   * Format will be platform-specific:
   *   iOS    → bundle-relative path to a .mlpackage / .mlmodelc file
   *   Android → assets-relative path to a .tflite file
   *
   * TODO(model): replace `null` with the real path when model files are added.
   */
  modelFilePath: string | null;
}
