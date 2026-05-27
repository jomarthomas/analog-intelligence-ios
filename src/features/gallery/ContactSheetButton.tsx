/**
 * src/features/gallery/ContactSheetButton.tsx
 *
 * Pro-gated "Contact Sheet" action for the Gallery.
 *
 * Implements a real Skia grid composite:
 *   1. Gather thumbnail URIs (or processed URIs as fallback) from the gallery.
 *   2. Call buildContactSheet() from the Skia offscreen compositor — draws all
 *      frames into a grid on a CPU-raster SkSurface, snapshots to JPEG.
 *   3. Offer to share the sheet (expo-sharing) or save to Photos (expo-media-library).
 *
 * The ProGate wrapper remains: free users see a compact upgrade prompt.
 */

import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { ProBadge } from '@/theme/pro-badge';
import { ProGate } from '@/monetization';
import { useGalleryStore } from '@/state/galleryStore';
import { buildContactSheet } from '@/lib/skiaOffscreenCompositor';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLUMNS = 3;
const CELL_WIDTH = 400;
const CELL_HEIGHT = 300;
const PADDING = 16;

// ---------------------------------------------------------------------------
// Inner component (only rendered when Pro is active)
// ---------------------------------------------------------------------------

function ContactSheetInner() {
  const theme = useTheme();
  const displayedImages = useGalleryStore((s) => s.displayedImages);
  const [busy, setBusy] = useState(false);

  const handlePress = useCallback(() => {
    // Collect the best available URI for each image (thumbnail first for speed,
    // then processedUri, then originalUri). Skip images with no URI at all.
    const uris: string[] = displayedImages
      .map((img) => img.thumbnailUri ?? img.processedUri ?? img.originalUri)
      .filter((uri): uri is string => typeof uri === 'string');

    if (uris.length === 0) {
      Alert.alert('No images', 'There are no images to include in the contact sheet.');
      return;
    }

    Alert.alert(
      'Contact Sheet',
      `Create a contact sheet from ${uris.length} frame${uris.length === 1 ? '' : 's'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save to Photos',
          onPress: () => {
            void handleGenerate(uris, 'photos');
          },
        },
        {
          text: 'Share',
          onPress: () => {
            void handleGenerate(uris, 'share');
          },
        },
      ],
    );
  }, [displayedImages]);

  const handleGenerate = useCallback(
    async (uris: string[], destination: 'photos' | 'share') => {
      setBusy(true);
      try {
        const { uri } = await buildContactSheet(uris, {
          columns: COLUMNS,
          cellWidth: CELL_WIDTH,
          cellHeight: CELL_HEIGHT,
          padding: PADDING,
          backgroundColor: '#141418',
          showFrameNumbers: true,
          jpegQuality: 90,
        });

        if (destination === 'photos') {
          const perm = await MediaLibrary.requestPermissionsAsync(true);
          if (!perm.granted) {
            Alert.alert(
              'Permission required',
              'Photos access is needed to save the contact sheet.',
            );
            return;
          }
          await MediaLibrary.saveToLibraryAsync(uri);
          Alert.alert('Saved', 'Contact sheet saved to your Photos library.');
        } else {
          const available = await Sharing.isAvailableAsync();
          if (!available) {
            Alert.alert('Unavailable', 'Sharing is not available on this device.');
            return;
          }
          await Sharing.shareAsync(uri, { mimeType: 'image/jpeg' });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to build contact sheet.';
        Alert.alert('Error', message);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

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

// ---------------------------------------------------------------------------
// Exported component
// ---------------------------------------------------------------------------

/** Pro-gated entry point. Free users get a compact upgrade prompt instead. */
export function ContactSheetButton() {
  return (
    <ProGate featureName="Contact Sheet">
      <ContactSheetInner />
    </ProGate>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
