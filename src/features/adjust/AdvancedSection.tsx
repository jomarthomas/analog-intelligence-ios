/**
 * src/features/adjust/AdvancedSection.tsx
 *
 * A single, on-brand "Advanced" disclosure for the Adjust screen. Collapsed by
 * default so the screen reads effortlessly at a glance; tapping the header
 * reveals the power controls (fine sliders, Auto-WB, AI toggles, insight).
 *
 * Visual language matches <SectionHeader>: an all-caps tertiary label, a large
 * full-width tap target, and a rotating chevron caret. Pure black & white — the
 * caret and rule use theme tokens only (no colour).
 *
 * Controlled, so the parent owns the open/closed state (lets the screen reset
 * disclosure on "Reset" and keeps it out of the live-preview render path).
 */

import { ReactNode, memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Spacing } from '@/constants/theme';

export type AdvancedSectionProps = {
  /** All-caps section label (defaults to "Advanced"). */
  title?: string;
  /** Whether the body is currently revealed. */
  expanded: boolean;
  /** Toggle handler — the parent flips `expanded`. */
  onToggle: () => void;
  /** Power controls, rendered only while expanded. */
  children: ReactNode;
};

function AdvancedSectionImpl({
  title = 'Advanced',
  expanded,
  onToggle,
  children,
}: AdvancedSectionProps) {
  const theme = useTheme();

  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title} controls`}
        hitSlop={8}
        style={({ pressed }) => [
          styles.header,
          { borderTopColor: theme.divider },
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.title, { color: theme.textTertiary }]}>
          {title.toUpperCase()}
        </Text>
        {/* Rotating caret: ▸ when collapsed, ▾ when expanded. Monochrome. */}
        <Text
          style={[
            styles.caret,
            { color: theme.textTertiary },
            expanded && styles.caretOpen,
          ]}>
          ▸
        </Text>
      </Pressable>

      {expanded ? (
        <Animated.View entering={FadeIn.duration(180)} style={styles.body}>
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

export const AdvancedSection = memo(AdvancedSectionImpl);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.6,
  },
  title: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.8,
  },
  caret: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  caretOpen: {
    transform: [{ rotate: '90deg' }],
  },
  body: {
    gap: Spacing.sm,
  },
});
