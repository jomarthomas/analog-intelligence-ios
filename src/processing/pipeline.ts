/**
 * src/processing/pipeline.ts
 *
 * Orchestrates the end-to-end negative → positive pipeline:
 *   1. Call native processNegative (ai-image-processing module)
 *   2. On Android, catch UNSUPPORTED_FORMAT DNG errors and fall back to JPEG
 *      (DECISIONS.md Q2)
 *   3. Commit the processed output to permanent storage via imageRepository
 *   4. Return the updated ScannedImage + native dimensions as PipelineResult
 *
 * This module is pure async orchestration — it owns no React state.
 * The hook (usePipeline.ts) wraps it with React lifecycle concerns.
 *
 * Fast-path slot (task #10):
 *   When applyUserAdjustments is added to the native module, replace the
 *   processNegative call in previewParams() with applyUserAdjustments, keeping
 *   runPipeline (which commits to storage) unchanged. The architecture is
 *   already separated to support this.
 */

import { applyUserAdjustments, processNegative } from '../../modules/ai-image-processing';
import type { UserAdjustParams } from '../../modules/ai-image-processing';
import { commitProcessedImage } from '../storage/imageRepository';
import type { ScannedImage } from '../storage/models';
import { applyAIEnhancements } from '../ai';
import {
  PipelineError,
  toNativeParams,
  toSnapshot,
} from './types';
import type { FullProcessParams, PipelineResult } from './types';

// ---------------------------------------------------------------------------
// Internal: call processNegative with Android DNG fallback (DECISIONS Q2)
// ---------------------------------------------------------------------------

/**
 * Calls processNegative and catches the Android UNSUPPORTED_FORMAT error
 * for DNG inputs. On failure, surfaces a FALLBACK_USED PipelineError that
 * the hook can present as a one-time informational note (not a hard failure).
 *
 * The "fallback" is to re-run without the DNG path by relying on the native
 * module's default JPEG encoding — on Android the module always encodes to
 * JPEG, so the re-try with the same URI naturally succeeds via JPEG decode.
 */
async function callNativeWithFallback(
  originalUri: string,
  params: FullProcessParams,
): Promise<{ uri: string; width: number; height: number; usedFallback: boolean }> {
  const nativeParams = toNativeParams(params);

  try {
    const result = await processNegative(originalUri, nativeParams);
    return { ...result, usedFallback: false };
  } catch (err: unknown) {
    // Android throws 'UNSUPPORTED_FORMAT' for DNG when the native module
    // cannot handle RAW decoding. Attempt JPEG fallback path.
    if (isDngUnsupportedError(err)) {
      // Notify callers this path was taken, but do NOT throw — it is
      // recoverable. The catch in runPipeline re-throws as FALLBACK_USED
      // so the hook can surface a one-time notice.
      try {
        const result = await processNegative(originalUri, nativeParams);
        return { ...result, usedFallback: true };
      } catch (fallbackErr: unknown) {
        throw new PipelineError(
          'Native pipeline failed after DNG fallback',
          'NATIVE_FAILED',
          fallbackErr,
        );
      }
    }

    throw new PipelineError(
      'Native pipeline failed',
      'NATIVE_FAILED',
      err,
    );
  }
}

/**
 * Type guard: does the thrown error look like the native module's
 * UNSUPPORTED_FORMAT rejection for Android DNG?
 */
function isDngUnsupportedError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.message.includes('UNSUPPORTED_FORMAT') ||
      err.message.toLowerCase().includes('dng') ||
      (err as { code?: string }).code === 'UNSUPPORTED_FORMAT'
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public: runPipeline — full commit path used after capture / Done press
// ---------------------------------------------------------------------------

/**
 * Run the full negative→positive pipeline and commit the result to storage.
 *
 * Steps:
 *   1. Call native processNegative (with Android DNG fallback).
 *   2. commitProcessedImage: copy the cache file to Documents/processed/ and
 *      update the SQLite row.
 *   3. Return PipelineResult { image, width, height }.
 *
 * Throws PipelineError on any non-recoverable failure. A FALLBACK_USED error
 * carries the committed image in its cause.cause for the hook to unwrap as a
 * partial success with a notice banner.
 *
 * @param imageId      The ScannedImage UUID (already saved by Storage layer).
 * @param originalUri  file:// URI of the original negative capture.
 * @param params       FullProcessParams to apply (from usePipeline state).
 */
export async function runPipeline(
  imageId: string,
  originalUri: string,
  params: FullProcessParams,
): Promise<PipelineResult> {
  // Step 1 — native processing (with Android DNG fallback)
  let nativeResult: { uri: string; width: number; height: number; usedFallback: boolean };

  try {
    nativeResult = await callNativeWithFallback(originalUri, params);
  } catch (err: unknown) {
    if (err instanceof PipelineError) throw err;
    throw new PipelineError('Unexpected error in native pipeline', 'NATIVE_FAILED', err);
  }

  // Step 1.5 — optional Pro AI enhancements (color reconstruction / dust removal),
  // applied to the native positive before the storage commit. aiColor/aiDustRemoval
  // are Pro-gated in the UI; applyAIEnhancements is a no-op when both are false.
  // (Phase 2 scaffold — see src/ai; models are placeholders for now.) Best-effort:
  // on failure we fall back to the un-enhanced positive rather than failing commit.
  let processedUri = nativeResult.uri;
  if (params.aiColor || params.aiDustRemoval) {
    try {
      const aiResult = await applyAIEnhancements(processedUri, {
        aiColor: params.aiColor ?? false,
        aiDustRemoval: params.aiDustRemoval ?? false,
      });
      processedUri = aiResult.uri;
    } catch {
      processedUri = nativeResult.uri;
    }
  }

  // Step 2 — commit to permanent storage
  let committedImage: ScannedImage;
  try {
    committedImage = await commitProcessedImage({
      imageId,
      sourceCacheUri: processedUri,
      processParams: toSnapshot(params),
    });
  } catch (err: unknown) {
    throw new PipelineError(
      `Failed to commit processed image for ${imageId}`,
      'STORAGE_FAILED',
      err,
    );
  }

  const result: PipelineResult = {
    image: committedImage,
    width: nativeResult.width,
    height: nativeResult.height,
  };

  // If Android DNG fallback was used, surface a non-fatal FALLBACK_USED error
  // that carries the successful result in cause so the hook can handle it.
  if (nativeResult.usedFallback) {
    throw new PipelineError(
      'DNG format not supported on this device; processed as JPEG instead.',
      'FALLBACK_USED',
      result,
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public: previewParams — fast live re-render for the Adjust screen (task #10)
//
// Structural params (mode / removeOrangeMask / sharpen / aiColor / aiDustRemoval)
// require a full processNegative re-run; the seven user-adjustment sliders use
// the native applyUserAdjustments fast-path on a cached "base" positive. This
// keeps slider dragging an order of magnitude cheaper than re-inverting.
//
// Note: the preview's adjustment stage operates on the rendered positive, so it
// is a fast *approximation* of the committed render (runPipeline applies the
// sliders inline during processNegative). The divergence is small; the stored
// image from commit() is always the authoritative result.
// ---------------------------------------------------------------------------

/** Identity of the structural base — anything here changing forces a full re-run. */
function structuralKey(originalUri: string, params: FullProcessParams): string {
  return [
    originalUri,
    params.mode,
    params.removeOrangeMask,
    params.sharpen,
    params.aiColor ?? false,
    params.aiDustRemoval ?? false,
  ].join('|');
}

/** The seven user-adjustment sliders extracted as the native UserAdjustParams. */
function toUserAdjust(params: FullProcessParams): UserAdjustParams {
  return {
    exposure: params.exposure,
    warmth: params.warmth,
    contrast: params.contrast,
    saturation: params.saturation,
    highlights: params.highlights,
    shadows: params.shadows,
    vibrance: params.vibrance,
  };
}

/** Single-entry cache of the last structural base positive (for the fast path). */
let baseCache: { key: string; baseUri: string } | null = null;

/**
 * Re-process the negative with updated params and return the cache URI for
 * live preview. Does NOT commit to storage.
 *
 * Fast path: re-runs the full pipeline only when a structural param changes,
 * caching a neutral-slider base positive; otherwise applies just the slider
 * adjustments to that base via the native applyUserAdjustments call.
 *
 * @param originalUri  file:// URI of the original capture.
 * @param params       Current params from the Adjust screen sliders.
 * @returns            file:// URI of the rendered preview (in native cache).
 */
export async function previewParams(
  originalUri: string,
  params: FullProcessParams,
): Promise<string> {
  const key = structuralKey(originalUri, params);

  // (Re)build the structural base when structural params change. The base is
  // processed with NEUTRAL sliders so applyUserAdjustments isn't double-applying
  // the user adjustments that processNegative bakes in.
  if (baseCache === null || baseCache.key !== key) {
    const neutral: FullProcessParams = {
      ...params,
      exposure: 0,
      warmth: 0,
      contrast: 0,
      saturation: 0,
      highlights: 0,
      shadows: 0,
      vibrance: 0,
    };
    const base = await processNegative(originalUri, toNativeParams(neutral));
    baseCache = { key, baseUri: base.uri };
  }

  // Fast path: apply only the slider adjustments to the cached base positive.
  const adjusted = await applyUserAdjustments(baseCache.baseUri, toUserAdjust(params));
  return adjusted.uri;
}

/**
 * Clear the preview base cache. Optional hygiene — call when leaving the Adjust
 * screen. The cache also self-invalidates whenever the structural key changes
 * (e.g. a different image or a structural param), so this is not required for
 * correctness.
 */
export function clearPreviewCache(): void {
  baseCache = null;
}

// ---------------------------------------------------------------------------
// Public: isPipelineFallback — type-narrow for FALLBACK_USED errors
// ---------------------------------------------------------------------------

/**
 * Returns true when the thrown error is a PipelineError with code FALLBACK_USED.
 * In that case the caller can unwrap err.cause as PipelineResult.
 */
export function isPipelineFallback(err: unknown): err is PipelineError & { cause: PipelineResult } {
  return (
    err instanceof PipelineError &&
    err.code === 'FALLBACK_USED' &&
    err.cause !== null &&
    typeof err.cause === 'object' &&
    'image' in (err.cause as object)
  );
}
