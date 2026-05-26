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
 *
 * Slide / E-6 (legacy `FilmType.slide`) is intentionally omitted from the
 * cross-platform contract for the MVP; it can be added additively later.
 */
export type FilmMode = 'color' | 'bw';

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

  /** Film mode — see {@link FilmMode}. */
  mode: FilmMode;

  /**
   * When true (and `mode === 'color'`) run the orange-mask estimation +
   * removal stage (legacy `OrangeMaskEstimator`). Ignored for `bw`.
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
