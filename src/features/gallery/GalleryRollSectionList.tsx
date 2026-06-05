/**
 * src/features/gallery/GalleryRollSectionList.tsx
 *
 * Grouped-by-roll gallery view: a SectionList with one section per ScanSession
 * (roll). Each section renders a RollSectionHeader followed by the roll's
 * thumbnails laid out in a grid.
 *
 * SectionList renders one item per row, so each section's frames are chunked
 * into rows of `columns` and each row is rendered as a horizontal strip of
 * thumbnail cells. The cell visuals (selection ring, pending dot, tap /
 * long-press to enter multi-select) mirror GalleryGrid so the flat and grouped
 * views feel identical.
 *
 * Reads everything from useGalleryStore; presentational + theme-driven.
 */

import { useCallback, useMemo } from 'react';
import {
  Pressable,
  SectionList,
  type SectionListData,
  type SectionListRenderItem,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Palette, Radius, Spacing } from '@/constants/theme';
import { useGalleryStore } from '@/state/galleryStore';
import type { ScanSession, ScannedImage } from '@/storage';
import { getPreferences } from '@/storage';

import { groupImagesByRoll } from './galleryGrouping';
import { RollSectionHeader } from './RollSectionHeader';

export type GalleryRollSectionListProps = {
  /** Called when a frame is tapped while NOT in selection mode. */
  onOpenImage: (imageId: string) => void;
  /** Called when a roll section header is tapped (opens the metadata editor). */
  onEditRoll: (sessionId: string) => void;
  /** Extra bottom padding (e.g. to clear the banner ad / toolbar). */
  bottomInset?: number;
};

const GRID_GAP = Spacing.xs;

/** A single grid row inside a section (a tuple of up to `columns` frames). */
interface FrameRow {
  /** Stable key — the first frame's id is unique within the section. */
  id: string;
  frames: ScannedImage[];
}

/**
 * SectionList section shape for the grouped view: the section's `data` is a
 * list of grid ROWS (not individual frames), so SectionList renders one row
 * per item. The roll's session/frame-count travel on the section for the
 * header. Distinct from galleryGrouping's RollSection (whose data is frames).
 */
interface RowSection {
  key: string;
  session?: ScanSession;
  /** Total frames in the roll (independent of row chunking). */
  frameCount: number;
  data: FrameRow[];
}

function chunkRows(frames: ScannedImage[], columns: number): FrameRow[] {
  const rows: FrameRow[] = [];
  for (let i = 0; i < frames.length; i += columns) {
    const slice = frames.slice(i, i + columns);
    rows.push({ id: slice[0]?.id ?? `row-${i}`, frames: slice });
  }
  return rows;
}

export function GalleryRollSectionList({
  onOpenImage,
  onEditRoll,
  bottomInset = 0,
}: GalleryRollSectionListProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const displayedImages = useGalleryStore((s) => s.displayedImages);
  const allSessions = useGalleryStore((s) => s.allSessions);
  const selectedIds = useGalleryStore((s) => s.selectedIds);
  const toggleImageSelection = useGalleryStore((s) => s.toggleImageSelection);
  const selectImage = useGalleryStore((s) => s.selectImage);

  const columns = getPreferences().galleryGridColumns || 3;
  const inSelectionMode = selectedIds.size > 0;

  const screenPadding = Spacing.md * 2;
  const totalGap = GRID_GAP * (columns - 1);
  const cellSize = Math.floor((width - screenPadding - totalGap) / columns);

  // Build sections (memoised on the inputs that affect grouping), then re-shape
  // each section's frames into rows of `columns` for the SectionList.
  const rowSections = useMemo<RowSection[]>(
    () =>
      groupImagesByRoll(displayedImages, allSessions).map((section) => ({
        key: section.key,
        session: section.session,
        frameCount: section.data.length,
        data: chunkRows(section.data, columns),
      })),
    [displayedImages, allSessions, columns],
  );

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
      selectImage(image.id);
    },
    [selectImage],
  );

  const renderCell = useCallback(
    (image: ScannedImage) => {
      const selected = selectedIds.has(image.id);
      const uri = image.thumbnailUri ?? image.processedUri ?? image.originalUri;

      return (
        <Pressable
          key={image.id}
          onPress={() => handlePress(image)}
          onLongPress={() => handleLongPress(image)}
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

          {selected && (
            <View style={[styles.selectedRing, { borderColor: Palette.amber }]} pointerEvents="none">
              <View style={[styles.checkBadge, { backgroundColor: Palette.amber }]}>
                <Text style={styles.checkText}>✓</Text>
              </View>
            </View>
          )}

          {!image.isProcessed && !selected && (
            <View style={styles.pendingDot} pointerEvents="none" />
          )}
        </Pressable>
      );
    },
    [selectedIds, cellSize, handlePress, handleLongPress],
  );

  const renderRow = useCallback<SectionListRenderItem<FrameRow, RowSection>>(
    ({ item }) => (
      <View style={styles.row}>
        {item.frames.map(renderCell)}
      </View>
    ),
    [renderCell],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<FrameRow, RowSection> }) => (
      <RollSectionHeader
        session={section.session}
        frameCount={section.frameCount}
        onPress={onEditRoll}
      />
    ),
    [onEditRoll],
  );

  return (
    <SectionList
      sections={rowSections}
      keyExtractor={(item) => item.id}
      renderItem={renderRow}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled={false}
      extraData={`${selectedIds.size}:${columns}`}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset + Spacing.lg }]}
      style={{ backgroundColor: theme.background }}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: GRID_GAP,
    marginTop: GRID_GAP,
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
