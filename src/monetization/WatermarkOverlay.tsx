/**
 * src/monetization/WatermarkOverlay.tsx
 *
 * Free-tier watermark overlay.  Renders a centered "ANALOG INTELLIGENCE"
 * label + a smaller attribution line at the bottom.
 *
 * Port of legacy WatermarkRenderer.swift.  The legacy code rendered the
 * watermark by compositing onto a UIImage; in React Native we achieve the
 * same visual intent as a View overlay (for UI preview) and expose a
 * separate utility in resolutionLimiter.ts for the export path.
 *
 * Usage — wrap the image/canvas that should carry a watermark:
 *   <WatermarkOverlay>
 *     <ProcessedImageView uri={uri} />
 *   </WatermarkOverlay>
 *
 *   // Explicit control (bypass useProStatus hook):
 *   <WatermarkOverlay forceShow>
 *     <ThumbnailImage uri={uri} />
 *   </WatermarkOverlay>
 *
 * For export watermarking (writing text onto the actual file) see the
 * buildWatermarkStyle() helper exported below.  The Pipeline agent uses this
 * to pass watermark parameters to the native export path.
 */

import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FontSize, FontWeight } from '@/constants/theme';
import { shouldApplyWatermark } from '@/storage/preferences';

// ---------------------------------------------------------------------------
// Constants (match legacy WatermarkRenderer.swift values)
// ---------------------------------------------------------------------------

/** Watermark text — matches legacy app branding. */
const WATERMARK_MAIN = 'ANALOG INTELLIGENCE';

/**
 * Attribution line shown at the bottom of free-tier exports.
 * Kept intentionally short for mobile readability.
 */
const WATERMARK_SUBTITLE = 'Scanned with Analog Intelligence — Get Pro to remove';

/**
 * Watermark opacity for free tier (0.0 – 1.0).
 * Matches legacy ProFeatureGate.watermarkOpacity = 0.3.
 */
const WATERMARK_OPACITY = 0.3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WatermarkOverlayProps = {
  /** Content to overlay the watermark on. */
  children: ReactNode;
  /**
   * When true, always show the watermark regardless of Pro status.
   * Useful for preview / export pipeline to force the watermark.
   */
  forceShow?: boolean;
  /**
   * Watermark opacity (0.0 – 1.0).
   * Defaults to the canonical legacy value (0.3).
   */
  opacity?: number;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WatermarkOverlay({
  children,
  forceShow = false,
  opacity = WATERMARK_OPACITY,
}: WatermarkOverlayProps) {
  const showWatermark = forceShow || shouldApplyWatermark();

  return (
    <View style={styles.container}>
      {children}
      {showWatermark && (
        <View style={styles.overlay} pointerEvents="none">
          {/* Center watermark */}
          <Text
            style={[
              styles.mainText,
              { opacity },
            ]}
            allowFontScaling={false}>
            {WATERMARK_MAIN}
          </Text>

          {/* Bottom attribution */}
          <View style={styles.bottomRow}>
            <Text
              style={[
                styles.subtitleText,
                { opacity: opacity * 0.8 },
              ]}
              allowFontScaling={false}
              numberOfLines={1}>
              {WATERMARK_SUBTITLE}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Export watermark descriptor
// ---------------------------------------------------------------------------

/**
 * Parameters describing a watermark to bake into an exported image.
 * Passed to expo-image-manipulator or the native export layer by the Pipeline
 * agent so the watermark is composited into the actual file, not just shown
 * as a UI overlay.
 */
export type ExportWatermarkParams = {
  text: string;
  subtitleText: string;
  opacity: number;
  /** Relative font size as a fraction of image width (matches Swift: 5%). */
  fontSizeRatio: number;
  /** Relative subtitle font size (matches Swift: 1.5%). */
  subtitleFontSizeRatio: number;
  /** Bottom margin fraction for the subtitle (matches Swift: 2%). */
  subtitleBottomMarginRatio: number;
};

/**
 * Build the watermark descriptor for the export pipeline.
 * Returns null when the user is Pro (no watermark needed).
 *
 * @param forceApply - Override Pro check (e.g. for testing).
 */
export function buildExportWatermarkParams(
  forceApply = false,
): ExportWatermarkParams | null {
  if (!forceApply && !shouldApplyWatermark()) return null;

  return {
    text: WATERMARK_MAIN,
    subtitleText: WATERMARK_SUBTITLE,
    opacity: WATERMARK_OPACITY,
    fontSizeRatio: 0.05,
    subtitleFontSizeRatio: 0.015,
    subtitleBottomMarginRatio: 0.02,
  };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainText: {
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
    fontSize: FontSize.xl,
    letterSpacing: FontSize.xl * 0.1,
    textAlign: 'center',
    // Shadow for better visibility on both light/dark images (mirrors cgContext.setShadow in Swift).
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  bottomRow: {
    position: 'absolute',
    bottom: '2%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  subtitleText: {
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});
