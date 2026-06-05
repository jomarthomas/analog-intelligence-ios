/**
 * ai-image-processing — local Expo module.
 *
 * Negative → positive film-scanning engine, ported from the mature native iOS
 * app under `legacy-ios/Processing/Pipeline/*`. Implemented natively per
 * platform (Core Image on iOS, Bitmap/pixel ops on Android) and exposed here
 * as a small, strongly-typed JS API.
 *
 * Pipeline stages (faithful to `ImageProcessor.swift`):
 *   1. linearize sRGB → linear RGB
 *   2. invert negative
 *   3. estimate + remove orange mask (colour mode, when enabled)
 *   4. normalize channels (gray-world)
 *   5. automatic tone curve
 *   6. user exposure / warmth / contrast (+ optional saturation/…)
 *   7. sharpen
 *   8. encode back to sRGB and export to a cache file
 *
 * This module's exports are the SHARED CONTRACT for the Pipeline workstream.
 *
 * Task #10 additions (additive):
 *   - `applyUserAdjustments` — fast path for live Adjust-screen preview.
 *   - `detectFilmFrame`      — automatic frame/crop detection (Vision on iOS).
 *   - `ExportFormat`         — 'jpeg' | 'heic' | 'dng' (dng throws on Android).
 */
import AiImageProcessingModule from './src/AiImageProcessingModule';
import type {
  Histogram,
  ProcessParams,
  ProcessResult,
  UserAdjustParams,
  FrameDetectionResult,
} from './src/AiImageProcessing.types';

export type {
  FilmMode,
  ProcessParams,
  ProcessResult,
  Histogram,
  // Task #10 additions:
  UserAdjustParams,
  FramePoint,
  FrameDetectionResult,
  ExportFormat,
} from './src/AiImageProcessing.types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fill optional `ProcessParams` fields with their faithful legacy defaults so
 * the native bridge always receives a fully-specified record. Keeps the
 * native `Record` decoding simple and avoids platform-specific defaulting.
 */
function withDefaults(params: ProcessParams): Required<ProcessParams> {
  return {
    exposure: params.exposure,
    warmth: params.warmth,
    contrast: params.contrast,
    mode: params.mode,
    removeOrangeMask: params.removeOrangeMask,
    sharpen: params.sharpen,
    aiColor: params.aiColor ?? false,
    aiDustRemoval: params.aiDustRemoval ?? false,
    saturation: params.saturation ?? 0,
    highlights: params.highlights ?? 0,
    shadows: params.shadows ?? 0,
    vibrance: params.vibrance ?? 0,
  };
}

/**
 * Fill optional `UserAdjustParams` fields with 0 (no-op defaults) so the
 * native bridge always receives a fully-specified record — mirrors the same
 * convention as `withDefaults` above.
 */
function withAdjustDefaults(params: UserAdjustParams): Required<UserAdjustParams> {
  return {
    exposure: params.exposure ?? 0,
    warmth: params.warmth ?? 0,
    contrast: params.contrast ?? 0,
    saturation: params.saturation ?? 0,
    highlights: params.highlights ?? 0,
    shadows: params.shadows ?? 0,
    vibrance: params.vibrance ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Existing API (unchanged signatures)
// ---------------------------------------------------------------------------

/**
 * Run the full negative → positive pipeline on the image at `inputUri`.
 *
 * @param inputUri A `file://` (or platform-readable) URI to the captured
 *   negative. On iOS a plain path is also accepted.
 * @param params Processing parameters — see {@link ProcessParams}.
 * @returns The `file://` URI, width and height of the rendered positive.
 */
export async function processNegative(
  inputUri: string,
  params: ProcessParams,
): Promise<ProcessResult> {
  return AiImageProcessingModule.processNegative(inputUri, withDefaults(params));
}

/**
 * Compute a 256-bin RGB+luma histogram (with shadow/highlight clip
 * percentages) for the image at `uri`. Used by the live histogram and the
 * Insights feature. Ported from `legacy-ios/Processing/Metrics/HistogramAnalyzer.swift`.
 */
export async function analyzeHistogram(uri: string): Promise<Histogram> {
  return AiImageProcessingModule.analyzeHistogram(uri);
}

// ---------------------------------------------------------------------------
// Task #10 additions
// ---------------------------------------------------------------------------

/**
 * Apply ONLY the user-facing slider adjustments (exposure / warmth / contrast /
 * saturation / highlights / shadows / vibrance) to an already-processed
 * positive image.
 *
 * **Purpose:** fast-path for the live Adjust-screen preview. Because the
 * image has already been through the full pipeline (inversion, orange-mask
 * removal, channel normalisation, tone curve) those stages are intentionally
 * skipped here, making this call an order of magnitude faster than a full
 * `processNegative` re-run. Call this on every slider-drag event; switch back
 * to `processNegative` only when the user commits (e.g. leaves the screen).
 *
 * **Wiring for the orchestrator:** `src/processing/` should call this instead
 * of `processNegative` whenever the inputs are the `baseUri` of an already-
 * processed positive and only the user-adjustment sliders have changed. The
 * `previewParams` store in `src/processing/` should expose the current slider
 * values as a `UserAdjustParams` object and invoke this function on change.
 *
 * @param baseUri  `file://` URI of an already-processed positive image (the
 *   output of a prior `processNegative` call, stored at `ProcessResult.uri`).
 * @param params   The seven user-adjustment sliders. All fields optional;
 *   omitted fields default to 0 (no change).
 * @returns  A new `ProcessResult` pointing to a freshly written cache file.
 *   The `uri` changes on every call — callers should update their displayed
 *   image source and may delete the previous preview file to avoid cache bloat.
 */
export async function applyUserAdjustments(
  baseUri: string,
  params: UserAdjustParams,
): Promise<ProcessResult> {
  return AiImageProcessingModule.applyUserAdjustments(baseUri, withAdjustDefaults(params));
}

/**
 * Detect the film-frame boundary in a captured image.
 *
 * On **iOS** this uses `VNDetectRectanglesRequest` (Vision framework) with
 * parameters tuned for 35 mm film frames (min. aspect ratio 0.6, max. 0.7;
 * minimum coverage 30 % of image; minimum confidence 0.7). This is a direct
 * port of `legacy-ios/Vision/FrameDetector.detectFilmFrame`.
 *
 * On **Android** a best-effort luminance-edge heuristic is used. If no
 * confident result is found, `{ found: false, confidence: 0 }` is returned.
 * A TODO is present in the Kotlin source for a future Vision-equivalent
 * implementation (e.g. via ML Kit or a Canny/Hough approach).
 *
 * @param uri  `file://` URI of the image to analyse (can be the raw negative
 *   or the processed positive — frame boundaries are detectable in both).
 * @returns  {@link FrameDetectionResult} with `found`, optional `quad` /
 *   `cropRect` in image-pixel space (origin top-left), and `confidence`.
 */
export async function detectFilmFrame(uri: string): Promise<FrameDetectionResult> {
  return AiImageProcessingModule.detectFilmFrame(uri);
}

export default {
  processNegative,
  analyzeHistogram,
  applyUserAdjustments,
  detectFilmFrame,
};
