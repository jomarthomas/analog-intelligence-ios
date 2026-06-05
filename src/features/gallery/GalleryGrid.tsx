/**
 * src/features/gallery/GalleryGrid.tsx
 *
 * A 3-column (preference-driven) grid of scanned-frame thumbnails.
 *
 *   - Reads displayedImages + selection state from useGalleryStore.
 *   - Renders each thumbnail via expo-image (thumbnailUri → processedUri →
 *     originalUri fallback chain).
 *   - Tap: opens the detail route (or toggles selection when in select mode).
 *   - Long-press: enters multi-select and toggles the pressed item.
 *   - Selected items show an amber ring + check badge.
 *   - Unprocessed frames show a small "RAW" / pending dot.
 */

import { useCallback } from 'react';
import {
  FlatList,
  type ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Palette, Radius, Spacing } from '@/constants/theme';
import { useGalleryStore } from '@/state/galleryStore';
import type { ScannedImage } from '@/storage';
import { getPreferences } from '@/storage';

export type GalleryGridProps = {
  /** Called when a frame is tapped while NOT in selection mode. */
  onOpenImage: (imageId: string) => void;
  /** Extra bottom padding (e.g. to clear the banner ad / toolbar). */
  bottomInset?: number;
};

const GRID_GAP = Spacing.xs;

export function GalleryGrid({ onOpenImage, bottomInset = 0 }: GalleryGridProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const displayedImages = useGalleryStore((s) => s.displayedImages);
  const selectedIds = useGalleryStore((s) => s.selectedIds);
  const toggleImageSelection = useGalleryStore((s) => s.toggleImageSelection);
  const selectImage = useGalleryStore((s) => s.selectImage);

  const columns = getPreferences().galleryGridColumns || 3;
  const inSelectionMode = selectedIds.size > 0;

  // Compute the per-cell size: screen width minus screen padding and gaps.
  const screenPadding = Spacing.md * 2;
  const totalGap = GRID_GAP * (columns - 1);
  const cellSize = Math.floor((width - screenPadding - totalGap) / columns);

  const handlePress = useCallback(
    (image: ScannedImage) => {
      if (inSelectionMode) {
        toggleImageSelection(image.id);
      } else {
        onOpenImage(image.id);
      }
    },
    [inSelectionMode, toggleImageSelection, onOpenImage],
  );

  const handleLongPress = useCallback(
    (image: ScannedImage) => {
      // Long-press always enters/extends selection mode.
      selectImage(image.id);
    },
    [selectImage],
  );

  const renderItem = useCallback<ListRenderItem<ScannedImage>>(
    ({ item }) => {
      const selected = selectedIds.has(item.id);
      const uri = item.thumbnailUri ?? item.processedUri ?? item.originalUri;

      return (
        <Pressable
          onPress={() => handlePress(item)}
          onLongPress={() => handleLongPress(item)}
          delayLongPress={250}
          style={({ pressed }) => [
            styles.cell,
            { width: cellSize, height: cellSize },
            pressed && styles.cellPressed,
          ]}>
          <Image
            source={{ uri }}
            style={styles.thumb}
            contentFit="cover"
            transition={120}
            cachePolicy="memory-disk"
          />

          {/* Selection ring + check */}
          {selected && (
            <View style={[styles.selectedRing, { borderColor: Palette.amber }]} pointerEvents="none">
              <View style={[styles.checkBadge, { backgroundColor: Palette.amber }]}>
                <Text style={styles.checkText}>✓</Text>
              </View>
            </View>
          )}

          {/* Pending (not-yet-processed) indicator */}
          {!item.isProcessed && !selected && (
            <View style={styles.pendingDot} pointerEvents="none" />
          )}
        </Pressable>
      );
    },
    [selectedIds, cellSize, handlePress, handleLongPress],
  );

  return (
    <FlatList
      data={displayedImages}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      numColumns={columns}
      // Re-render rows when selection or column count changes.
      extraData={`${selectedIds.size}:${columns}`}
      key={`cols-${columns}`}
      columnWrapperStyle={columns > 1 ? styles.column : undefined}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: bottomInset + Spacing.lg },
      ]}
      style={{ backgroundColor: theme.background }}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: GRID_GAP,
  },
  column: {
    gap: GRID_GAP,
  },
  cell: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  cellPressed: {
    opacity: 0.85,
  },
  thumb: {
    flex: 1,
  },
  selectedRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 3,
    borderRadius: Radius.sm,
    alignItems: 'flex-end',
  },
  checkBadge: {
    margin: Spacing.xs,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    color: Palette.black,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  pendingDot: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.amber,
  },
});
