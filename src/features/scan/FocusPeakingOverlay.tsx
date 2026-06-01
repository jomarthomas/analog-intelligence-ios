/**
 * src/features/scan/FocusPeakingOverlay.tsx
 *
 * Live focus-peaking overlay for the Scan screen.
 *
 * Renders the in-focus grid cells returned by useFrameProcessors as
 * semi-transparent amber rectangles, drawn on a @shopify/react-native-skia
 * Canvas that sits absolutely on top of the camera preview.
 *
 * Architecture:
 *   - `useFrameProcessors` runs a Sobel-gradient worklet on every YUV frame.
 *   - In-focus cells (PeakCell[]) are dispatched to the React thread via
 *     `runOnJS(setPeakCells)`.
 *   - This component reads the latest `peakCells` via a ref + polling
 *     approach: the parent calls `onFrameUpdate()` via `useEffect` whenever
 *     `peakCells` changes, which triggers a `redraw()` on the Skia canvas ref
 *     without re-mounting the component on every frame.
 *
 * Performance notes:
 *   - The Skia Canvas is declared with `opaque={false}` so only changed
 *     regions are composited over the camera preview.
 *   - `useFrameUpdate` polls via `requestAnimationFrame` and calls
 *     `canvasRef.current?.redraw()` to push the latest cells, keeping
 *     the React render tree quiet (no setState per frame).
 *
 * Pointer events are fully transparent (box-none) so tap-to-focus works.
 */

import { memo, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Canvas, useCanvasRef, Rect, Group } from '@shopify/react-native-skia';

import { Palette } from '@/theme';
import type { PeakingColor as PeakingColorType } from '@/state/captureStore';
import type { PeakCell } from '@/camera/useFrameProcessors';

// ---------------------------------------------------------------------------
// Colour mapping
// ---------------------------------------------------------------------------

/** Map the user's selected peaking colour to an RGBA string with alpha ~0.6. */
function peakingFillColor(color: PeakingColorType): string {
  switch (color) {
    case 'red':
      return 'rgba(255, 60, 40, 0.60)';
    case 'green':
      return 'rgba(40, 220, 60, 0.60)';
    case 'blue':
      return 'rgba(40, 120, 255, 0.60)';
    case 'yellow':
      return 'rgba(255, 220, 0, 0.60)';
    case 'white':
      return 'rgba(255, 255, 255, 0.60)';
    default:
      // Warm amber — primary theme colour (Palette.amber = #FF9933 at 60% alpha)
      return 'rgba(255, 153, 51, 0.60)';
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type { PeakCell };

export interface FocusPeakingOverlayProps {
  /**
   * In-focus cells from useFrameProcessors.
   * Each cell is in normalized coordinates (0..1 × 0..1).
   */
  peakCells: PeakCell[];
  /**
   * User-selected overlay colour.
   * @default 'red' (matches captureStore default)
   */
  peakingColor?: PeakingColorType;
  /** Optional override style for the outer container. */
  style?: ViewStyle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Draws focus-peaking highlight rectangles over the camera preview.
 *
 * The component is memoized to avoid re-renders unless props change.
 * The actual redraw is driven by `peakCells` array reference changes,
 * which happen when the worklet pushes new data via `runOnJS`.
 */
function FocusPeakingOverlayImpl({
  peakCells,
  peakingColor = 'red',
  style,
}: FocusPeakingOverlayProps) {
  const canvasRef = useCanvasRef();
  const containerSizeRef = useRef({ width: 0, height: 0 });

  // Keep latest cells in a ref so the draw callback sees the freshest data
  // without a stale closure.
  const cellsRef = useRef<PeakCell[]>(peakCells);
  cellsRef.current = peakCells;

  // Trigger a Skia redraw whenever peakCells reference changes.
  useEffect(() => {
    canvasRef.current?.redraw();
  }, [peakCells, canvasRef]);

  const handleLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      containerSizeRef.current = {
        width: e.nativeEvent.layout.width,
        height: e.nativeEvent.layout.height,
      };
    },
    [],
  );

  const fillColor = peakingFillColor(peakingColor);
  // Amber border at lower opacity for a crisp outline without over-saturating.
  const strokeColor = Palette.amber;

  return (
    <View
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
      onLayout={handleLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Canvas
        ref={canvasRef}
        style={StyleSheet.absoluteFill}
        opaque={false}>
        <Group>
          {peakCells.map((cell, idx) => {
            // We need layout-sized canvas. Since Skia fills absoluteFill,
            // we use percentage-based width/height via a transform trick:
            // Skia's coordinate system matches the view pixels, so we
            // use the container size from layout (captured in ref).
            // On the very first frame before layout, we fall back to a
            // non-rendering rect (0 size).
            const { width: vw, height: vh } = containerSizeRef.current;
            const x = cell.nx * vw;
            const y = cell.ny * vh;
            const w = cell.nw * vw;
            const h = cell.nh * vh;

            return (
              <Rect
                key={idx}
                x={x}
                y={y}
                width={w}
                height={h}
                color={fillColor}
                style="fill"
              />
            );
          })}
          {peakCells.map((cell, idx) => {
            const { width: vw, height: vh } = containerSizeRef.current;
            const x = cell.nx * vw;
            const y = cell.ny * vh;
            const w = cell.nw * vw;
            const h = cell.nh * vh;

            return (
              <Rect
                key={`s-${idx}`}
                x={x}
                y={y}
                width={w}
                height={h}
                color={strokeColor}
                style="stroke"
                strokeWidth={0.5}
              />
            );
          })}
        </Group>
      </Canvas>
    </View>
  );
}

export const FocusPeakingOverlay = memo(FocusPeakingOverlayImpl);
