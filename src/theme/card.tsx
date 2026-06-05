/**
 * Card — rounded-corner dark card container.
 *
 * Usage:
 *   <Card>…content…</Card>
 *   <Card padding="lg" elevated>…</Card>
 */

import { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Radius, Shadow, Spacing } from '@/constants/theme';

type PaddingSize = 'none' | 'sm' | 'md' | 'lg';

type CardProps = {
  children: ReactNode;
  padding?: PaddingSize;
  elevated?: boolean;
  style?: ViewStyle;
};

const paddingMap: Record<PaddingSize, number> = {
  none: 0,
  sm: Spacing.sm,
  md: Spacing.md,
  lg: Spacing.lg,
};

export function Card({ children, padding = 'md', elevated = false, style }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundCard, padding: paddingMap[padding] },
        elevated && Shadow.card,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
});
