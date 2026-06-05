/**
 * src/features/gallery/RollSectionHeader.tsx
 *
 * Section header for the grouped-by-roll gallery view. Shows the roll name,
 * a film-metadata subtitle (stock · EI · camera · lens), the shot/scan date,
 * and the frame count. Tapping the header opens the roll metadata editor.
 *
 * Presentational only — all colour comes from the theme (black & white app).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Spacing } from '@/constants/theme';
import type { ScanSession } from '@/storage';

import { describeRoll, formatRollDate } from './galleryGrouping';

export type RollSectionHeaderProps = {
  /** The roll/session for this section, or undefined for the "Unsorted" group. */
  session: ScanSession | undefined;
  /** Number of frames in the section. */
  frameCount: number;
  /** Tap handler — opens the roll metadata editor (omitted for orphans). */
  onPress?: (sessionId: string) => void;
};

export function RollSectionHeader({ session, frameCount, onPress }: RollSectionHeaderProps) {
  const theme = useTheme();

  const title = session?.name ?? 'Unsorted';
  const subtitle = describeRoll(session);
  const date = formatRollDate(session?.shotDate ?? session?.createdAt);
  const countLabel = `${frameCount} ${frameCount === 1 ? 'frame' : 'frames'}`;
  const interactive = session !== undefined && onPress !== undefined;

  const body = (
    <View style={[styles.container, { backgroundColor: theme.background, borderBottomColor: theme.divider }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        {interactive && (
          <Text style={[styles.edit, { color: theme.accent }]}>Edit</Text>
        )}
      </View>

      {subtitle.length > 0 && (
        <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      )}

      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: theme.textTertiary }]}>{countLabel}</Text>
        {date.length > 0 && (
          <>
            <Text style={[styles.meta, { color: theme.textTertiary }]}> · </Text>
            <Text style={[styles.meta, { color: theme.textTertiary }]}>{date}</Text>
          </>
        )}
      </View>
    </View>
  );

  if (interactive && session !== undefined) {
    return (
      <Pressable
        onPress={() => onPress?.(session.id)}
        style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
        {body}
      </Pressable>
    );
  }

  return body;
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    letterSpacing: -0.2,
  },
  edit: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  subtitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meta: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.3,
  },
  pressed: {
    opacity: 0.6,
  },
});
