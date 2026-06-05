/**
 * src/features/scan/FrameAlignmentOverlay.tsx
 *
 * Composition guide / target-frame overlay for the scan screen. Draws a
 * centered target rectangle (default 35mm 3:2 landscape) with corner brackets
 * and an optional rule-of-thirds grid, so the user can align a film negative
 * before capture.
 *
 * Ported from legacy-ios/UI/Scan/FrameAlignmentOverlay.swift. The legacy app
 * planned a Skia canvas (see docs/MIGRATION.md); we use plain absolutely-
 * positioned Views here — the guide is static vector chrome with no GPU image
 * work, so this avoids pulling the Skia native surface into the capture path.
 * (Skia is reserved for the live focus-peaking compositing in M2.3.)
 *
 * This is also the non-blocking visual fallback for automatic frame detection
 * (M2.4): until the `detectFilmFrame` frame processor is wired, the user aligns
 * the negative manually against this guide.
 *
 * Pointer events are disabled so taps pass through to tap-to-focus underneath.
 */

import { memo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Palette } from '@/theme';

export interface FrameAlignmentOverlayProps {
  /**
   * Target aspect ratio (width / height) of the alignment frame.
   * @default 1.5 (35mm full-frame, 3:2)
   */
  aspectRatio?: number;
  /**
   * Fraction of the available width the frame should occupy (0–1).
   * @default 0.86
   */
  widthFraction?: number;
  /** Show the rule-of-thirds grid inside the frame. @default true */
  showGrid?: boolean;
  /** Frame + bracket colour. @default theme amber */
  color?: string;
  /** Optional override style for the outer container. */
  style?: ViewStyle;
}

const BRACKET_LENGTH = 28;
const BRACKET_THICKNESS = 3;
const FRAME_BORDER = 1;

function FrameAlignmentOverlayImpl({
  aspectRatio = 1.5,
  widthFraction = 0.86,
  showGrid = true,
  color = Palette.amber,
  style,
}: FrameAlignmentOverlayProps) {
  // The frame box sizes itself off width; height derives from aspect ratio.
  // `aspectRatio` on the style does the work so it adapts to any container.
  const frameWidth: ViewStyle = { width: `${widthFraction * 100}%`, aspectRatio };

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.container, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={[styles.frame, frameWidth, { borderColor: withAlpha(color, 0.55) }]}>
        {showGrid ? <ThirdsGrid color={withAlpha(color, 0.25)} /> : null}

        {/* Corner brackets (drawn brighter than the thin frame border) */}
        <Corner position="topLeft" color={color} />
        <Corner position="topRight" color={color} />
        <Corner position="bottomLeft" color={color} />
        <Corner position="bottomRight" color={color} />
      </View>
    </View>
  );
}

export const FrameAlignmentOverlay = memo(FrameAlignmentOverlayImpl);

// ---------------------------------------------------------------------------
// Rule-of-thirds grid
// ---------------------------------------------------------------------------

function ThirdsGrid({ color }: { color: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Vertical thirds */}
      <View style={[styles.gridLineV, { left: '33.33%', backgroundColor: color }]} />
      <View style={[styles.gridLineV, { left: '66.66%', backgroundColor: color }]} />
      {/* Horizontal thirds */}
      <View style={[styles.gridLineH, { top: '33.33%', backgroundColor: color }]} />
      <View style={[styles.gridLineH, { top: '66.66%', backgroundColor: color }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Corner bracket
// ---------------------------------------------------------------------------

type CornerPosition = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

function Corner({ position, color }: { position: CornerPosition; color: string }) {
  const isTop = position === 'topLeft' || position === 'topRight';
  const isLeft = position === 'topLeft' || position === 'bottomLeft';

  const vertical: ViewStyle = {
    position: 'absolute',
    width: BRACKET_THICKNESS,
    height: BRACKET_LENGTH,
    backgroundColor: color,
    [isTop ? 'top' : 'bottom']: -FRAME_BORDER,
    [isLeft ? 'left' : 'right']: -FRAME_BORDER,
  };
  const horizontal: ViewStyle = {
    position: 'absolute',
    height: BRACKET_THICKNESS,
    width: BRACKET_LENGTH,
    backgroundColor: color,
    [isTop ? 'top' : 'bottom']: -FRAME_BORDER,
    [isLeft ? 'left' : 'right']: -FRAME_BORDER,
  };

  return (
    <>
      <View style={vertical} />
      <View style={horizontal} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Apply an alpha to a #RRGGBB hex colour, producing an rgba() string. */
function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    borderWidth: FRAME_BORDER,
    borderRadius: 2,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
});
