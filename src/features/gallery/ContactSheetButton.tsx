/**
 * src/features/gallery/ContactSheetButton.tsx
 *
 * Pro-gated "Contact Sheet" action for the Gallery.
 *
 * A true contact sheet composites every frame of a roll into a single
 * grid image. expo-image-manipulator cannot composite multiple images, and no
 * native/Skia compositor is wired into modules/ yet, so this is an MVP STUB:
 * it is gated behind <ProGate> and, when tapped, explains the feature and
 * offers a pragmatic stand-in (export all processed frames to Photos).
 *
 * TODO(P0 / orchestrator): implement the real grid composite — render the
 * roll's thumbnails into a @shopify/react-native-skia canvas (already a
 * dependency), snapshot it, and save/share the resulting sheet.
 */

import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { ProBadge } from '@/theme/pro-badge';
import { ProGate } from '@/monetization';
import { useGalleryStore } from '@/state/galleryStore';

import { exportImagesToPhotos } from './exportImage';

function ContactSheetInner() {
  const theme = useTheme();
  const displayedImages = useGalleryStore((s) => s.displayedImages);
  const [busy, setBusy] = useState(false);

  const handlePress = useCallback(() => {
    const processed = displayedImages.filter((img) => img.isProcessed);
    Alert.alert(
      'Contact Sheet',
      'Grid composites are coming soon. For now you can export every processed frame in this roll to your Photos library.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Export ${processed.length}`,
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const { saved, failed, firstError } = await exportImagesToPhotos(processed);
                if (saved > 0 && failed === 0) {
                  Alert.alert('Exported', `Saved ${saved} frames to your library.`);
                } else if (saved > 0) {
                  Alert.alert('Partly exported', `Saved ${saved}, ${failed} failed.`);
                } else {
                  Alert.alert('Export failed', firstError ?? 'No frames were saved.');
                }
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [displayedImages]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.backgroundCard, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      {busy ? (
        <ActivityIndicator size="small" color={theme.accent} />
      ) : (
        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.text }]}>Contact Sheet</Text>
          <ProBadge size="sm" />
        </View>
      )}
    </Pressable>
  );
}

/** Pro-gated entry point. Free users get a compact upgrade prompt instead. */
export function ContactSheetButton() {
  return (
    <ProGate featureName="Contact Sheet">
      <ContactSheetInner />
    </ProGate>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  pressed: {
    opacity: 0.8,
  },
});
