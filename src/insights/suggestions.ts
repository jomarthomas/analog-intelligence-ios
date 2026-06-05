/**
 * src/insights/suggestions.ts
 *
 * Turns a live luma histogram into ONE actionable edit suggestion the user can
 * apply with a single tap ("Shadows are clipping — lift them"). Competitors show
 * a histogram; none turn it into a one-tap fix.
 *
 * Pure + deterministic so it's trivially testable and cheap to run on every
 * preview update.
 */

import type { FullProcessParams } from '@/processing';

/** The slider offsets an applied suggestion adds to the current adjustments. */
export type SuggestionPatch = Partial<
  Pick<
    FullProcessParams,
    'exposure' | 'warmth' | 'contrast' | 'saturation' | 'highlights' | 'shadows' | 'vibrance'
  >
>;

export interface AdjustSuggestion {
  /** Stable id (also used to de-dupe repeat suggestions). */
  id: string;
  /** Short, plain-language recommendation shown on the chip. */
  title: string;
  /** Offsets applied (added to current params, clamped) when accepted. */
  patch: SuggestionPatch;
}

type LumaStats = {
  meanLuminance: number; // 0..1
  shadowClip: number; // fraction in the bottom tail
  highlightClip: number; // fraction in the top tail
  /** Fraction of the tonal range actually occupied (contrast proxy). */
  occupiedRange: number;
};

/** Derive summary stats from a 256-bin (normalised) luma histogram. */
export function lumaStats(luma: number[]): LumaStats | null {
  const bins = luma.length;
  if (bins < 16) return null;

  const tail = Math.max(1, Math.floor(bins * 0.02)); // ~2% tails
  let total = 0;
  let weighted = 0;
  let shadow = 0;
  let highlight = 0;
  let lo = -1;
  let hi = -1;
  const occupancyFloor = 1 / (bins * 50); // ignore negligible bins

  for (let i = 0; i < bins; i += 1) {
    const v = luma[i] ?? 0;
    total += v;
    weighted += (i / (bins - 1)) * v;
    if (i < tail) shadow += v;
    if (i >= bins - tail) highlight += v;
    if (v > occupancyFloor) {
      if (lo < 0) lo = i;
      hi = i;
    }
  }

  if (total <= 0) return null;
  const occupiedRange = lo < 0 ? 0 : (hi - lo) / (bins - 1);

  return {
    meanLuminance: weighted / total,
    shadowClip: shadow / total,
    highlightClip: highlight / total,
    occupiedRange,
  };
}

/**
 * Suggest a single most-impactful fix, or null when the frame already looks
 * well-balanced. Ordered by severity.
 */
export function suggestFromLuma(luma: number[] | undefined | null): AdjustSuggestion | null {
  if (!luma) return null;
  const s = lumaStats(luma);
  if (s == null) return null;

  if (s.shadowClip > 0.06 && s.meanLuminance < 0.45) {
    return {
      id: 'lift-shadows',
      title: 'Shadows are clipping — lift them',
      patch: { shadows: 0.3, exposure: 0.12 }
    };
  }
  if (s.highlightClip > 0.06 && s.meanLuminance > 0.55) {
    return {
      id: 'recover-highlights',
      title: 'Highlights are clipping — recover them',
      patch: { highlights: -0.3 }
    };
  }
  if (s.meanLuminance < 0.32) {
    return {
      id: 'brighten',
      title: 'Looks underexposed — brighten',
      patch: { exposure: 0.3, shadows: 0.15 }
    };
  }
  if (s.meanLuminance > 0.72) {
    return {
      id: 'pull-back',
      title: 'Looks bright — pull it back',
      patch: { exposure: -0.25, highlights: -0.15 }
    };
  }
  if (s.occupiedRange < 0.55) {
    return {
      id: 'add-contrast',
      title: 'Looks flat — add contrast',
      patch: { contrast: 0.22, vibrance: 0.1 }
    };
  }
  return null;
}
