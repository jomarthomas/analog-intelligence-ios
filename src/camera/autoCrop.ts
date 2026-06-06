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
 * FALLBACK (must never feed the engine the room):
 *   If detection fails, returns no rect, or is low-confidence, we DO NOT hand
 *   the engine the whole frame (that's the room behind a held-up negative, which
 *   the pipeline can't make a positive from). Instead we crop to a FIXED CENTRE
 *   box — the middle 72% × 72% — so the bright room edges are always excluded and
 *   the film, which the user was coached to centre, is what reaches the engine.
 *   Only if even that fixed crop can't be produced (manipulator throws, unknown
 *   source dimensions) do we fall back HARD to the original uri unchanged, so
 *   capture is never broken.
 *
 *   The chosen path is reported via `cropMode`:
 *     'detected' — cropped to a confidently-detected film rect
 *     'centered' — detection failed, cropped to the fixed centre box
 *     'none'     — hard fallback, returned the original full frame
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

/**
 * Fixed centre-crop size (fraction of each axis) used when detection fails or is
 * low-confidence. A held-up negative is roughly centred (the dimmed lane on the
 * scan screen coaches exactly that), so cropping to the middle 72% reliably
 * drops the bright room edges that would otherwise blow the engine out, while
 * keeping enough margin that we don't clip a reasonably-framed negative. Tuned
 * conservatively: too tight risks cutting the film, too loose lets the room back
 * in. 0.72 keeps the centre and trims 14% off every side.
 */
const CENTERED_CROP_FRACTION = 0.72;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoCropResult {
  /** `file://` URI to use downstream — the cropped file, or the original. */
  uri: string;
  /**
   * True when ANY crop was applied (detected OR centered fallback); false only
   * on the hard full-frame fallback. Equivalent to `cropMode !== 'none'`.
   */
  cropped: boolean;
  /**
   * Which crop path produced `uri`:
   *   'detected' — confidently-detected film rect,
   *   'centered' — fixed centre box (detection failed/low-confidence),
   *   'none'     — original full frame (hard fallback).
   */
  cropMode: CropMode;
  /** Pixel dimensions of `uri` when known (cropped result), else undefined. */
  width?: number;
  height?: number;
  /** The detection result, surfaced so callers can log / show subtle UI. */
  detection?: FrameDetectionResult;
}

/** How `AutoCropResult.uri` was produced. See {@link AutoCropResult.cropMode}. */
export type CropMode = 'detected' | 'centered' | 'none';

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
 * Compute the fixed centre-crop rect (a `fraction`×`fraction` box centred in the
 * image) used as the fallback when detection fails. Pure + total so it's
 * unit-testable. The result is already clamped to whole pixels inside the image,
 * so it can be handed straight to the manipulator.
 *
 * Returns `null` when the image is too small to produce a sane crop (≤ 0 dims),
 * signalling the caller to fall back hard to the original frame.
 */
export function centeredCropRect(
  imageWidth: number,
  imageHeight: number,
  fraction: number = CENTERED_CROP_FRACTION,
): PixelRect | null {
  if (imageWidth <= 0 || imageHeight <= 0) return null;
  // Clamp the fraction defensively so a bad caller can't invert the box.
  const f = Math.max(0.1, Math.min(fraction, 1));
  const rect: PixelRect = {
    x: (imageWidth * (1 - f)) / 2,
    y: (imageHeight * (1 - f)) / 2,
    width: imageWidth * f,
    height: imageHeight * f,
  };
  return clampRectToImage(rect, imageWidth, imageHeight);
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
 * Crop `originalUri` to `rect` via expo-image-manipulator and return the new
 * cache file. Throws on any manipulator failure so the caller can decide the
 * fallback. The ORIGINAL stays untouched on disk; we re-encode a JPEG cache copy
 * (the engine reads pixels, not metadata, so that's fine).
 */
async function cropFileToRect(
  originalUri: string,
  rect: PixelRect,
): Promise<{ uri: string; width: number; height: number }> {
  // SDK 56 contextual ImageManipulator API: manipulate → crop → render → save.
  const context = ImageManipulator.manipulate(originalUri).crop({
    originX: rect.x,
    originY: rect.y,
    width: rect.width,
    height: rect.height,
  });
  const ref = await context.renderAsync();
  const saved = await ref.saveAsync({ compress: 0.95, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/**
 * Detect the film frame in `originalUri` and crop the file to it. Always
 * resolves — and CRUCIALLY, never falls back to the full frame on a normal miss:
 * when detection fails or is low-confidence it crops to a FIXED CENTRE box so the
 * bright room behind a held-up negative is excluded (task #2). The only path that
 * returns the untouched original is the hard fallback where even the centre crop
 * can't be produced (unknown source dims or the manipulator throws), which keeps
 * capture unbroken.
 *
 * @param originalUri `file://` URI of the freshly-captured negative.
 * @param imageWidth  Capture pixel width (0 if unknown, e.g. RAW). Used to
 *   validate the detected rect's coverage AND to size the centre fallback;
 *   when 0 we cannot crop safely and fall back hard to the full frame.
 * @param imageHeight Capture pixel height (0 if unknown).
 */
export async function autoCropToFilmFrame(
  originalUri: string,
  imageWidth: number,
  imageHeight: number,
): Promise<AutoCropResult> {
  let detection: FrameDetectionResult | undefined;
  try {
    detection = await detectFilmFrame(originalUri);
  } catch (err) {
    // Detection itself threw (unsupported, bad file, …). We still want to keep
    // the room out of the engine, so we proceed to the centred-crop fallback
    // below rather than returning the full frame.
    if (__DEV__) {
      console.warn('[autoCrop] detectFilmFrame failed, trying centre crop:', err);
    }
  }

  // --- 1. Confident detection → crop to the detected film rect. ---
  if (detection !== undefined) {
    const verdict = evaluateDetection(detection, imageWidth, imageHeight);
    if (verdict.ok && imageWidth > 0 && imageHeight > 0) {
      const rect = clampRectToImage(verdict.rect as PixelRect, imageWidth, imageHeight);
      try {
        const saved = await cropFileToRect(originalUri, rect);
        return {
          uri: saved.uri,
          cropped: true,
          cropMode: 'detected',
          width: saved.width,
          height: saved.height,
          detection,
        };
      } catch (err) {
        // Detected-crop manipulation failed — fall through to the centre crop.
        if (__DEV__) {
          console.warn('[autoCrop] detected crop failed, trying centre crop:', err);
        }
      }
    } else if (__DEV__ && !verdict.ok) {
      console.log('[autoCrop] no usable detection —', verdict.reason, '→ centre crop');
    }
  }

  // --- 2. Fallback: fixed centre crop so the room edges never reach the engine. ---
  // Needs the source dimensions to size the box; without them we can't crop safely.
  const centerRect = centeredCropRect(imageWidth, imageHeight);
  if (centerRect !== null) {
    try {
      const saved = await cropFileToRect(originalUri, centerRect);
      if (__DEV__) {
        console.log('[autoCrop] applied centred fallback crop', centerRect);
      }
      return {
        uri: saved.uri,
        cropped: true,
        cropMode: 'centered',
        width: saved.width,
        height: saved.height,
        detection,
      };
    } catch (err) {
      // Even the centre crop failed (decode error, OOM, …) → hard full-frame fallback.
      if (__DEV__) {
        console.warn('[autoCrop] centre crop failed, using full frame:', err);
      }
    }
  } else if (__DEV__) {
    console.log('[autoCrop] source dimensions unknown — using full frame (safe).');
  }

  // --- 3. Hard fallback: original, untouched. Capture is never broken. ---
  return { uri: originalUri, cropped: false, cropMode: 'none', detection };
}
