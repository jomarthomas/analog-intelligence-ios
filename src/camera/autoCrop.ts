/**
 * src/camera/autoCrop.ts
 *
 * Auto-crop a freshly-captured frame down to the detected film negative BEFORE
 * it ever reaches storage or the processing engine.
 *
 * WHY THIS EXISTS (the #1 scanner failure mode):
 *   When a user holds a negative in front of a bright window, the film is a
 *   SMALL part of the frame and the bright room behind it dominates. If the
 *   negative→positive engine sees the whole frame it meters off the window and
 *   the result blows out to pure white. Competitors (Kodak Mobile Film Scanner,
 *   FilmBox by Photomyne, KLIM) all solve this by auto-detecting the film frame
 *   and cropping to it. This module is that crop step.
 *
 * HOW IT WORKS:
 *   1. `detectFilmFrame(uri)` (native, Vision on iOS / luminance heuristic on
 *      Android) returns a pixel-space `cropRect` for the film boundary.
 *   2. We sanity-check the rect (sane confidence, sensible coverage, not a
 *      degenerate sliver) so we never crop on a bad guess.
 *   3. We crop the captured file with expo-image-manipulator and return the new
 *      `file://` URI + dimensions.
 *
 * FALLBACK (must never break capture):
 *   If detection fails, returns no rect, is low-confidence, or the manipulator
 *   throws, we return the ORIGINAL uri unchanged with `cropped: false`. The
 *   caller then proceeds exactly as it did before this feature existed.
 *
 * This file is pure orchestration over the shared native contract
 * (`detectFilmFrame`) + expo-image-manipulator; the heavy lifting is native.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { detectFilmFrame } from '../../modules/ai-image-processing';
import type { FrameDetectionResult } from '../../modules/ai-image-processing';

// ---------------------------------------------------------------------------
// Tuning — when do we TRUST a detection enough to silently crop on it?
// ---------------------------------------------------------------------------

/**
 * Minimum detection confidence to act on.
 *
 * On iOS this is the Vision `VNRectangleObservation.confidence`. On Android the
 * native heuristic returns a *relative* score that is not directly comparable,
 * so we keep this conservative; a missed crop just falls back to full-frame
 * (safe), whereas a wrong crop loses image data (bad). See the per-platform
 * note on `FrameDetectionResult.confidence`.
 */
const MIN_CONFIDENCE = 0.6;

/**
 * Reject crops that keep less than this fraction of the frame area. A film
 * frame the user is trying to scan should be a meaningful part of the shot; a
 * tiny rect is almost certainly a spurious edge, not the negative.
 */
const MIN_AREA_FRACTION = 0.05;

/**
 * Reject crops that are essentially the whole frame (nothing gained) — within
 * this fraction of full width AND height we treat detection as "no useful crop"
 * and skip the manipulator round-trip entirely.
 */
const FULL_FRAME_EPSILON = 0.98;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoCropResult {
  /** `file://` URI to use downstream — the cropped file, or the original. */
  uri: string;
  /** True when an auto-crop was applied; false when we fell back to full-frame. */
  cropped: boolean;
  /** Pixel dimensions of `uri` when known (cropped result), else undefined. */
  width?: number;
  height?: number;
  /** The detection result, surfaced so callers can log / show subtle UI. */
  detection?: FrameDetectionResult;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable, no native calls)
// ---------------------------------------------------------------------------

/** An axis-aligned rectangle in image-pixel space (origin top-left). */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Clamp a detected rect to the image bounds and round to whole pixels, so the
 * native cropper never receives an out-of-range or sub-pixel rectangle (a
 * common cause of manipulator failures / off-by-one black edges).
 */
export function clampRectToImage(
  rect: PixelRect,
  imageWidth: number,
  imageHeight: number,
): PixelRect {
  const x = Math.max(0, Math.min(Math.round(rect.x), imageWidth - 1));
  const y = Math.max(0, Math.min(Math.round(rect.y), imageHeight - 1));
  const width = Math.max(1, Math.min(Math.round(rect.width), imageWidth - x));
  const height = Math.max(1, Math.min(Math.round(rect.height), imageHeight - y));
  return { x, y, width, height };
}

/**
 * Decide whether a detection is trustworthy enough to crop on. Pure + total so
 * it can be unit-tested without the native module. Returns the reason it was
 * rejected (for logging) or `null` when the crop should proceed.
 *
 * `imageWidth`/`imageHeight` may be 0 when the capture path could not report
 * dimensions (e.g. RAW) — in that case we only validate confidence + presence
 * and defer the geometry checks to the manipulator/clamp step.
 */
export function evaluateDetection(
  detection: FrameDetectionResult,
  imageWidth: number,
  imageHeight: number,
): { ok: true; rect: FrameDetectionResult['cropRect'] } | { ok: false; reason: string } {
  if (!detection.found || !detection.cropRect) {
    return { ok: false, reason: 'no-frame' };
  }
  if (detection.confidence < MIN_CONFIDENCE) {
    return { ok: false, reason: `low-confidence(${detection.confidence.toFixed(2)})` };
  }

  const rect = detection.cropRect;
  if (rect.width <= 0 || rect.height <= 0) {
    return { ok: false, reason: 'degenerate-rect' };
  }

  // Geometry checks only when we actually know the image size.
  if (imageWidth > 0 && imageHeight > 0) {
    const areaFraction = (rect.width * rect.height) / (imageWidth * imageHeight);
    if (areaFraction < MIN_AREA_FRACTION) {
      return { ok: false, reason: `too-small(${areaFraction.toFixed(3)})` };
    }
    const coversWholeFrame =
      rect.width >= imageWidth * FULL_FRAME_EPSILON &&
      rect.height >= imageHeight * FULL_FRAME_EPSILON;
    if (coversWholeFrame) {
      return { ok: false, reason: 'full-frame' };
    }
  }

  return { ok: true, rect };
}

// ---------------------------------------------------------------------------
// The crop step
// ---------------------------------------------------------------------------

/**
 * Detect the film frame in `originalUri` and, if confidently found, crop the
 * file to it. Always resolves — on ANY failure it returns the original uri so
 * the capture flow continues unbroken (graceful degradation, task #2).
 *
 * @param originalUri `file://` URI of the freshly-captured negative.
 * @param imageWidth  Capture pixel width (0 if unknown, e.g. RAW). Used only to
 *   validate the detected rect's coverage; geometry checks are skipped when 0.
 * @param imageHeight Capture pixel height (0 if unknown).
 */
export async function autoCropToFilmFrame(
  originalUri: string,
  imageWidth: number,
  imageHeight: number,
): Promise<AutoCropResult> {
  let detection: FrameDetectionResult;
  try {
    detection = await detectFilmFrame(originalUri);
  } catch (err) {
    // Detection itself threw (unsupported, bad file, …) → full-frame fallback.
    if (__DEV__) {
      console.warn('[autoCrop] detectFilmFrame failed, using full frame:', err);
    }
    return { uri: originalUri, cropped: false };
  }

  const verdict = evaluateDetection(detection, imageWidth, imageHeight);
  if (!verdict.ok) {
    if (__DEV__) {
      console.log('[autoCrop] not cropping —', verdict.reason);
    }
    return { uri: originalUri, cropped: false, detection };
  }

  // We have a trustworthy rect. Crop the file. If we don't know the source
  // dimensions we cannot clamp precisely, so fall back to full-frame rather
  // than risk handing the cropper an out-of-bounds rect.
  if (imageWidth <= 0 || imageHeight <= 0) {
    if (__DEV__) {
      console.log('[autoCrop] source dimensions unknown — skipping crop (safe).');
    }
    return { uri: originalUri, cropped: false, detection };
  }

  const rect = clampRectToImage(
    verdict.rect as PixelRect,
    imageWidth,
    imageHeight,
  );

  try {
    // SDK 56 contextual ImageManipulator API: manipulate → crop → render → save.
    // We re-encode JPEG at high quality; the engine reads pixels, not metadata,
    // so a JPEG cache copy is fine here (the ORIGINAL stays untouched on disk).
    const context = ImageManipulator.manipulate(originalUri).crop({
      originX: rect.x,
      originY: rect.y,
      width: rect.width,
      height: rect.height,
    });
    const ref = await context.renderAsync();
    const saved = await ref.saveAsync({ compress: 0.95, format: SaveFormat.JPEG });
    return {
      uri: saved.uri,
      cropped: true,
      width: saved.width,
      height: saved.height,
      detection,
    };
  } catch (err) {
    // Manipulator failed (decode error, OOM, …) → full-frame fallback.
    if (__DEV__) {
      console.warn('[autoCrop] crop failed, using full frame:', err);
    }
    return { uri: originalUri, cropped: false, detection };
  }
}
