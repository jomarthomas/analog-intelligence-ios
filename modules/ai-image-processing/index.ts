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
 */
import AiImageProcessingModule from './src/AiImageProcessingModule';
import type { Histogram, ProcessParams, ProcessResult } from './src/AiImageProcessing.types';

export type {
  FilmMode,
  ProcessParams,
  ProcessResult,
  Histogram,
} from './src/AiImageProcessing.types';

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
 * Run the full negative → positive pipeline on the image at `inputUri`.
 *
 * @param inputUri A `file://` (or platform-readable) URI to the captured
 *   negative. On iOS a plain path is also accepted.
 * @param params Processing parameters — see {@link ProcessParams}.
 * @returns The `file://` URI, width and height of the rendered positive.
 */
export async function processNegative(
  inputUri: string,
  params: ProcessParams
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

export default {
  processNegative,
  analyzeHistogram,
};
