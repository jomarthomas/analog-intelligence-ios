/**
 * src/camera/LivePositiveOverlay.tsx
 *
 * The visible half of the LIVE INVERTED PREVIEW. A Skia `<Canvas>` that COVERS
 * the real camera preview and draws the latest snapshot (from
 * `useLivePositivePreview`) through an inverting + orange-mask-correcting
 * `<ColorMatrix>`, so the user sees a rough POSITIVE while aligning a negative.
 *
 * It is purely presentational: it owns no camera state, takes the decoded
 * `SkImage` as a prop, and is `pointerEvents="none"` so taps fall through to the
 * tap-to-focus `Pressable` beneath it. When `image` is null (warming up / paused
 * / failed) it renders nothing and the normal preview shows through.
 *
 * The snapshot already matches the preview's framing (it IS the preview), so we
 * draw it edge-to-edge with `fit="cover"` — the inverted image lines up 1:1 with
 * the live view it sits on top of, which is what makes the toggle feel seamless.
 */

import { memo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Canvas, ColorMatrix, Image, Paint, type SkImage } from '@shopify/react-native-skia';

import { INVERT_PREVIEW_MATRIX } from '@/camera/invertMatrix';

export interface LivePositiveOverlayProps {
  /**
   * Latest decoded preview frame to display inverted, or `null` to render
   * nothing (letting the real preview show through). Owned by the caller's
   * `useLivePositivePreview` hook — this component never disposes it.
   */
  image: SkImage | null;
}

function LivePositiveOverlayImpl({ image }: LivePositiveOverlayProps) {
  // Track the on-screen size so the Skia <Image> can fill the canvas exactly.
  // (Fabric Canvas doesn't support onLayout directly, so we measure a wrapper.)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    // Avoid churn: only update when the size actually changes.
    setSize((prev) =>
      prev != null && prev.width === width && prev.height === height
        ? prev
        : { width, height },
    );
  };

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {image != null && size != null ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Image
            image={image}
            x={0}
            y={0}
            width={size.width}
            height={size.height}
            fit="cover">
            {/* Invert + orange-mask correction. The matrix is precomputed in
                invertMatrix.ts; a non-mutating spread satisfies the
                `matrix: number[]` prop without sharing the frozen constant. */}
            <Paint>
              <ColorMatrix matrix={[...INVERT_PREVIEW_MATRIX]} />
            </Paint>
          </Image>
        </Canvas>
      ) : null}
    </View>
  );
}

export const LivePositiveOverlay = memo(LivePositiveOverlayImpl);
