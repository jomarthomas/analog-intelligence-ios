/**
 * src/ai/index.ts
 *
 * Public barrel for the Phase-2 AI scaffold.
 *
 * This is the ONLY file in src/ai that src/processing/pipeline.ts should
 * import. All AI operations funnel through `applyAIEnhancements`.
 *
 * ─── HOW src/processing/pipeline.ts SHOULD CALL THIS ───────────────────────
 *
 *   import { applyAIEnhancements } from '../ai';
 *
 *   // Inside runPipeline, AFTER the native processNegative result is obtained
 *   // and BEFORE commitProcessedImage writes to permanent storage:
 *
 *   let processedUri = nativeResult.uri;
 *
 *   if (params.aiColor || params.aiDustRemoval) {
 *     const aiResult = await applyAIEnhancements(processedUri, {
 *       aiColor:      params.aiColor      ?? false,
 *       aiDustRemoval: params.aiDustRemoval ?? false,
 *     });
 *     processedUri = aiResult.uri;
 *   }
 *
 *   // Then proceed to commitProcessedImage with the (possibly AI-enhanced) URI:
 *   committedImage = await commitProcessedImage({
 *     imageId,
 *     sourceCacheUri: processedUri,
 *     processParams: toSnapshot(params),
 *   });
 *
 * ─── OPERATION ORDER ────────────────────────────────────────────────────────
 * When both flags are true, operations run in this fixed order:
 *   1. Color Reconstruction  (aiColor)     — improves colour fidelity first
 *   2. Dust/Scratch Removal  (aiDustRemoval) — cleans the (now colour-correct) image
 *
 * This order matches the legacy pipeline intent: establish correct colour
 * before removing defects, so inpainting operates on realistic pixel values.
 *
 * ─── PRO GATING ─────────────────────────────────────────────────────────────
 * AI flags are set by the Monetization layer's Pro gate BEFORE pipeline.ts
 * is called. pipeline.ts (and this module) do NOT enforce Pro status directly.
 * If both flags are false, applyAIEnhancements is effectively a no-op that
 * returns the original URI immediately.
 *
 * ─── CURRENT STATUS: SCAFFOLD ───────────────────────────────────────────────
 * colorReconstruction: mild heuristic re-encode (no real model).
 * dustRemoval: honest pass-through (no real model, no harmful heuristic).
 * See individual module files for detailed TODO(model) markers.
 */

import { reconstructColor } from './colorReconstruction';
import { removeDustScratches } from './dustRemoval';
import type { AIEnhancementOptions, AIEnhancementResult, AIOperation } from './types';

export type { AIOperation, AIEnhancementOptions, AIEnhancementResult, ModelAvailability } from './types';

export { checkAvailability, loadModel, unloadModel, getDescriptor } from './modelManager';

// ---------------------------------------------------------------------------
// Primary entry point
// ---------------------------------------------------------------------------

/**
 * Apply AI enhancements to a processed film-positive image.
 *
 * This is the sole function that `src/processing/pipeline.ts` calls.
 * It sequences the enabled AI operations and returns the final URI.
 *
 * Both flags default to false; if neither is true the function returns
 * immediately with the original URI (zero cost).
 *
 * @param uri      file:// URI of the native-processed positive image.
 *                 Must be a readable local file (not a remote URL).
 * @param options  Which AI operations to run. Typically derived directly
 *                 from FullProcessParams.aiColor / aiDustRemoval.
 * @returns        AIEnhancementResult with the final URI and applied ops list.
 */
export async function applyAIEnhancements(
  uri: string,
  options: AIEnhancementOptions,
): Promise<AIEnhancementResult> {
  const { aiColor = false, aiDustRemoval = false } = options;

  // Fast exit: no AI requested.
  if (!aiColor && !aiDustRemoval) {
    return { uri, appliedOps: [] };
  }

  let currentUri = uri;
  const appliedOps: AIOperation[] = [];

  // Step 1 — Color Reconstruction (runs first; see OPERATION ORDER above)
  if (aiColor) {
    const colorResult = await reconstructColor(currentUri);
    currentUri = colorResult.uri;
    appliedOps.push('colorReconstruction');
  }

  // Step 2 — Dust/Scratch Removal (operates on the colour-correct image)
  if (aiDustRemoval) {
    const dustResult = await removeDustScratches(currentUri);
    currentUri = dustResult.uri;
    appliedOps.push('dustRemoval');
  }

  return { uri: currentUri, appliedOps };
}
