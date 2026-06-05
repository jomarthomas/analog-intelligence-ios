/**
 * src/features/gallery/GallerySortControl.tsx
 *
 * Segmented control that toggles the gallery between flat ordering and the
 * grouped-by-roll view. Backed by the existing GallerySortOrder:
 *
 *   "Newest"  → 'newestFirst'
 *   "Oldest"  → 'oldestFirst'
 *   "By roll" → 'sessionGrouped'   (drives the grouped SectionList)
 *
 * The choice is persisted to preferences (`sortOrder`) and pushed into the
 * gallery store via `applySortOrder`, so the flat grid and grouped list stay in
 * sync and the selection survives app restarts.
 *
 * Presentational + theme-driven (black & white app — accent/​divider/​text only).
 */

import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { useGalleryStore } from '@/state/galleryStore';
import { getPreferences, setPreference, type GallerySortOrder } from '@/storage';

const OPTIONS: { order: GallerySortOrder; label: string }[] = [
  { order: 'newestFirst', label: 'Newest' },
  { order: 'oldestFirst', label: 'Oldest' },
  { order: 'sessionGrouped', label: 'By roll' },
];

export type GallerySortControlProps = {
  /** Current order (lifted into the parent so it can switch grid vs. section list). */
  value: GallerySortOrder;
  /** Called after the order is persisted + applied to the store. */
  onChange: (order: GallerySortOrder) => void;
};

/** Read the persisted sort order (falls back to the preference default). */
export function getInitialSortOrder(): GallerySortOrder {
  return getPreferences().sortOrder;
}

export function GallerySortControl({ value, onChange }: GallerySortControlProps) {
  const theme = useTheme();
  const applySortOrder = useGalleryStore((s) => s.applySortOrder);

  const handleSelect = useCallback(
    (order: GallerySortOrder) => {
      if (order === value) return;
      setPreference('sortOrder', order);
      applySortOrder(order);
      onChange(order);
    },
    [value, applySortOrder, onChange],
  );

  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundElevated, borderColor: theme.divider }]}>
      {OPTIONS.map(({ order, label }) => {
        const active = order === value;
        return (
          <Pressable
            key={order}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => handleSelect(order)}
            style={[
              styles.segment,
              active && { backgroundColor: theme.accent },
            ]}>
            <Text
              style={[
                styles.label,
                { color: active ? theme.accentText : theme.textSecondary },
              ]}
              numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 2,
    gap: 2,
  },
  segment: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm + 2,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.2,
  },
});
