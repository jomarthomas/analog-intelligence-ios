/**
 * src/features/gallery/GalleryEmptyState.tsx
 *
 * Shown in the Gallery tab when there are no scanned frames yet.
 * Nudges the user toward the Scan tab.
 */

import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/theme/button';
import { FontSize, FontWeight, Spacing } from '@/constants/theme';

export type GalleryEmptyStateProps = {
  /** Navigate to the Scan tab. */
  onScan: () => void;
};

export function GalleryEmptyState({ onScan }: GalleryEmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <Text style={[styles.icon, { color: theme.textSecondary }]}>🎞️</Text>
      <Text style={[styles.title, { color: theme.text }]}>No scans yet</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        Capture a film negative on the Scan tab and it will appear here.
      </Text>
      <Button onPress={onScan}>Scan a negative</Button>
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
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semibold,
  },
  body: {
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: FontSize.md * 1.5,
    maxWidth: 280,
    marginBottom: Spacing.sm,
  },
});
