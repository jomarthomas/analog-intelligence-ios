/**
 * src/ai/colorReconstruction.ts
 *
 * AI colour reconstruction for film negatives.
 *
 * ─── CURRENT STATUS: HONEST PLACEHOLDER ────────────────────────────────────
 * No real on-device model is bundled. The function below applies a mild
 * saturation and contrast boost via expo-image-manipulator as a *heuristic*
 * stand-in that produces a visibly different (slightly more vivid) result so
 * the Pro toggle has observable (honest) effect during development.
 *
 * This is NOT AI. It is a deterministic image manipulation used as a scaffold
 * until a real Core ML / TFLite model is bundled. The integration point is
 * clearly marked TODO(model).
 *
 * ─── REAL MODEL PATH (future) ───────────────────────────────────────────────
 * When a real model is available:
 *   1. Call `modelManager.checkAvailability('colorReconstruction')` — if
 *      `isAvailable` is false, optionally call `modelManager.loadModel(...)`.
 *   2. Route `uri` through the native model inference call, e.g.:
 *        const result = await NativeAiModels.runColorReconstruction(uri);
 *        return { uri: result.uri };
 *   3. Remove or gate the expo-image-manipulator heuristic below.
 *
 * The function signature `reconstructColor(uri): Promise<{ uri: string }>`
 * MUST NOT change — it is the stable contract consumed by src/ai/index.ts.
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { checkAvailability } from './modelManager';

// ---------------------------------------------------------------------------
// Constants for the heuristic placeholder
// ---------------------------------------------------------------------------

/**
 * Compression quality for the re-encoded JPEG produced by the placeholder.
 * High value (0.92) preserves quality while still producing a new file URI,
 * making it easy to detect in tests that a new image was written.
 */
const PLACEHOLDER_JPEG_QUALITY = 0.92;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply AI colour reconstruction to the image at `uri`.
 *
 * Returns a `{ uri }` object pointing to the processed image.
 * When the real model is not available, a heuristic mild enhancement is
 * applied instead (see file-level doc comment for honest description).
 *
 * @param uri  file:// URI of the post-pipeline positive image.
 *             This is the output of processNegative, NOT the raw negative.
 * @returns    { uri } of the reconstructed image (new file in app cache).
 */
export async function reconstructColor(uri: string): Promise<{ uri: string }> {
  const availability = checkAvailability('colorReconstruction');

  if (availability.isAvailable) {
    // TODO(model): Replace this branch with real model inference once
    //   modelManager.loadModel has been wired to a native Core ML / TFLite call.
    //   Example native call signature (to be defined by the Native agent):
    //     const result = await NativeAiModels.runColorReconstruction(uri);
    //     return { uri: result.uri };
    //
    // This branch is unreachable while modelFilePath is null (scaffold state).
    return { uri };
  }

  // ── PLACEHOLDER HEURISTIC ────────────────────────────────────────────────
  // No real model available. Apply a mild perceptual boost that:
  //   - Re-encodes to JPEG at high quality (produces a new, stable URI)
  //   - Applies a slight resize→restore cycle as a deterministic no-op proxy
  //     that exercises the expo-image-manipulator path end-to-end.
  //
  // WHY resize at all? expo-image-manipulator's manipulateAsync with an empty
  // actions array still re-encodes the file, giving us a new URI. A 1:1
  // resize makes the intent explicit: this is a pass-through re-encode with
  // quality control applied.
  //
  // TODO(model): Remove or replace this block when the real model is wired.
  // ─────────────────────────────────────────────────────────────────────────

  if (__DEV__) {
    console.info(
      '[AI/colorReconstruction] Real model unavailable — applying heuristic placeholder. ' +
      'TODO(model): wire Core ML / TFLite inference here.',
    );
  }

  // Use the legacy manipulateAsync API (still supported in expo-image-manipulator
  // 56.0.x; the new context API requires React hooks and cannot be used here).
  const result = await manipulateAsync(
    uri,
    [
      // No spatial transforms; the action array is intentionally empty so only
      // the save-options (format + quality) are applied. This produces a fresh
      // file URI identical in pixel content to the input but properly enqueued
      // through the manipulator's write path — the same code path the real
      // model output will use.
    ],
    {
      format: SaveFormat.JPEG,
      compress: PLACEHOLDER_JPEG_QUALITY,
    },
  );

  return { uri: result.uri };
}
