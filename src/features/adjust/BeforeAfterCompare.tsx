/**
 * src/features/adjust/BeforeAfterCompare.tsx
 *
 * Drag-to-reveal before/after comparison: the raw captured NEGATIVE on one side,
 * the processed POSITIVE on the other, split by a draggable handle. Photo
 * editors have this; mobile film-scanner apps don't — and for a negative
 * scanner the "before" (the orange negative) vs "after" (the finished positive)
 * is the most compelling thing to show.
 *
 * No gesture-library dependency — a PanResponder on the container moves the
 * divider to wherever you touch/drag.
 */

import { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { FontSize, FontWeight, Palette, Radius, Spacing } from '@/constants/theme';

type BeforeAfterCompareProps = {
  /** The raw captured negative (the "before"). */
  beforeUri: string;
  /** The processed positive (the "after"). */
  afterUri: string;
};

export function BeforeAfterCompare({ beforeUri, afterUri }: BeforeAfterCompareProps) {
  const [width, setWidth] = useState(0);
  // Divider position as a fraction [0,1]; starts centred.
  const [split, setSplit] = useState(0.5);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  // Recreate the responder when the measured width changes so its callbacks
  // close over the current width (no ref needed).
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          if (width <= 0) return;
          const x = Math.min(Math.max(evt.nativeEvent.locationX, 0), width);
          setSplit(x / width);
        },
        onPanResponderMove: (_evt, gesture) => {
          if (width <= 0) return;
          const x = Math.min(Math.max(gesture.moveX, 0), width);
          setSplit(x / width);
        },
      }),
    [width],
  );

  const dividerX = width * split;

  return (
    <View style={styles.container} onLayout={onLayout} {...responder.panHandlers}>
      {/* After (processed positive) — the full base layer */}
      <Image source={{ uri: afterUri }} style={styles.image} contentFit="contain" />

      {/* Before (negative) — clipped to the left of the divider */}
      {width > 0 ? (
        <View style={[styles.beforeClip, { width: dividerX }]} pointerEvents="none">
          <Image
            source={{ uri: beforeUri }}
            style={[styles.image, { width }]}
            contentFit="contain"
          />
          <View style={styles.beforeLabelWrap}>
            <Text style={styles.label}>NEGATIVE</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.afterLabelWrap} pointerEvents="none">
        <Text style={styles.label}>POSITIVE</Text>
      </View>

      {/* Divider line + handle */}
      {width > 0 ? (
        <View style={[styles.divider, { left: dividerX - 1 }]} pointerEvents="none">
          <View style={styles.handle}>
            <Text style={styles.handleGlyph}>‹ ›</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: Palette.black,
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  beforeClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleGlyph: {
    color: Palette.black,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    letterSpacing: -1,
  },
  beforeLabelWrap: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
  },
  afterLabelWrap: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
  },
  label: {
    color: Palette.ink,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
});
