/**
 * src/features/gallery/applyLookToRoll.ts
 *
 * "Apply look to whole roll" — the lab-scanner "sync settings" workflow that no
 * mobile film scanner offers. Given one frame's adjustment look (a
 * ProcessParamsSnapshot), re-render every frame in its roll (ScanSession) with
 * those exact params and persist the new processed positives.
 *
 * This is pure async orchestration over the existing pipeline + repository — it
 * owns no React state and does NOT touch the zustand store. The store action
 * (`useGalleryStore.applyParamsToRoll`) wraps this and refreshes in-memory state
 * after it resolves; UI surfaces it from the RollMetadataSheet.
 *
 * Design notes:
 *   • SEQUENTIAL — it's N native renders; running them one-by-one keeps peak
 *     memory bounded (each processNegative decodes a full-resolution image) and
 *     gives deterministic progress for the UI.
 *   • RESILIENT — a single frame failing is recorded and skipped; the rest of
 *     the roll still gets the look. Per-frame outcomes are aggregated in the
 *     returned summary.
 *   • CANCELLABLE — an optional AbortSignal lets the UI stop between frames. We
 *     never tear down a render mid-flight (the native call is atomic), we just
 *     stop scheduling further frames.
 *   • FULL-RESOLUTION — params are committed via runPipeline (no maxDimension),
 *     so each stored positive is the authoritative full-res render, identical to
 *     pressing "Done" on the Adjust screen for that frame.
 */

import { runPipeline, isPipelineFallback, fromSnapshot } from '@/processing';
import { getImagesBySession } from '@/storage';
import type { ProcessParamsSnapshot, ScannedImage } from '@/storage';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Progress callback payload, emitted before each frame starts rendering. */
export interface ApplyLookProgress {
  /** 1-based index of the frame about to be processed. */
  current: number;
  /** Total frames in the roll. */
  total: number;
  /** The frame currently being processed. */
  image: ScannedImage;
}

/** Per-frame failure detail (kept for diagnostics / a future retry affordance). */
export interface ApplyLookFailure {
  imageId: string;
  message: string;
}

/** Options for {@link applyParamsToRoll}. */
export interface ApplyLookOptions {
  /**
   * Called once per frame, immediately BEFORE that frame is rendered, so a
   * progress bar can read "Applying to frame {current} of {total}".
   */
  onProgress?: (progress: ApplyLookProgress) => void;
  /**
   * Cooperative cancellation. Checked between frames; an aborted run stops
   * scheduling further renders and resolves with `cancelled: true`. Frames
   * already committed are kept (the look is applied to them).
   */
  signal?: AbortSignal;
  /**
   * When true, the source frame's own params are skipped (it already has this
   * look). Defaults to false — re-rendering it is harmless and keeps the result
   * count intuitive ("applied to all N frames").
   */
  skipImageId?: string;
}

/** Aggregate result of an apply-to-roll run. */
export interface ApplyLookResult {
  /** Frames considered (roll size, minus any `skipImageId`). */
  total: number;
  /** Frames whose positive was successfully re-rendered + persisted. */
  succeeded: number;
  /** Frames that failed to render/commit (see `failures`). */
  failed: number;
  /** Frames skipped because the run was cancelled before reaching them. */
  skipped: number;
  /** True if the run was stopped early via the AbortSignal. */
  cancelled: boolean;
  /** Per-frame failure details, in processing order. */
  failures: ApplyLookFailure[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Apply one look (ProcessParamsSnapshot) to every frame in a roll, re-rendering
 * and persisting each processed positive through the existing pipeline.
 *
 * For each ScannedImage in the session, in roll order:
 *   1. Set the frame's params to `params` (via fromSnapshot → FullProcessParams).
 *   2. RE-RENDER the positive from the frame's `originalUri` using runPipeline,
 *      which calls the native engine then commits the output to permanent
 *      storage (`commitProcessedImage`) with the new `params` snapshot.
 *   3. Continue to the next frame; record (don't throw on) any failure.
 *
 * Does NOT mutate the zustand store — callers should refresh afterwards
 * (the store's `applyParamsToRoll` wrapper does this).
 *
 * @param sessionId The roll/ScanSession whose frames receive the look.
 * @param params    The ProcessParamsSnapshot (look) to apply to every frame.
 * @param opts      Progress, cancellation, and skip options.
 * @returns         A summary of how many frames succeeded / failed / were skipped.
 */
export async function applyParamsToRoll(
  sessionId: string,
  params: ProcessParamsSnapshot,
  opts: ApplyLookOptions = {},
): Promise<ApplyLookResult> {
  const { onProgress, signal, skipImageId } = opts;

  // Load the roll's frames. getImagesBySession returns newest-first; we apply in
  // that stable order so progress indices line up with what the UI counts.
  const allFrames = await getImagesBySession(sessionId);
  const frames =
    skipImageId !== undefined
      ? allFrames.filter((img) => img.id !== skipImageId)
      : allFrames;

  const result: ApplyLookResult = {
    total: frames.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    cancelled: false,
    failures: [],
  };

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    if (frame === undefined) continue;

    // Cooperative cancellation: stop BEFORE starting the next render. Remaining
    // (unprocessed) frames are counted as skipped.
    if (signal?.aborted) {
      result.cancelled = true;
      result.skipped = frames.length - i;
      break;
    }

    onProgress?.({ current: i + 1, total: frames.length, image: frame });

    // Build the full params for this frame. fromSnapshot only returns null for
    // an undefined snapshot, which can't happen here (params is required).
    const fullParams = fromSnapshot(params);
    if (fullParams === null) {
      result.failed += 1;
      result.failures.push({ imageId: frame.id, message: 'Invalid params snapshot.' });
      continue;
    }

    try {
      // Re-render the positive from the ORIGINAL capture and commit it +
      // the new params snapshot to permanent storage. Full resolution
      // (no maxDimension) — this is the authoritative render for the frame.
      await runPipeline(frame.id, frame.originalUri, fullParams);
      result.succeeded += 1;
    } catch (err: unknown) {
      // runPipeline throws PipelineError. The Android DNG case surfaces as a
      // non-fatal FALLBACK_USED whose cause carries the committed image — treat
      // that as a success (the frame WAS rendered + persisted, just via JPEG).
      if (isPipelineFallback(err)) {
        result.succeeded += 1;
      } else {
        result.failed += 1;
        result.failures.push({
          imageId: frame.id,
          message: err instanceof Error ? err.message : 'Render failed.',
        });
      }
    }
  }

  return result;
}
