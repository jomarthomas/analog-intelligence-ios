/**
 * src/features/scan/DetectedFrameOverlay.tsx
 *
 * Renders the quad/crop-rect returned by detectFilmFrame() as an overlay on
 * the camera preview, and surfaces a "Use detected frame" affordance.
 *
 * Wiring:
 *   1. After a capture, scan.tsx calls detectFilmFrame(uri) (non-blocking).
 *   2. If result.found, it passes result.quad and result.cropRect here.
 *   3. The user taps "Apply crop" → onApplyCrop(result.cropRect) → the crop
 *      is carried into the Adjust flow via ProcessParamsSnapshot.cropRect.
 *
 * Layout:
 *   - Absolutely positioned on top of the preview area (pointerEvents="box-none").
 *   - Quad: four corner-bracket markers at the exact pixel corners, scaled from
 *     image coordinates to view coordinates via imageSize → containerSize.
 *   - CropRect: a semi-transparent amber rectangle indicating the detected area.
 *   - "Apply crop" / "Dismiss" pill buttons at the bottom.
 *
 * If `found` is false or `quad` is absent, nothing is rendered — the caller
 * should show the standard FrameAlignmentOverlay instead.
 */

import { memo, useCallback } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import type { FrameDetectionResult, FramePoint } from '../../../modules/ai-image-processing';
import { Palette, Spacing, FontSize, FontWeight, Radius } from '@/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectedFrameOverlayProps {
  /** The result of detectFilmFrame(). Renders nothing when found=false. */
  detection: FrameDetectionResult;
  /**
   * The pixel dimensions of the source image that was analysed.
   * Required to scale image-pixel coordinates → view coordinates.
   */
  imageSize: { width: number; height: number };
  /** Current layout size of the container (onLayout). */
  containerSize: { width: number; height: number };
  /** Called when the user taps "Apply crop". Provides the pixel-space cropRect. */
  onApplyCrop: (cropRect: NonNullable<FrameDetectionResult['cropRect']>) => void;
  /** Called when the user taps "Dismiss". */
  onDismiss: () => void;
  /** Optional override style for the outer container. */
  style?: ViewStyle;
}

// ---------------------------------------------------------------------------
// Scale helpers
// ---------------------------------------------------------------------------

/**
 * Scale a single point from image-pixel space to view-layout space.
 * Image coordinates have origin top-left (same as view layout).
 */
function scalePoint(
  p: FramePoint,
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  return {
    x: (p.x / imgW) * viewW,
    y: (p.y / imgH) * viewH,
  };
}

/** Scale an axis-aligned rect from image-pixel space to view-layout space. */
function scaleRect(
  r: { x: number; y: number; width: number; height: number },
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number,
): { x: number; y: number; width: number; height: number } {
  const scaleX = viewW / imgW;
  const scaleY = viewH / imgH;
  return {
    x: r.x * scaleX,
    y: r.y * scaleY,
    width: r.width * scaleX,
    height: r.height * scaleY,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const BRACKET_LEN = 20;
const BRACKET_W = 3;

function DetectedFrameOverlayImpl({
  detection,
  imageSize,
  containerSize,
  onApplyCrop,
  onDismiss,
  style,
}: DetectedFrameOverlayProps) {
  const handleApply = useCallback(() => {
    if (detection.cropRect) {
      onApplyCrop(detection.cropRect);
    }
  }, [detection.cropRect, onApplyCrop]);

  // Render nothing if detection failed or quad is absent.
  if (!detection.found || !detection.quad) return null;

  const { quad, cropRect } = detection;
  const { width: iW, height: iH } = imageSize;
  const { width: vW, height: vH } = containerSize;

  // Guard against zero dimensions during layout.
  if (iW === 0 || iH === 0 || vW === 0 || vH === 0) return null;

  // Scale the four quad corners to view coordinates.
  const tl = scalePoint(quad.topLeft, iW, iH, vW, vH);
  const tr = scalePoint(quad.topRight, iW, iH, vW, vH);
  const bl = scalePoint(quad.bottomLeft, iW, iH, vW, vH);
  const br = scalePoint(quad.bottomRight, iW, iH, vW, vH);

  // Scale the crop-rect if present.
  const scaledCrop = cropRect ? scaleRect(cropRect, iW, iH, vW, vH) : null;

  const color = Palette.ink;
  const dimColor = withAlpha(color, 0.35);

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.container, style]}
      pointerEvents="box-none">
      {/* Semi-transparent crop rect */}
      {scaledCrop ? (
        <View
          style={[
            styles.cropRect,
            {
              left: scaledCrop.x,
              top: scaledCrop.y,
              width: scaledCrop.width,
              height: scaledCrop.height,
              borderColor: color,
              backgroundColor: dimColor,
            },
          ]}
          pointerEvents="none"
        />
      ) : null}

      {/* Corner brackets at quad corners */}
      {([
        { point: tl, pos: 'topLeft' },
        { point: tr, pos: 'topRight' },
        { point: bl, pos: 'bottomLeft' },
        { point: br, pos: 'bottomRight' },
      ] as const).map(({ point, pos }) => (
        <QuadCorner key={pos} x={point.x} y={point.y} position={pos} color={color} />
      ))}

      {/* Confidence pill */}
      <View style={[styles.confPill, { backgroundColor: 'rgba(0,0,0,0.60)' }]}>
        <Text style={styles.confText}>
          Frame detected {Math.round(detection.confidence * 100)}%
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actions} pointerEvents="box-none">
        <Pressable
          style={[styles.actionBtn, styles.dismissBtn]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss frame detection">
          <Text style={[styles.actionText, { color: Palette.white }]}>Dismiss</Text>
        </Pressable>
        {detection.cropRect ? (
          <Pressable
            style={[styles.actionBtn, styles.applyBtn]}
            onPress={handleApply}
            accessibilityRole="button"
            accessibilityLabel="Apply detected crop">
            <Text style={[styles.actionText, { color: Palette.black }]}>Apply crop</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export const DetectedFrameOverlay = memo(DetectedFrameOverlayImpl);

// ---------------------------------------------------------------------------
// Corner bracket
// ---------------------------------------------------------------------------

type QuadCornerProps = {
  x: number;
  y: number;
  position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
  color: string;
};

function QuadCorner({ x, y, position, color }: QuadCornerProps) {
  const isTop = position === 'topLeft' || position === 'topRight';
  const isLeft = position === 'topLeft' || position === 'bottomLeft';

  const vertStyle: ViewStyle = {
    position: 'absolute',
    left: x - BRACKET_W / 2,
    top: isTop ? y : y - BRACKET_LEN,
    width: BRACKET_W,
    height: BRACKET_LEN,
    backgroundColor: color,
  };
  const horizStyle: ViewStyle = {
    position: 'absolute',
    top: y - BRACKET_W / 2,
    left: isLeft ? x : x - BRACKET_LEN,
    height: BRACKET_W,
    width: BRACKET_LEN,
    backgroundColor: color,
  };

  return (
    <>
      <View style={vertStyle} pointerEvents="none" />
      <View style={horizStyle} pointerEvents="none" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  container: {
    pointerEvents: 'none',
  },
  cropRect: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 3,
  },
  confPill: {
    position: 'absolute',
    top: Spacing.lg,
    alignSelf: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  confText: {
    color: Palette.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  actions: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  dismissBtn: {
    backgroundColor: 'rgba(0,0,0,0.60)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  applyBtn: {
    backgroundColor: Palette.ink,
  },
  actionText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
});
