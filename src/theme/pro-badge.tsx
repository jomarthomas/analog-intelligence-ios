/**
 * ProBadge — small orange "PRO" pill used throughout the app to gate features.
 *
 * Usage:
 *   <ProBadge />
 *   <ProBadge size="lg" />
 */

import { StyleSheet, Text, View } from 'react-native';

import { FontSize, FontWeight, Palette, Radius, Spacing } from '@/constants/theme';

type ProBadgeProps = {
  size?: 'sm' | 'md' | 'lg';
};

export function ProBadge({ size = 'sm' }: ProBadgeProps) {
  const fontSize =
    size === 'lg' ? FontSize.sm : size === 'md' ? FontSize.xs : 10;
  const px = size === 'lg' ? Spacing.sm : Spacing.xs;
  const py = size === 'lg' ? 3 : 2;

  return (
    <View
      style={[
        styles.badge,
        { paddingHorizontal: px, paddingVertical: py },
      ]}>
      <Text style={[styles.text, { fontSize }]}>PRO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: Palette.proBadgeBg,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: Palette.proBadgeText,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
});
