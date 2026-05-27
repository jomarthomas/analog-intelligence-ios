/**
 * src/features/gallery/MultiSelectToolbar.tsx
 *
 * Floating action bar shown while the gallery is in multi-select mode
 * (selectedIds.size > 0). Provides batch Export (to Photos), Delete, Select
 * All, and Cancel actions. All selection state lives in useGalleryStore.
 */

import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Palette, Radius, Spacing } from '@/constants/theme';
import { useGalleryStore } from '@/state/galleryStore';

import { exportImagesToPhotos } from './exportImage';

export function MultiSelectToolbar() {
  const theme = useTheme();

  const selectedIds = useGalleryStore((s) => s.selectedIds);
  const displayedImages = useGalleryStore((s) => s.displayedImages);
  const allImages = useGalleryStore((s) => s.allImages);
  const selectAll = useGalleryStore((s) => s.selectAll);
  const clearSelection = useGalleryStore((s) => s.clearSelection);
  const deleteImages = useGalleryStore((s) => s.deleteImages);

  const [isExporting, setIsExporting] = useState(false);

  const count = selectedIds.size;
  const allSelected = count > 0 && count === displayedImages.length;

  const handleExport = useCallback(async () => {
    const targets = allImages.filter((img) => selectedIds.has(img.id));
    if (targets.length === 0) return;

    setIsExporting(true);
    try {
      const { saved, failed, firstError } = await exportImagesToPhotos(targets);
      if (saved > 0 && failed === 0) {
        Alert.alert('Exported', `Saved ${saved} ${saved === 1 ? 'photo' : 'photos'} to your library.`);
        clearSelection();
      } else if (saved > 0) {
        Alert.alert('Partly exported', `Saved ${saved}, ${failed} failed.${firstError ? `\n${firstError}` : ''}`);
      } else {
        Alert.alert('Export failed', firstError ?? 'No photos were saved.');
      }
    } finally {
      setIsExporting(false);
    }
  }, [allImages, selectedIds, clearSelection]);

  const handleDelete = useCallback(() => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    Alert.alert(
      `Delete ${ids.length} ${ids.length === 1 ? 'scan' : 'scans'}?`,
      'This permanently removes the selected frames and their files.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteImages(ids);
          },
        },
      ],
    );
  }, [selectedIds, deleteImages]);

  return (
    <View style={[styles.bar, { backgroundColor: theme.backgroundCard, borderTopColor: theme.border }]}>
      <Pressable onPress={clearSelection} hitSlop={8} style={styles.textButton}>
        <Text style={[styles.textButtonLabel, { color: theme.textSecondary }]}>Cancel</Text>
      </Pressable>

      <Text style={[styles.count, { color: theme.text }]}>{count} selected</Text>

      <View style={styles.actions}>
        <Pressable onPress={selectAll} disabled={allSelected} hitSlop={8} style={styles.textButton}>
          <Text
            style={[
              styles.textButtonLabel,
              { color: allSelected ? theme.textSecondary : theme.accent },
            ]}>
            All
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void handleExport()}
          disabled={isExporting || count === 0}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          {isExporting ? (
            <ActivityIndicator size="small" color={Palette.black} />
          ) : (
            <Text style={styles.primaryLabel}>Export</Text>
          )}
        </Pressable>

        <Pressable onPress={handleDelete} disabled={count === 0} hitSlop={8} style={styles.textButton}>
          <Text style={[styles.textButtonLabel, { color: Palette.danger }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  count: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  textButton: {
    paddingVertical: Spacing.xs,
  },
  textButtonLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  primaryButton: {
    backgroundColor: Palette.amber,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    minWidth: 72,
    alignItems: 'center',
  },
  primaryLabel: {
    color: Palette.black,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  pressed: {
    opacity: 0.8,
  },
});
