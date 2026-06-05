/**
 * src/camera/FilmGuideOverlay.tsx
 *
 * Dimmed alignment guide for the scan screen — the single most important piece
 * of "dead-simple, auto-cropping" UX (task #1).
 *
 * THE PROBLEM IT SOLVES:
 *   Users hold a negative in front of a bright window; the film is a small part
 *   of the frame and the bright scene behind it dominates, so the engine blows
 *   out to white. Competitors (FilmBox by Photomyne, the AI auto-crop apps,
 *   Kodak Mobile Film Scanner) fix this by showing a CLEAR CENTRE LANE with the
 *   surround DIMMED, so the user instinctively fills it with the negative.
 *
 * WHAT THIS DRAWS:
 *   • Four dark scrims forming a window around a centred 35 mm (3:2) lane.
 *   • Corner brackets on the lane, whose colour reflects the live framing state.
 *   • A small status pill ("Place the negative…", "Move closer…", "✓ Film
 *     detected") fed by the framing state from `useCaptureGuidance`.
 *
 * It is PURELY presentational and `pointerEvents="none"` so taps fall through to
 * tap-to-focus underneath. The live framing state is computed upstream (one
 * worklet, no extra camera output) and passed in via `state` + `message`.
 *
 * Colour: the viewfinder is an always-dark surface, so we use the fixed
 * monochrome poles (`Palette.ink` = white, `Palette.black`) exactly as the rest
 * of the camera chrome does — no colour is ever introduced.
 */

import { memo } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Palette, Spacing, FontSize, FontWeight, Radius } from '@/theme';
import type { FrameGuideState } from '@/camera/useCaptureGuidance';

export interface FilmGuideOverlayProps {
  /** Live framing state driving the bracket emphasis + which copy shows. */
  state: FrameGuideState;
  /** Short instruction shown in the status pill. */
  message: string;
  /**
   * Aspect ratio (width / height) of the clear lane.
   * @default 1.5 (35 mm full-frame, 3:2)
   */
  aspectRatio?: number;
  /**
   * Fraction of the available width the lane occupies (0–1).
   * @default 0.86
   */
  widthFraction?: number;
}

const BRACKET_LENGTH = 30;
const BRACKET_THICKNESS = 3;
/** Dim level of the surround scrim — dark enough to focus the eye on the lane. */
const SCRIM = 'rgba(0,0,0,0.6)';

function FilmGuideOverlayImpl({
  state,
  message,
  aspectRatio = 1.5,
  widthFraction = 0.86,
}: FilmGuideOverlayProps) {
  const ready = state === 'aligned';
  // White brackets always read on the dark scrim; when aligned we thicken/solidify
  // the border to give a clear "locked on" affordance without adding colour.
  const bracketColor = Palette.ink;
  const laneBorder = ready ? withAlpha(Palette.ink, 0.9) : withAlpha(Palette.ink, 0.45);

  const lane: ViewStyle = { width: `${widthFraction * 100}%`, aspectRatio };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Centre column holds the lane; the row scrims sit above/below it. */}
      <View style={styles.scrim} />
      <View style={styles.middleRow}>
        <View style={styles.scrim} />
        {/* The clear lane — no scrim over it, so the live camera shows through. */}
        <View style={[styles.lane, lane, { borderColor: laneBorder }]}>
          <Corner position="topLeft" color={bracketColor} solid={ready} />
          <Corner position="topRight" color={bracketColor} solid={ready} />
          <Corner position="bottomLeft" color={bracketColor} solid={ready} />
          <Corner position="bottomRight" color={bracketColor} solid={ready} />
        </View>
        <View style={styles.scrim} />
      </View>
      <View style={styles.scrim} />

      {/* Status pill — anchored just below the top scrim edge. */}
      <View style={styles.pillWrap} pointerEvents="none">
        <View style={[styles.pill, ready && styles.pillReady]}>
          <Text style={[styles.pillText, ready && styles.pillTextReady]}>{message}</Text>
        </View>
      </View>
    </View>
  );
}

export const FilmGuideOverlay = memo(FilmGuideOverlayImpl);

// ---------------------------------------------------------------------------
// Corner bracket
// ---------------------------------------------------------------------------

type CornerPosition = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

function Corner({
  position,
  color,
  solid,
}: {
  position: CornerPosition;
  color: string;
  solid: boolean;
}) {
  const isTop = position === 'topLeft' || position === 'topRight';
  const isLeft = position === 'topLeft' || position === 'bottomLeft';
  const thickness = solid ? BRACKET_THICKNESS + 1 : BRACKET_THICKNESS;

  const vertical: ViewStyle = {
    position: 'absolute',
    width: thickness,
    height: BRACKET_LENGTH,
    backgroundColor: color,
    [isTop ? 'top' : 'bottom']: -1,
    [isLeft ? 'left' : 'right']: -1,
  };
  const horizontal: ViewStyle = {
    position: 'absolute',
    height: thickness,
    width: BRACKET_LENGTH,
    backgroundColor: color,
    [isTop ? 'top' : 'bottom']: -1,
    [isLeft ? 'left' : 'right']: -1,
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
  const n = hex.replace('#', '');
  if (n.length !== 6) return hex;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Each scrim is a flexible dark panel; together they frame the clear lane.
  scrim: {
    flex: 1,
    backgroundColor: SCRIM,
    alignSelf: 'stretch',
  },
  // The middle band: side scrims + the clear lane, centred horizontally.
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lane: {
    borderWidth: 1,
    borderRadius: 2,
    // No background — the live preview must show through the lane.
  },
  pillWrap: {
    position: 'absolute',
    top: Spacing.xxl + Spacing.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  pillReady: {
    backgroundColor: Palette.ink,
    borderColor: Palette.ink,
  },
  pillText: {
    color: Palette.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  pillTextReady: {
    color: Palette.black,
  },
});
