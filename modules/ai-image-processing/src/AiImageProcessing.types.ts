/**
 * AiImageProcessing — shared TypeScript contract.
 *
 * This file is the SHARED CONTRACT that the Pipeline workstream
 * (`src/processing/`) depends on. Treat every exported type as an API:
 * additive (optional) changes only; coordinate breaking changes via the
 * orchestrator.
 *
 * The shapes here map 1:1 onto the proven legacy iOS pipeline
 * (`legacy-ios/Processing/Pipeline/*`). See the per-field doc comments for
 * the exact legacy source each parameter drives.
 */

/**
 * Film processing mode.
 *
 * - `color` → C-41 colour negative path (legacy `FilmType.colorNegative`):
 *   invert → estimate + remove orange mask → normalize → tone curve.
 * - `bw`    → black & white negative path (legacy `FilmType.blackAndWhite`):
 *   invert → (orange-mask step skipped) → normalize → tone curve, then the
 *   final image is desaturated so colour casts from the source are removed.
 * - `slide` → E-6 / reversal positive path (legacy `FilmType.slide`). The
 *   source is ALREADY a positive, so the pipeline SKIPS inversion AND
 *   orange-mask removal, and replaces the negative-oriented gray-world +
 *   aggressive auto-tone-curve stages with a single gentle normalization.
 *   The flow is: linearize → (no invert, no mask) → gentle normalize → user
 *   adjustments → sharpen → encode. `removeOrangeMask` is ignored when
 *   `mode === 'slide'`. Implemented identically on iOS (Core Image) and
 *   Android (per-pixel). `color` / `bw` behaviour is unchanged.
 */
export type FilmMode = 'color' | 'bw' | 'slide';

/**
 * User-facing processing parameters.
 *
 * `exposure`, `warmth`, `contrast` correspond directly to the legacy
 * `UserAdjustments.Parameters` sliders (TECHNICAL_SPECIFICATION §2.5). The
 * auto stages (orange mask, channel normalization, tone curve) run before
 * these and are controlled by `mode` / `removeOrangeMask`.
 */
export interface ProcessParams {
  /**
   * Exposure in EV. Range −2.0…+2.0. Drives `CIExposureAdjust` /
   * the Android exposure gain (legacy `UserAdjustments.applyExposure`).
   * 0 = no change.
   */
  exposure: number;

  /**
   * Warmth. Range −1.0 (cool/blue) … +1.0 (warm/orange). Mapped to a colour
   * temperature 4500K…8500K via `CITemperatureAndTint`
   * (legacy `UserAdjustments.applyWarmth`). 0 = neutral.
   */
  warmth: number;

  /**
   * Contrast. Range −1.0 (flat) … +1.0 (punchy). Mapped to a 0.5…1.5
   * multiplier via `CIColorControls`/`CIContrast`
   * (legacy `UserAdjustments.applyContrast`). 0 = no change.
   */
  contrast: number;

  /** Film mode — see {@link FilmMode}. Accepts `color`, `bw`, or `slide`. */
  mode: FilmMode;

  /**
   * When true (and `mode === 'color'`) run the orange-mask estimation +
   * removal stage (legacy `OrangeMaskEstimator`). Ignored for `bw` and for
   * `slide` (a slide is already a positive with no orange mask).
   */
  removeOrangeMask: boolean;

  /**
   * Output sharpening amount. Range 0.0…1.0, fed to `CISharpenLuminance`
   * (legacy `ImageProcessor.applySharpen`). 0 disables sharpening.
   */
  sharpen: number;

  /**
   * Phase-3 AI colour reconstruction hook. Currently a no-op flag forwarded
   * to native so the Pipeline/Pro gating can be wired ahead of the model.
   * Defaults to false when omitted.
   */
  aiColor?: boolean;

  /**
   * Phase-3 AI dust/scratch removal hook. Currently a no-op flag forwarded to
   * native. Defaults to false when omitted.
   */
  aiDustRemoval?: boolean;

  /**
   * Optional cap on the longer edge (in pixels) of the image the engine
   * processes. When set and the source's longer edge exceeds it, the source is
   * downscaled (aspect-preserving) BEFORE the heavy per-pixel passes.
   *
   * This is the **live-preview fast path**: the JS layer can pass a small value
   * (e.g. 1024–2048) to make `processNegative` run an order of magnitude
   * cheaper and avoid out-of-memory on large captures, then re-run at full
   * resolution (omit this field) when committing the final render.
   *
   * - **Android** allocates three full-resolution `FloatArray`s, so a big
   *   capture is a real OOM risk; downscaling here removes it.
   * - **iOS** Core Image is GPU-tiled, so it honours this with a Lanczos scale
   *   when set; omitting it is always safe.
   *
   * Omitted/0/negative ⇒ full-resolution processing (unchanged default).
   */
  maxDimension?: number;

  // --- Additive, optional fine adjustments (faithful to legacy sliders) ---
  // These are OPTIONAL extensions to the core contract. They default to 0 and
  // map to the remaining `UserAdjustments.Parameters` fields. Callers that
  // only use the core five fields above are unaffected.

  /** Saturation −1.0…+1.0 (legacy `UserAdjustments.applySaturation`). */
  saturation?: number;
  /** Highlights −1.0…+1.0 (legacy `UserAdjustments.applyHighlightsShadows`). */
  highlights?: number;
  /** Shadows −1.0…+1.0 (legacy `UserAdjustments.applyHighlightsShadows`). */
  shadows?: number;
  /** Vibrance −1.0…+1.0 (legacy `UserAdjustments.applyVibrance`). */
  vibrance?: number;
}

/**
 * Result of {@link processNegative}. The processed positive is written to a
 * file in the app cache directory and the URI is returned (mirrors how
 * `expo-image-manipulator` returns saved files).
 */
export interface ProcessResult {
  /** `file://` URI of the rendered positive (JPEG). */
  uri: string;
  /** Output pixel width. */
  width: number;
  /** Output pixel height. */
  height: number;
}

/**
 * Histogram for the live histogram / Insights features.
 *
 * Each channel array has 256 normalized bins (sum ≈ 1.0). Luma uses ITU-R
 * BT.709 weights (legacy `HistogramAnalyzer`). Clip percentages are the
 * fraction of pixels in the bottom/top 5% of the luma range
 * (legacy `HistogramAnalyzer.analyzeClipping`), expressed as 0–100.
 */
export interface Histogram {
  /** Red channel, 256 normalized bins. */
  r: number[];
  /** Green channel, 256 normalized bins. */
  g: number[];
  /** Blue channel, 256 normalized bins. */
  b: number[];
  /** Luminance channel (BT.709), 256 normalized bins. */
  luma: number[];
  /** Percent of pixels clipped into shadows (0–100). */
  shadowClipPct: number;
  /** Percent of pixels clipped into highlights (0–100). */
  highlightClipPct: number;
}

// ---------------------------------------------------------------------------
// Task #10 additions — additive only, do not touch the types above.
// ---------------------------------------------------------------------------

/**
 * User-facing adjustment parameters for the live Adjust-screen fast path.
 *
 * This is the subset of {@link ProcessParams} that `applyUserAdjustments`
 * accepts. It covers the seven sliders that are interactive on the Adjust
 * screen. The pipeline stages that precede user adjustments (linearise →
 * invert → orange-mask → normalise → tone-curve) are intentionally absent;
 * `applyUserAdjustments` operates on an already-processed positive and
 * skips all of those.
 *
 * All fields are optional and default to 0 (no change) on both platforms,
 * matching the defaults in {@link ProcessParams}.
 */
export interface UserAdjustParams {
  /** Exposure in EV. Range −2.0…+2.0. Default 0. */
  exposure?: number;
  /** Warmth −1.0…+1.0 (cool → warm). Default 0. */
  warmth?: number;
  /** Contrast −1.0…+1.0. Default 0. */
  contrast?: number;
  /** Saturation −1.0…+1.0. Default 0. */
  saturation?: number;
  /** Highlights −1.0…+1.0. Default 0. */
  highlights?: number;
  /** Shadows −1.0…+1.0. Default 0. */
  shadows?: number;
  /** Vibrance −1.0…+1.0. Default 0. */
  vibrance?: number;
}

/**
 * A 2-D point in image-pixel coordinates (origin top-left).
 * Ported from `FrameDetector.convertToImageCoordinates` which converts
 * Vision's normalized bottom-left origin to pixel space top-left origin.
 */
export interface FramePoint {
  x: number;
  y: number;
}

/**
 * Result of {@link detectFilmFrame}.
 *
 * When `found` is `true` the quad corners (pixel coordinates, origin
 * top-left) and an axis-aligned `cropRect` are populated. `confidence`
 * is always present (0.0–1.0); on Android where the heuristic cannot
 * produce a result it will be 0.
 *
 * Ported from `legacy-ios/Vision/FrameDetector.swift`:
 *   - Quad corners map to `VNRectangleObservation.topLeft/topRight/
 *     bottomLeft/bottomRight` converted via `convertToImageCoordinates`.
 *   - `cropRect` maps to `getBoundingRect`.
 *   - `confidence` maps to `VNRectangleObservation.confidence`.
 */
export interface FrameDetectionResult {
  /** Whether a film-frame rectangle was found. */
  found: boolean;
  /**
   * The four corner points of the detected quadrilateral, in image-pixel
   * coordinates (origin top-left). Present only when `found` is true.
   */
  quad?: {
    topLeft: FramePoint;
    topRight: FramePoint;
    bottomLeft: FramePoint;
    bottomRight: FramePoint;
  };
  /**
   * Axis-aligned bounding rectangle of the detected frame, in image-pixel
   * coordinates. Derived from `quad` when present; undefined otherwise.
   */
  cropRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /**
   * Detection confidence in [0, 1]. Maps to `VNRectangleObservation.confidence`
   * on iOS. On Android it is a normalized score from the luminance-edge
   * heuristic (border-vs-interior edge energy): a value in (0, 1] when a frame
   * is found, and exactly 0 when none is (`found: false`). It is therefore not
   * directly comparable to the iOS Vision confidence — treat it as a relative
   * quality hint, not a probability. See the TODO in the Kotlin source.
   */
  confidence: number;
}

/**
 * Supported export formats for {@link processNegative} (via the `exportFormat`
 * field, if added to {@link ProcessParams} in a future additive change).
 *
 * - `'jpeg'` — default; supported on both platforms.
 * - `'heic'` — High Efficiency Image Container; supported on both platforms
 *   (Android API ≥ 28 / Heif encoder present). Falls back to JPEG if the
 *   hardware encoder is unavailable.
 * - `'dng'`  — Adobe Digital Negative (RAW); iOS only. On Android the native
 *   module throws `UNSUPPORTED_FORMAT` (see DECISIONS Q2). The Pipeline layer
 *   is expected to catch that error and fall back to HEIC/JPEG, surfacing a
 *   one-time user note.
 *
 * The string union is exported here so the Pipeline workstream can use it for
 * Pro-gating and the format-picker UI without importing from an unrelated file.
 */
export type ExportFormat = 'jpeg' | 'heic' | 'dng';
