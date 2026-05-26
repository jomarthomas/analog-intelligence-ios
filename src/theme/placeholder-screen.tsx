/**
 * PlaceholderScreen — used by every tab until its feature agent wires up the
 * real content. Shows the screen title, a one-line purpose, and a "wired up
 * next" note in the brand aesthetic.
 *
 * Usage:
 *   <PlaceholderScreen
 *     title="Scan"
 *     purpose="Capture film negatives using the device camera."
 *     icon="camera.fill"
 *   />
 */

import { StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Palette, Radius, Spacing } from '@/constants/theme';

type PlaceholderScreenProps = {
  title: string;
  purpose: string;
  /** SF Symbol name. Must be a valid SFSymbol literal for type safety. */
  icon?: SFSymbol;
  /** Indicates that this screen requires Pro. */
  pro?: boolean;
};

export function PlaceholderScreen({ title, purpose, icon, pro = false }: PlaceholderScreenProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Icon */}
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: theme.accentMuted }]}>
          <SymbolView
            name={icon}
            tintColor={theme.accent}
            size={36}
            fallback={<Text style={[styles.iconFallback, { color: theme.accent }]}>■</Text>}
          />
        </View>
      ) : null}

      {/* Title row */}
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {pro && (
          <View style={[styles.proBadge, { backgroundColor: Palette.proBadgeBg }]}>
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
        )}
      </View>

      {/* Purpose */}
      <Text style={[styles.purpose, { color: theme.textSecondary }]}>{purpose}</Text>

      {/* Wired-up note */}
      <View style={[styles.noteBubble, { backgroundColor: theme.backgroundCard, borderColor: theme.border }]}>
        <Text style={[styles.noteText, { color: theme.textSecondary }]}>
          Wired up next — feature agent mounts here
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  iconFallback: {
    fontSize: 36,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.semibold,
    letterSpacing: -0.3,
  },
  proBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  proBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Palette.proBadgeText,
    letterSpacing: 0.5,
  },
  purpose: {
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: FontSize.md * 1.5,
    maxWidth: 280,
  },
  noteBubble: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteText: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
});
