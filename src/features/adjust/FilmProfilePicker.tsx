/**
 * src/features/adjust/FilmProfilePicker.tsx
 *
 * Horizontal chip picker for film-stock / lab-scanner looks. Selecting a
 * profile applies its slider offsets to a neutral base (see applyFilmProfile),
 * giving an instant "lab render" the user can then fine-tune.
 *
 * Black & white: selected chip = inverted accent (accent bg + accentText);
 * unselected = bordered ghost. No colour.
 */

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import {
  FILM_PROFILES,
  NEUTRAL_PROFILE_ID,
  type FilmProfile,
  type FilmProfileGroup,
} from '@/processing/filmProfiles';

type FilmProfilePickerProps = {
  /** Currently selected profile id (defaults to Natural). */
  selectedId?: string;
  /** Called with the chosen profile when a chip is tapped. */
  onSelect: (profile: FilmProfile) => void;
};

const GROUP_LABEL: Record<FilmProfileGroup, string> = {
  look: 'Looks',
  film: 'Film & lab',
};

export function FilmProfilePicker({
  selectedId = NEUTRAL_PROFILE_ID,
  onSelect,
}: FilmProfilePickerProps) {
  const theme = useTheme();

  // Split into ordered groups for labelled sections within the scroller.
  const groups = useMemo(() => {
    const order: FilmProfileGroup[] = ['look', 'film'];
    return order.map((g) => ({
      group: g,
      label: GROUP_LABEL[g],
      profiles: FILM_PROFILES.filter((p) => p.group === g),
    }));
  }, []);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}>
      {groups.map(({ group, label, profiles }) => (
        <View key={group} style={styles.group}>
          <Text style={[styles.groupLabel, { color: theme.textTertiary }]}>
            {label.toUpperCase()}
          </Text>
          <View style={styles.row}>
            {profiles.map((profile) => {
              const selected = profile.id === selectedId;
              return (
                <Pressable
                  key={profile.id}
                  onPress={() => onSelect(profile)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${profile.name} look`}
                  style={({ pressed }) => [
                    styles.chip,
                    selected
                      ? { backgroundColor: theme.accent, borderColor: theme.accent }
                      : { backgroundColor: 'transparent', borderColor: theme.border },
                    pressed && !selected && { opacity: 0.6 },
                  ]}>
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? theme.accentText : theme.text },
                    ]}>
                    {profile.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.lg,
    alignItems: 'flex-start',
  },
  group: {
    gap: Spacing.sm,
  },
  groupLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.8,
    paddingLeft: 2,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  chip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
