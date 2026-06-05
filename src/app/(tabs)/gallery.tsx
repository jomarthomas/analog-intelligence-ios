/**
 * Gallery tab — scanned image grid.
 *
 * Layout (legacy-ios/docs/PRODUCT_UI_SPEC.md):
 *   - Inline title + Pro "Contact Sheet" action
 *   - 3-column grid of thumbnails (GalleryGrid)
 *   - Tap → detail route (gallery/[id]); long-press → multi-select
 *   - Multi-select → Export / Delete toolbar (MultiSelectToolbar)
 *   - Free tier: "SPONSORED AD" banner at the bottom (BannerAd)
 *   - Empty state when no scans exist
 *
 * Data flow: everything reads from useGalleryStore. New scans are persisted by
 * the Scan screen, which calls loadGallery() before navigating, so the grid is
 * already up to date when the user returns here.
 */

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Spacing } from '@/constants/theme';
import { Screen } from '@/theme/screen';
import { BannerAd } from '@/monetization';
import { useGalleryStore } from '@/state/galleryStore';
import type { GallerySortOrder } from '@/storage';
import {
  ContactSheetButton,
  GalleryEmptyState,
  GalleryGrid,
  GalleryRollSectionList,
  GallerySortControl,
  getInitialSortOrder,
  MultiSelectToolbar,
  RollMetadataSheet,
} from '@/features/gallery';

export default function GalleryScreen() {
  const theme = useTheme();
  const router = useRouter();

  const hasImages = useGalleryStore((s) => s.displayedImages.length > 0);
  const inSelectionMode = useGalleryStore((s) => s.selectedIds.size > 0);

  // Sort/view order, seeded from the persisted preference. `'sessionGrouped'`
  // switches the flat grid for the grouped-by-roll SectionList.
  const [sortOrder, setSortOrder] = useState<GallerySortOrder>(getInitialSortOrder);
  const grouped = sortOrder === 'sessionGrouped';

  // Roll being edited in the metadata sheet (null = closed).
  const [editingRollId, setEditingRollId] = useState<string | null>(null);

  const openImage = (id: string) => router.push(`/gallery/${id}`);

  return (
    <Screen edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Gallery</Text>
        {hasImages && <ContactSheetButton />}
      </View>

      {hasImages && !inSelectionMode && (
        <View style={styles.controls}>
          <GallerySortControl value={sortOrder} onChange={setSortOrder} />
        </View>
      )}

      {hasImages ? (
        <View style={styles.flex}>
          {grouped ? (
            <GalleryRollSectionList
              onOpenImage={openImage}
              onEditRoll={setEditingRollId}
            />
          ) : (
            <GalleryGrid onOpenImage={openImage} />
          )}
        </View>
      ) : (
        <GalleryEmptyState onScan={() => router.replace('/(tabs)/scan')} />
      )}

      {/* Multi-select toolbar replaces the ad while selecting. */}
      {inSelectionMode ? <MultiSelectToolbar /> : <BannerAd />}

      {/* Roll metadata editor (mounted modal; visibility driven by editingRollId). */}
      <RollMetadataSheet sessionId={editingRollId} onClose={() => setEditingRollId(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.bold,
    letterSpacing: -0.5,
  },
});
