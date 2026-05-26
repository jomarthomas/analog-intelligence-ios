/**
 * Screen — safe-area wrapper with the app's dark background.
 *
 * Usage:
 *   <Screen>…content…</Screen>
 *   <Screen scrollable>…long content…</Screen>
 *   <Screen edges={['top', 'bottom']}>…</Screen>
 */

import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView, type Edges } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

type ScreenProps = {
  children: ReactNode;
  /** Wrap content in a ScrollView */
  scrollable?: boolean;
  /** Safe-area edges to inset (default: all) */
  edges?: Edges;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
};

export function Screen({
  children,
  scrollable = false,
  edges = ['top', 'bottom', 'left', 'right'],
  style,
  contentStyle,
}: ScreenProps) {
  const theme = useTheme();

  const bg = { backgroundColor: theme.background };

  if (scrollable) {
    return (
      <SafeAreaView style={[styles.flex, bg, style]} edges={edges}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, bg, style]} edges={edges}>
      <View style={[styles.flex, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
  },
});
