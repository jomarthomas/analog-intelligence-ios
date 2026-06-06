/**
 * src/camera/invertMatrix.ts
 *
 * Pure colour-matrix maths for the LIVE INVERTED PREVIEW (the headline framing
 * feature). While the user aligns a film negative we draw the live preview as a
 * rough POSITIVE so they can see what they are scanning — invert the negative
 * and knock back the orange film base so it reads naturally.
 *
 * This is intentionally a small, framework-agnostic, side-effect-free module so
 * it is trivially testable and shared between the overlay component and any
 * future GPU path. It does NOT import Skia or React — it only produces the 4x5
 * matrix that `@shopify/react-native-skia`'s `<ColorMatrix>` consumes.
 *
 * IMPORTANT — this is a *preview approximation only*. The authoritative
 * negative -> positive conversion (per-channel film-base sampling, density
 * inversion, tone/colour correction) runs on CAPTURE in the processing pipeline
 * / native module. Here we only need the preview to LOOK like a positive so the
 * user can frame and fill the lane. ~4-8 fps, "close enough" colour.
 *
 * ── Skia ColorMatrix semantics ────────────────────────────────────────────
 * A Skia colour matrix is a row-major 4x5 array [a..t] applied per pixel as:
 *
 *   R' = a*R + b*G + c*B + d*A + e
 *   G' = f*R + g*G + h*B + i*A + j
 *   B' = k*R + l*G + m*B + n*A + o
 *   A' = p*R + q*G + r*B + s*A + t
 *
 * In react-native-skia the channels AND the translation column (e/j/o/t) are in
 * normalised 0..1 units (NOT 0..255). Outputs are clamped to [0,1] by Skia.
 *
 * ── How we build each colour row ──────────────────────────────────────────
 * For an input channel value `x` (0..1) we compose three steps per channel:
 *   1. invert:            v = 1 - x
 *   2. per-channel gain:  v = gain * v        (orange-mask correction)
 *   3. mild contrast:     v = c*(v - 0.5) + 0.5   (about mid-grey)
 *
 * Folding 1-3 into the linear form `out = m*x + t` gives:
 *   m (diagonal) = -gain * c
 *   t (translate) =  gain * c + 0.5 - 0.5*c
 *
 * The orange film base is warm, so a straight invert leaves the image too cool
 * (cyan/blue). We counter that by boosting the red gain and cutting the blue
 * gain; green is the reference. A small contrast lift compensates for the low
 * inherent contrast of a colour negative. These are deliberately gentle — the
 * goal is "recognisable positive", not a finished scan.
 */

/**
 * Tunable parameters for the preview invert + orange-mask correction.
 * All values are gentle on purpose (see file header). Exposed so the look can
 * be adjusted in one place without touching the matrix maths.
 */
export interface InvertPreviewParams {
  /** Red channel gain after inversion. >1 warms the image (counters cyan cast). */
  readonly redGain: number;
  /** Green channel gain after inversion (reference channel, ~1). */
  readonly greenGain: number;
  /** Blue channel gain after inversion. <1 removes the residual blue cast. */
  readonly blueGain: number;
  /** Contrast about mid-grey. 1 = unchanged; >1 adds punch to the flat negative. */
  readonly contrast: number;
}

/**
 * Default look for the live positive preview.
 *
 * Derived empirically to roughly neutralise the C-41 orange mask:
 *   • red boosted (+20%) to restore warmth lost when inverting the orange base,
 *   • blue cut (-15%) to drop the leftover blue cast,
 *   • a mild contrast lift (+10%) because colour negatives are inherently flat.
 *
 * These are approximate framing aids — the capture pipeline does the precise,
 * per-frame film-base sampling.
 */
export const DEFAULT_INVERT_PREVIEW_PARAMS: InvertPreviewParams = {
  redGain: 1.2,
  greenGain: 1.0,
  blueGain: 0.85,
  contrast: 1.1,
};

/**
 * Build the diagonal coefficient + translation for one colour channel from a
 * gain and contrast, folding invert -> gain -> contrast into `out = m*x + t`.
 */
function channelRow(gain: number, contrast: number): { m: number; t: number } {
  // out = c*(gain*(1 - x) - 0.5) + 0.5
  //     = (-gain*c) * x  +  (gain*c + 0.5 - 0.5*c)
  const m = -gain * contrast;
  const t = gain * contrast + 0.5 - 0.5 * contrast;
  return { m, t };
}

/**
 * Produce the 4x5 (length-20) Skia colour matrix that inverts a film negative
 * and roughly corrects the orange mask, ready to hand to `<ColorMatrix>`.
 *
 * Alpha is passed through unchanged (row = [0,0,0,1,0]) so the preview stays
 * fully opaque and covers the real camera view beneath it.
 *
 * @param params Optional override of the gains/contrast (defaults to
 *               {@link DEFAULT_INVERT_PREVIEW_PARAMS}).
 * @returns A new `number[]` of length 20. Always returns a fresh array so React
 *          treats it as a stable, owned value.
 */
export function buildInvertPreviewMatrix(
  params: InvertPreviewParams = DEFAULT_INVERT_PREVIEW_PARAMS,
): number[] {
  const r = channelRow(params.redGain, params.contrast);
  const g = channelRow(params.greenGain, params.contrast);
  const b = channelRow(params.blueGain, params.contrast);

  // Row-major 4x5. Off-diagonal colour-mix terms are 0: we treat the channels
  // independently for this preview approximation (no cross-channel matrixing).
  return [
    r.m, 0, 0, 0, r.t, // R' = r.m * R + r.t
    0, g.m, 0, 0, g.t, // G' = g.m * G + g.t
    0, 0, b.m, 0, b.t, // B' = b.m * B + b.t
    0, 0, 0, 1, 0, // A' = A   (preserve opacity)
  ];
}

/**
 * Pre-computed default matrix, so the common case allocates the array once at
 * module load instead of on every render of the overlay.
 */
export const INVERT_PREVIEW_MATRIX: readonly number[] = buildInvertPreviewMatrix();
