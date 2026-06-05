/**
 * Gallery detail route — full-frame view of one scanned image.
 *
 * Route: gallery/[id]  (id = ScannedImage UUID)
 * Pushed from the Gallery grid on tap. Presented over the tabs.
 *
 * The screen chrome (nav bar) lives here; the body (image + export/delete/
 * re-adjust actions) is the reusable <GalleryDetailView> feature component.
 */

import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/theme/button';
import { FontSize, FontWeight, Spacing } from '@/constants/theme';
import { Screen } from '@/theme/screen';
import { GalleryDetailView } from '@/features/gallery';

export default function GalleryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={[styles.navBar, { borderBottomColor: theme.border }]}>
        <Button variant="ghost" size="sm" onPress={() => router.back()}>
          Back
        </Button>
        <Text style={[styles.navTitle, { color: theme.text }]}>SCAN</Text>
        {/* Spacer to centre the title (matches the Back button width). */}
        <View style={styles.navSpacer} />
      </View>

      <GalleryDetailView
        imageId={id}
        onReadjust={(imageId) => router.push(`/adjust/${imageId}`)}
        onBack={() => router.back()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.5,
  },
  navSpacer: {
    width: 64,
  },
});
