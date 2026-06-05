/**
 * src/monetization/resolutionLimiter.ts
 *
 * Clamps export dimensions for free-tier users.
 * Port of legacy ResolutionLimiter.swift — logic is identical; Swift CGSize
 * is replaced with a plain { width, height } object so this module has zero
 * native dependencies and is fully testable in JS.
 *
 * Public API
 * ──────────
 *   clampResolution(size)          → size  (clamped or original)
 *   getResolutionInfo(size)        → ResolutionInfo
 *   wouldBeLimited(size)           → boolean
 *   formatResolution(size)         → "1920x1080"
 *   formatMegapixels(size)         → "2.1 MP"
 *   FREE_MAX_RESOLUTION            → { width: 1920, height: 1080 }
 *   PRO_MAX_RESOLUTION             → { width: 7680, height: 4320 }
 */

import { canAccessProFeatures } from '@/storage/preferences';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A 2D size — mirrors CGSize without any native dependency. */
export type Size = {
  width: number;
  height: number;
};

/**
 * Full resolution report for an image.
 * Mirrors the legacy ResolutionInfo struct.
 */
export type ResolutionInfo = {
  /** Original image size before any clamping. */
  originalSize: Size;
  /** Maximum allowed size for the user's tier. */
  maxAllowedSize: Size;
  /** Final export size (may equal originalSize if no clamping needed). */
  finalSize: Size;
  /** True when the image will be downscaled due to tier limits. */
  willBeLimited: boolean;
  /** True when the user has Pro. */
  isPro: boolean;
  /** User-friendly multi-line description. */
  description: string;
  /** Short one-liner (for inline badges). */
  shortDescription: string;
};

// ---------------------------------------------------------------------------
// Constants (match legacy ResolutionLimiter.swift exactly)
// ---------------------------------------------------------------------------

/** Maximum export resolution for free-tier users (HD — 1920 × 1080). */
export const FREE_MAX_RESOLUTION: Size = { width: 1920, height: 1080 };

/**
 * Maximum resolution for Pro users (effectively unlimited — 8K).
 * Used as an upper cap only; actual image dimensions may be smaller.
 */
export const PRO_MAX_RESOLUTION: Size = { width: 7680, height: 4320 };

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the target size that fits within `maxSize`, maintaining the
 * original aspect ratio.  If both dimensions already fit, returns
 * `originalSize` unchanged.
 */
export function calculateTargetSize(originalSize: Size, maxSize: Size): Size {
  const widthRatio = maxSize.width / originalSize.width;
  const heightRatio = maxSize.height / originalSize.height;
  const ratio = Math.min(widthRatio, heightRatio);

  if (ratio >= 1) {
    // Image already fits — no scaling needed.
    return originalSize;
  }

  return {
    width: Math.round(originalSize.width * ratio),
    height: Math.round(originalSize.height * ratio),
  };
}

/** Format a size as "1920x1080". */
export function formatResolution(size: Size): string {
  return `${Math.round(size.width)}x${Math.round(size.height)}`;
}

/** Format a size as "2.1 MP". */
export function formatMegapixels(size: Size): string {
  const mp = (size.width * size.height) / 1_000_000;
  return `${mp.toFixed(1)} MP`;
}

// ---------------------------------------------------------------------------
// Tier-aware helpers
// ---------------------------------------------------------------------------

/**
 * Returns the maximum export resolution for the current user tier.
 * Reads Pro status from the MMKV cache synchronously (no network call).
 */
export function maxAllowedResolution(): Size {
  return canAccessProFeatures() ? PRO_MAX_RESOLUTION : FREE_MAX_RESOLUTION;
}

/**
 * Returns true if `size` exceeds the user's tier-allowed maximum.
 */
export function wouldBeLimited(size: Size): boolean {
  const max = maxAllowedResolution();
  return size.width > max.width || size.height > max.height;
}

/**
 * Clamp `size` to the tier-appropriate maximum, maintaining aspect ratio.
 * Pro users receive the original size unchanged (no 8K cap in practice).
 *
 * Use this in the export pipeline before passing dimensions to
 * expo-image-manipulator or the native module.
 */
export function clampResolution(size: Size): Size {
  if (!wouldBeLimited(size)) return size;
  return calculateTargetSize(size, maxAllowedResolution());
}

/**
 * Build a full ResolutionInfo report for a given image size.
 * Useful for surfacing resolution information in the export sheet UI.
 */
export function getResolutionInfo(originalSize: Size): ResolutionInfo {
  const isPro = canAccessProFeatures();
  const maxAllowed = maxAllowedResolution();
  const willBeLimited = wouldBeLimited(originalSize);
  const finalSize = willBeLimited
    ? calculateTargetSize(originalSize, maxAllowed)
    : originalSize;

  let description: string;
  let shortDescription: string;

  if (isPro) {
    description = `Exporting at full resolution: ${formatResolution(finalSize)} (${formatMegapixels(finalSize)})`;
    shortDescription = formatResolution(finalSize);
  } else if (willBeLimited) {
    description =
      `Free tier export limited to ${formatResolution(maxAllowed)}. ` +
      `Original: ${formatResolution(originalSize)}. ` +
      `Upgrade to Pro for full resolution.`;
    shortDescription = `Limited to HD (Upgrade for full resolution)`;
  } else {
    description = `Exporting at ${formatResolution(finalSize)} (${formatMegapixels(finalSize)})`;
    shortDescription = formatResolution(finalSize);
  }

  return {
    originalSize,
    maxAllowedSize: maxAllowed,
    finalSize,
    willBeLimited,
    isPro,
    description,
    shortDescription,
  };
}

/**
 * Human-readable description of the current resolution limit.
 * Matches legacy ResolutionLimiter.resolutionLimitDescription().
 */
export function resolutionLimitDescription(): string {
  return canAccessProFeatures()
    ? 'Full Resolution (up to 8K)'
    : `Limited to ${formatResolution(FREE_MAX_RESOLUTION)} (HD)`;
}
