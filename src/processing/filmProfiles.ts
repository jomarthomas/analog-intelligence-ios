/**
 * src/processing/filmProfiles.ts
 *
 * Film-stock & lab-scanner "looks" — the feature that makes scans read like a
 * professional lab render rather than a flat snapshot (cf. Negative Lab Pro's
 * Frontier/Noritsu profiles, which are the reason photographers pay for it).
 *
 * Each profile is a small set of offsets applied to the SEVEN user-adjustment
 * sliders the native engine already supports (exposure / warmth / contrast /
 * saturation / highlights / shadows / vibrance). They are applied AFTER the
 * automatic invert + orange-mask + tone-curve, so they shape the final look.
 *
 * NOTE (v1): these are slider-based approximations. True per-stock colour
 * emulation (Frontier/Noritsu, Portra/Gold/Ektar response curves) would use 3D
 * LUTs / per-channel curves baked from reference scans. The profile registry is
 * structured so a future `lut?: string` field can carry a real LUT without
 * changing call sites — see the TODO at the bottom.
 */

import type { FullProcessParams } from './types';
import { clampParam } from './defaults';

/** The adjustment fields a profile may set (offsets; omitted = unchanged). */
export type ProfileParams = Partial<
  Pick<
    FullProcessParams,
    'exposure' | 'warmth' | 'contrast' | 'saturation' | 'highlights' | 'shadows' | 'vibrance'
  >
>;

export type FilmProfileGroup = 'look' | 'film';

export interface FilmProfile {
  /** Stable id persisted with the frame. */
  id: string;
  /** Display name. */
  name: string;
  /** Grouping for the picker UI. */
  group: FilmProfileGroup;
  /** Short one-line description shown under the name. */
  hint: string;
  /** Slider offsets that define the look. */
  params: ProfileParams;
}

/** The identity profile — no look applied. */
export const NEUTRAL_PROFILE_ID = 'natural';

/**
 * The profile registry. Ordered for display: Natural first, then everyday
 * "looks", then lab-scanner / film-stock emulations.
 */
export const FILM_PROFILES: readonly FilmProfile[] = [
  { id: 'natural', name: 'Natural', group: 'look', hint: 'No look — the corrected scan', params: {} },
  { id: 'bright', name: 'Bright', group: 'look', hint: 'Lifted, airy', params: { exposure: 0.3, highlights: 0.1, shadows: 0.15 } },
  { id: 'warm', name: 'Warm', group: 'look', hint: 'Golden cast', params: { warmth: 0.25, saturation: 0.05 } },
  { id: 'cool', name: 'Cool', group: 'look', hint: 'Cooler, blue', params: { warmth: -0.25 } },
  { id: 'punchy', name: 'Punchy', group: 'look', hint: 'Bold contrast & colour', params: { contrast: 0.25, saturation: 0.2, vibrance: 0.15 } },
  { id: 'muted', name: 'Muted', group: 'look', hint: 'Soft, low saturation', params: { saturation: -0.25, contrast: -0.1 } },
  { id: 'vintage', name: 'Vintage', group: 'look', hint: 'Faded, lifted blacks', params: { warmth: 0.15, contrast: -0.15, saturation: -0.15, highlights: -0.1, shadows: 0.2 } },
  // ── Lab-scanner & film-stock emulations ──
  { id: 'frontier', name: 'Frontier', group: 'film', hint: 'Fuji lab — warm golds, teal shadows', params: { warmth: 0.18, contrast: 0.12, saturation: 0.1, highlights: -0.08, shadows: 0.12, vibrance: 0.1 } },
  { id: 'noritsu', name: 'Noritsu', group: 'film', hint: 'Fuji lab — neutral, crisp', params: { warmth: -0.05, contrast: 0.1, saturation: 0.08, highlights: -0.05 } },
  { id: 'portra', name: 'Portra', group: 'film', hint: 'Soft warm pastel skin tones', params: { warmth: 0.12, contrast: -0.05, saturation: -0.05, highlights: -0.05, shadows: 0.08, vibrance: 0.05 } },
  { id: 'gold', name: 'Gold', group: 'film', hint: 'Warm, saturated, nostalgic', params: { warmth: 0.22, contrast: 0.1, saturation: 0.18, vibrance: 0.1 } },
  { id: 'ektar', name: 'Ektar', group: 'film', hint: 'Vivid, high-contrast colour', params: { contrast: 0.2, saturation: 0.25, vibrance: 0.2 } },
];

const PROFILE_BY_ID = new Map(FILM_PROFILES.map((p) => [p.id, p]));

/** Look up a profile by id (undefined if unknown). */
export function getFilmProfile(id: string | undefined | null): FilmProfile | undefined {
  return id == null ? undefined : PROFILE_BY_ID.get(id);
}

/**
 * Apply a film profile's offsets on top of base params, clamped to slider
 * ranges. Returns a new params object; unknown / neutral ids return the base
 * unchanged. Offsets ADD to any existing user adjustment so a profile and a
 * manual tweak compose predictably.
 */
export function applyFilmProfile(
  base: FullProcessParams,
  profileId: string | undefined | null,
): FullProcessParams {
  const profile = getFilmProfile(profileId);
  if (profile == null || profile.id === NEUTRAL_PROFILE_ID) return base;

  const add = (key: keyof ProfileParams, baseVal: number | undefined): number =>
    clampParam(key, (baseVal ?? 0) + (profile.params[key] ?? 0));

  return {
    ...base,
    exposure: add('exposure', base.exposure),
    warmth: add('warmth', base.warmth),
    contrast: add('contrast', base.contrast),
    saturation: add('saturation', base.saturation),
    highlights: add('highlights', base.highlights),
    shadows: add('shadows', base.shadows),
    vibrance: add('vibrance', base.vibrance),
  };
}

// TODO(film-emulation): replace the slider approximations above with real 3D
// LUTs (.cube) baked from reference Frontier/Noritsu/Portra scans. Add an
// optional `lut?: string` to FilmProfile and a native `applyLut` step; the
// engine would sample the LUT after the tone curve. Slider offsets remain the
// fallback when a LUT isn't bundled.
