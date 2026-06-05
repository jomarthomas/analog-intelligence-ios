/**
 * SectionHeader — all-caps section label, matching legacy Swift app style.
 *
 * Usage:
 *   <SectionHeader title="Exposure analysis" />
 *   <SectionHeader title="Template-based" right={<ProBadge />} />
 */

import { ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Spacing } from '@/constants/theme';

type SectionHeaderProps = {
  title: string;
  right?: ReactNode;
  style?: ViewStyle;
};

export function SectionHeader({ title, right, style }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.title, { color: theme.textTertiary }]}>
        {title.toUpperCase()}
      </Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  title: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.8,
  },
});
