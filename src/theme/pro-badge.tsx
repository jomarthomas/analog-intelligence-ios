/**
 * ProBadge — small "PRO" pill used throughout the app to gate features.
 *
 * Black & white: an inverted high-contrast pill (black-on-white in light mode,
 * white-on-black in dark mode) via the theme accent / accentText pair.
 *
 * Usage:
 *   <ProBadge />
 *   <ProBadge size="lg" />
 */

import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';

type ProBadgeProps = {
  size?: 'sm' | 'md' | 'lg';
};

export function ProBadge({ size = 'sm' }: ProBadgeProps) {
  const theme = useTheme();

  const fontSize =
    size === 'lg' ? FontSize.sm : size === 'md' ? FontSize.xs : 10;
  const px = size === 'lg' ? Spacing.sm : Spacing.xs;
  const py = size === 'lg' ? 3 : 2;

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: theme.accent, paddingHorizontal: px, paddingVertical: py },
      ]}>
      <Text style={[styles.text, { color: theme.accentText, fontSize }]}>PRO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },
});
