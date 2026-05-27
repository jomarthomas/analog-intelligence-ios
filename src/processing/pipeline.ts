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

import { processNegative } from '../../modules/ai-image-processing';
import { commitProcessedImage } from '../storage/imageRepository';
import type { ScannedImage } from '../storage/models';
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

  // Step 2 — commit to permanent storage
  let committedImage: ScannedImage;
  try {
    committedImage = await commitProcessedImage({
      imageId,
      sourceCacheUri: nativeResult.uri,
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
// Public: previewParams — lightweight re-run for Adjust screen debounce
//
// For MVP this re-runs processNegative (same as runPipeline but without
// committing to storage). Once task #10 lands, replace the processNegative
// call here with applyUserAdjustments(baseUri, params) — the rest stays.
// ---------------------------------------------------------------------------

/**
 * Re-process the negative with updated params and return the cache URI for
 * live preview. Does NOT commit to storage.
 *
 * FAST-PATH SLOT (task #10): Replace processNegative call with
 *   applyUserAdjustments(baseUri, toNativeParams(params))
 * when the native module exposes it. No other changes needed.
 *
 * @param originalUri  file:// URI of the original capture.
 * @param params       Current params from the Adjust screen sliders.
 * @returns            file:// URI of the rendered preview (in native cache).
 */
export async function previewParams(
  originalUri: string,
  params: FullProcessParams,
): Promise<string> {
  const nativeParams = toNativeParams(params);

  // MVP: re-run the full pipeline (no applyUserAdjustments fast path yet)
  // task #10 fast-path slot ↓
  const result = await processNegative(originalUri, nativeParams);

  return result.uri;
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
