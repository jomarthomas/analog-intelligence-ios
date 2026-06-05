/**
 * src/ai/dustRemoval.ts
 *
 * AI dust and scratch removal for scanned film positives.
 *
 * ─── CURRENT STATUS: HONEST PLACEHOLDER ────────────────────────────────────
 * No real on-device model is bundled. The function below is an honest
 * pass-through: it returns the original URI unchanged. A pass-through is the
 * correct placeholder here because dust/scratch removal requires non-local
 * pixel context that cannot be meaningfully approximated by a simple
 * deterministic filter (unlike colour reconstruction, where a contrast/
 * saturation heuristic at least directionally resembles the goal).
 *
 * This is NOT AI. It is a no-op placeholder with the correct call signature.
 *
 * ─── REAL MODEL PATH (future) ───────────────────────────────────────────────
 * Dust and scratch removal is a pixel-level inpainting task. A real
 * implementation requires:
 *   - A detection stage: identify dust/scratch masks (e.g. via a segmentation
 *     model or infrared channel, as in physical drum scanners using Digital ICE).
 *   - An inpainting stage: fill masked regions from surrounding context.
 *
 * Suggested on-device approach:
 *   1. Bundle a lightweight U-Net-style Core ML model trained on film-grain +
 *      dust pairs (iOS) or an equivalent TFLite model (Android).
 *   2. Tile large images if VRAM is limited (tile size ~512×512 with overlap).
 *   3. Expose a native inference function, e.g.:
 *        NativeAiModels.runDustRemoval(uri): Promise<{ uri: string }>
 *   4. Call `modelManager.loadModel('dustRemoval')` once on Pro feature unlock,
 *      and `modelManager.unloadModel('dustRemoval')` on app background.
 *
 * The function signature `removeDustScratches(uri): Promise<{ uri: string }>`
 * MUST NOT change — it is the stable contract consumed by src/ai/index.ts.
 */

import { checkAvailability } from './modelManager';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply AI dust and scratch removal to the image at `uri`.
 *
 * Returns a `{ uri }` object. When the real model is not available this is an
 * honest pass-through — the original URI is returned without modification.
 *
 * @param uri  file:// URI of the post-pipeline positive image.
 *             This is the output of processNegative (or colorReconstruction if
 *             both AI steps are enabled and aiColor runs first).
 * @returns    { uri } of the cleaned image, or original URI if model unavailable.
 */
export async function removeDustScratches(uri: string): Promise<{ uri: string }> {
  const availability = checkAvailability('dustRemoval');

  if (availability.isAvailable) {
    // TODO(model): Replace this branch with real model inference once
    //   modelManager.loadModel has been wired to a native Core ML / TFLite call.
    //   Example native call signature (to be defined by the Native agent):
    //     const result = await NativeAiModels.runDustRemoval(uri);
    //     return { uri: result.uri };
    //
    // This branch is unreachable while modelFilePath is null (scaffold state).
    return { uri };
  }

  // ── PLACEHOLDER PASS-THROUGH ─────────────────────────────────────────────
  // No real model available. Return the URI unchanged.
  //
  // Rationale for pass-through (not a heuristic):
  //   Dust/scratch removal is inherently an inpainting operation that requires
  //   knowing WHERE the defects are. Without a detection model, any spatial
  //   filter (blur, median, etc.) would degrade legitimate image detail. A
  //   pass-through is the only honest placeholder that does not harm image quality.
  //
  // TODO(model): Remove this pass-through when the real model is wired.
  // ─────────────────────────────────────────────────────────────────────────

  if (__DEV__) {
    console.info(
      '[AI/dustRemoval] Real model unavailable — returning original URI as pass-through. ' +
      'TODO(model): wire Core ML / TFLite inpainting inference here.',
    );
  }

  return { uri };
}
