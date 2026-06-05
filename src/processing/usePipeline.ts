/**
 * src/processing/usePipeline.ts
 *
 * React hook for the Adjust screen: holds current FullProcessParams,
 * provides a debounced preview re-process on param change, exposes the
 * processed preview URI, loading state, and error state.
 *
 * Fast-path architecture note (task #10):
 *   The hook calls previewParams() (pipeline.ts) for slider debounce and
 *   runPipeline() for the final "Done" commit. When task #10 lands and
 *   native applyUserAdjustments is available, only previewParams() in
 *   pipeline.ts needs to change — this hook is unaffected.
 *
 * Usage (Adjust screen):
 *
 *   const pipeline = usePipeline({
 *     imageId: id,
 *     originalUri: image.originalUri,
 *     initialParams: fromSnapshot(image.processParams) ?? DEFAULT_FULL_PROCESS_PARAMS,
 *   });
 *
 *   // Bind slider values:
 *   pipeline.params.exposure
 *   pipeline.setParam('exposure', value)
 *
 *   // Preview state:
 *   pipeline.previewUri       // file:// URI or undefined while processing
 *   pipeline.isProcessing     // true while debounced preview is in flight
 *   pipeline.error            // PipelineError | null
 *   pipeline.fallbackNotice   // non-null = DNG fallback was used (show banner)
 *
 *   // Commit on Done:
 *   const result = await pipeline.commit();
 *
 *   // Reset params to defaults:
 *   pipeline.resetParams();
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { PipelineError, toSnapshot } from './types';
import type { FullProcessParams, PipelineResult } from './types';
import { DEFAULT_FULL_PROCESS_PARAMS } from './defaults';
import { isPipelineFallback, previewParams, runPipeline } from './pipeline';
import type { ProcessParamsSnapshot } from '../storage/models';

// ---------------------------------------------------------------------------
// Hook input / output types
// ---------------------------------------------------------------------------

export interface UsePipelineOptions {
  /** UUID of the ScannedImage already saved by the Storage layer. */
  imageId: string;
  /** file:// URI of the original negative capture. */
  originalUri: string;
  /**
   * Starting params — pass fromSnapshot(image.processParams) or
   * DEFAULT_FULL_PROCESS_PARAMS when the image has never been adjusted.
   */
  initialParams: FullProcessParams;
  /**
   * Debounce delay (ms) before a param change triggers a preview re-process.
   * Defaults to 350 ms — fast enough to feel responsive, slow enough to
   * avoid flooding the native bridge on rapid slider drags.
   */
  debounceMs?: number;
}

export interface UsePipelineReturn {
  // --- Current params ---
  /** Live FullProcessParams held by the hook. */
  params: FullProcessParams;
  /**
   * Update a single param key. Triggers a debounced preview re-process.
   * Accepts any key of FullProcessParams; value type is inferred.
   */
  setParam: <K extends keyof FullProcessParams>(
    key: K,
    value: FullProcessParams[K],
  ) => void;
  /**
   * Merge a partial params object. Triggers a debounced preview re-process.
   * Useful for applying presets in one call.
   */
  mergeParams: (patch: Partial<FullProcessParams>) => void;
  /** Reset params to DEFAULT_FULL_PROCESS_PARAMS. */
  resetParams: () => void;
  /** Snapshot of current params in the storage shape (for dirty-check). */
  paramsSnapshot: ProcessParamsSnapshot;

  // --- Preview state ---
  /**
   * file:// URI of the most recently rendered preview, or undefined if the
   * pipeline has not yet completed for the current params.
   */
  previewUri: string | undefined;
  /** True while a preview re-process is in flight. */
  isProcessing: boolean;
  /**
   * Structured pipeline error, or null. FALLBACK_USED errors are surfaced
   * via fallbackNotice instead (they are not treated as failures).
   */
  error: PipelineError | null;
  /**
   * Non-null when the Android DNG fallback was triggered. The message string
   * is suitable for a one-time info banner in the UI.
   */
  fallbackNotice: string | null;

  // --- Actions ---
  /**
   * Run the full pipeline + storage commit with the current params.
   * Called when the user taps Done on the Adjust screen.
   *
   * Resolves with PipelineResult on success.
   * Rejects with PipelineError on hard failure (sets this.error).
   * On FALLBACK_USED (Android DNG), resolves with the result AND sets
   * fallbackNotice so the UI can show a banner.
   */
  commit: () => Promise<PipelineResult>;
  /**
   * Manually trigger a preview re-process without waiting for the debounce.
   * Useful for "Apply" buttons or preset selection.
   */
  forcePreview: () => Promise<void>;
  /** Dismiss the current error (e.g. after showing an error UI). */
  clearError: () => void;
  /** Dismiss the fallback notice after the user has seen it. */
  clearFallbackNotice: () => void;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

const DEFAULT_DEBOUNCE_MS = 350;

export function usePipeline({
  imageId,
  originalUri,
  initialParams,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UsePipelineOptions): UsePipelineReturn {
  const [params, setParams] = useState<FullProcessParams>(initialParams);
  const [previewUri, setPreviewUri] = useState<string | undefined>(undefined);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<PipelineError | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

  // Track the latest params ref so the debounced callback always sees the
  // most-current value even if it fires after a rapid succession of setParam
  // calls (avoids stale closure over an older params snapshot). The ref is
  // synced in an effect (writing a ref during render is disallowed under the
  // React Compiler) — commit()/forcePreview() only read it from callbacks that
  // run after commit, so the post-render sync is always current for them.
  const latestParamsRef = useRef<FullProcessParams>(params);
  useEffect(() => {
    latestParamsRef.current = params;
  }, [params]);

  // Debounce timer reference
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Abort flag: when the component unmounts mid-flight, avoid setState on
  // an unmounted component. Also used to discard stale preview results if a
  // newer request arrives before the previous one resolves.
  const requestIdRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Internal: run preview (non-committing)
  // ---------------------------------------------------------------------------

  const runPreview = useCallback(async (currentParams: FullProcessParams) => {
    const requestId = ++requestIdRef.current;
    setIsProcessing(true);
    setError(null);

    try {
      const uri = await previewParams(originalUri, currentParams);
      // Discard stale result if a newer request landed first
      if (requestId !== requestIdRef.current) return;
      setPreviewUri(uri);
    } catch (err: unknown) {
      if (requestId !== requestIdRef.current) return;
      if (err instanceof PipelineError) {
        setError(err);
      } else {
        setError(
          new PipelineError(
            err instanceof Error ? err.message : 'Preview processing failed',
            'NATIVE_FAILED',
            err,
          ),
        );
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsProcessing(false);
      }
    }
  }, [originalUri]);

  // ---------------------------------------------------------------------------
  // Debounced preview: fires after the debounce window with the latest params
  // ---------------------------------------------------------------------------

  const scheduleDebouncedPreview = useCallback(
    (nextParams: FullProcessParams) => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        void runPreview(nextParams);
      }, debounceMs);
    },
    [runPreview, debounceMs],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      // Invalidate any in-flight requests. These are internal bookkeeping refs
      // (a timer handle + a request counter), not refs to rendered nodes, so we
      // intentionally read/mutate their live values at unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestIdRef.current++;
    };
  }, []);

  // Run an initial preview when the hook mounts (so the screen doesn't
  // show a blank preview area on open). The synchronous setState inside
  // runPreview is an intentional "load on mount" kick-off, not a render-loop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runPreview(initialParams);
    // Only re-run if originalUri changes (not on every initialParams re-render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalUri]);

  // ---------------------------------------------------------------------------
  // Param setters
  // ---------------------------------------------------------------------------

  const setParam = useCallback(
    <K extends keyof FullProcessParams>(key: K, value: FullProcessParams[K]) => {
      setParams((prev) => {
        const next = { ...prev, [key]: value };
        scheduleDebouncedPreview(next);
        return next;
      });
    },
    [scheduleDebouncedPreview],
  );

  const mergeParams = useCallback(
    (patch: Partial<FullProcessParams>) => {
      setParams((prev) => {
        const next = { ...prev, ...patch };
        scheduleDebouncedPreview(next);
        return next;
      });
    },
    [scheduleDebouncedPreview],
  );

  const resetParams = useCallback(() => {
    const next = { ...DEFAULT_FULL_PROCESS_PARAMS };
    setParams(next);
    scheduleDebouncedPreview(next);
  }, [scheduleDebouncedPreview]);

  // ---------------------------------------------------------------------------
  // commit — full pipeline + storage write
  // ---------------------------------------------------------------------------

  const commit = useCallback(async (): Promise<PipelineResult> => {
    setIsProcessing(true);
    setError(null);

    try {
      const result = await runPipeline(imageId, originalUri, latestParamsRef.current);
      setPreviewUri(result.image.processedUri);
      return result;
    } catch (err: unknown) {
      // FALLBACK_USED is a recoverable "success with notice", not a failure.
      if (isPipelineFallback(err)) {
        const fallbackResult = err.cause as PipelineResult;
        setPreviewUri(fallbackResult.image.processedUri);
        setFallbackNotice(err.message);
        return fallbackResult;
      }

      const pipelineErr =
        err instanceof PipelineError
          ? err
          : new PipelineError(
              err instanceof Error ? err.message : 'Commit failed',
              'NATIVE_FAILED',
              err,
            );
      setError(pipelineErr);
      throw pipelineErr;
    } finally {
      setIsProcessing(false);
    }
  }, [imageId, originalUri]);

  // ---------------------------------------------------------------------------
  // forcePreview — immediate (no debounce)
  // ---------------------------------------------------------------------------

  const forcePreview = useCallback(async (): Promise<void> => {
    await runPreview(latestParamsRef.current);
  }, [runPreview]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const paramsSnapshot = toSnapshot(params);

  const clearError = useCallback(() => setError(null), []);
  const clearFallbackNotice = useCallback(() => setFallbackNotice(null), []);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    params,
    setParam,
    mergeParams,
    resetParams,
    paramsSnapshot,
    previewUri,
    isProcessing,
    error,
    fallbackNotice,
    commit,
    forcePreview,
    clearError,
    clearFallbackNotice,
  };
}

// ---------------------------------------------------------------------------
// Re-exports for consumer convenience (avoids a second import for common items)
// ---------------------------------------------------------------------------

export { DEFAULT_FULL_PROCESS_PARAMS } from './defaults';
export { fromSnapshot } from './types';
export type { FullProcessParams, PipelineResult } from './types';
export { PipelineError } from './types';
