/**
 * src/processing/defaults.ts
 *
 * Neutral default ProcessParams, faithful to the legacy Swift
 * UserAdjustments.Parameters defaults (all sliders at 0, colour mode,
 * orange-mask removal on, sharpen at 0.5).
 *
 * Legacy source: legacy-ios/Processing/Pipeline/UserAdjustments.swift
 *   struct Parameters — all fields initialise to 0.0 except sharpen which
 *   the pipeline applies at a midpoint (0.5) to match legacy export behaviour.
 *
 * IMPORTANT: storage/models.ts also exports DEFAULT_PROCESS_PARAMS as a
 * ProcessParamsSnapshot. The values here are intentionally identical.
 * Use this file within src/processing/; use the storage one from storage/.
 */

import type { FullProcessParams } from './types';

/**
 * Neutral (identity) full process params for a new colour-negative frame.
 *
 * Slider ranges:
 *   exposure:   -2.0...+2.0 EV       → 0 = no change
 *   warmth:     -1.0...+1.0          → 0 = neutral (6500K)
 *   contrast:   -1.0...+1.0          → 0 = no change
 *   saturation: -1.0...+1.0          → undefined = use native default (0)
 *   highlights: -1.0...+1.0          → undefined = use native default (0)
 *   shadows:    -1.0...+1.0          → undefined = use native default (0)
 *   vibrance:   -1.0...+1.0          → undefined = use native default (0)
 *   sharpen:    0.0...1.0            → 0.5 (matches legacy export midpoint)
 *
 * Mode defaults:
 *   mode: 'color'           — C-41 negative path
 *   removeOrangeMask: true  — enabled by default for colour negatives
 *   aiColor: false          — Phase-3 Pro hook, off by default
 *   aiDustRemoval: false    — Phase-3 Pro hook, off by default
 */
export const DEFAULT_FULL_PROCESS_PARAMS: Readonly<FullProcessParams> = {
  exposure: 0,
  warmth: 0,
  contrast: 0,
  mode: 'color',
  removeOrangeMask: true,
  sharpen: 0.5,
  // Fine adjustments omitted (undefined → native defaults to 0)
  saturation: undefined,
  highlights: undefined,
  shadows: undefined,
  vibrance: undefined,
  // AI hooks off
  aiColor: false,
  aiDustRemoval: false,
  // No crop or rotation
  cropRect: undefined,
  rotationDegrees: undefined,
} as const;

/**
 * Default params for a black-and-white negative frame.
 * Orange-mask removal is disabled (N/A for B&W); sharpen is the same midpoint.
 */
export const DEFAULT_BW_PROCESS_PARAMS: Readonly<FullProcessParams> = {
  ...DEFAULT_FULL_PROCESS_PARAMS,
  mode: 'bw',
  removeOrangeMask: false,
} as const;

/**
 * The parameter ranges, useful for clamping slider values in the UI.
 * These are fixed by the native pipeline contract.
 */
export const PARAM_RANGES = {
  exposure: { min: -2.0, max: 2.0, step: 0.1 },
  warmth: { min: -1.0, max: 1.0, step: 0.05 },
  contrast: { min: -1.0, max: 1.0, step: 0.05 },
  saturation: { min: -1.0, max: 1.0, step: 0.05 },
  highlights: { min: -1.0, max: 1.0, step: 0.05 },
  shadows: { min: -1.0, max: 1.0, step: 0.05 },
  vibrance: { min: -1.0, max: 1.0, step: 0.05 },
  sharpen: { min: 0.0, max: 1.0, step: 0.05 },
} as const satisfies Record<string, { min: number; max: number; step: number }>;

/**
 * Clamp a numeric param value to its allowed range.
 */
export function clampParam(
  key: keyof typeof PARAM_RANGES,
  value: number,
): number {
  const { min, max } = PARAM_RANGES[key];
  return Math.min(Math.max(value, min), max);
}
