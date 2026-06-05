/**
 * src/features/gallery/GalleryDetailView.tsx
 *
 * Full-frame detail view for a single scanned image, mounted by the
 * src/app/gallery/[id].tsx route.
 *
 *   - Shows the processed positive (falls back to the original) via expo-image,
 *     wrapped in <WatermarkOverlay> for the free tier.
 *   - Export: action sheet → Save to Photos / Share (exportImage()).
 *   - Re-adjust: navigates back into the Adjust screen for this frame.
 *   - Delete: confirmation → galleryStore.deleteImage → back.
 *
 * The image is read from useGalleryStore by id so it stays live across edits.
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/theme/button';
import { FontSize, FontWeight, Palette, Spacing } from '@/constants/theme';
import { WatermarkOverlay } from '@/monetization';
import { useGalleryStore } from '@/state/galleryStore';

import { exportImage } from './exportImage';
import { exportFrameSidecar } from './metadataSidecar';
import { FrameMetadataPanel } from './FrameMetadataPanel';

export type GalleryDetailViewProps = {
  imageId: string;
  /** Navigate into the Adjust screen for this frame. */
  onReadjust: (imageId: string) => void;
  /** Pop back to the gallery list. */
  onBack: () => void;
};

export function GalleryDetailView({ imageId, onReadjust, onBack }: GalleryDetailViewProps) {
  const theme = useTheme();
  const { height: windowHeight } = useWindowDimensions();

  const image = useGalleryStore((s) => s.allImages.find((i) => i.id === imageId));
  const session = useGalleryStore((s) =>
    image ? s.allSessions.find((x) => x.id === image.sessionId) : undefined,
  );
  const deleteImage = useGalleryStore((s) => s.deleteImage);
  const refreshSession = useGalleryStore((s) => s.refreshSession);

  const [isExporting, setIsExporting] = useState(false);

  // 1-based position of this frame within its roll (for sidecar frameNumber).
  const frameNumber =
    session && image
      ? (() => {
          const idx = session.imageIds.indexOf(image.id);
          return idx >= 0 ? idx + 1 : undefined;
        })()
      : undefined;

  // WatermarkOverlay wraps children in a position:relative box (no flex), so
  // the image area needs an explicit height to fill the screen rather than
  // collapse. ~55% of the window leaves room for the status line + actions.
  const previewHeight = Math.round(windowHeight * 0.55);

  const runExport = useCallback(
    async (destination: 'photos' | 'share') => {
      if (image === undefined) return;
      setIsExporting(true);
      try {
        const result = await exportImage(image, destination);
        if (result.ok) {
          if (destination === 'photos') {
            Alert.alert('Saved', 'Exported to your Photos library.');
          }
        } else {
          Alert.alert('Export failed', result.message);
        }
      } finally {
        setIsExporting(false);
      }
    },
    [image],
  );

  const runSidecarExport = useCallback(async () => {
    if (image === undefined) return;
    setIsExporting(true);
    try {
      const result = await exportFrameSidecar(image, session, frameNumber);
      if (!result.ok) {
        Alert.alert('Metadata export failed', result.message);
      }
    } finally {
      setIsExporting(false);
    }
  }, [image, session, frameNumber]);

  const handleExport = useCallback(() => {
    Alert.alert('Export', 'Choose where to send this scan.', [
      { text: 'Save to Photos', onPress: () => void runExport('photos') },
      { text: 'Share…', onPress: () => void runExport('share') },
      { text: 'Metadata sidecar (JSON)', onPress: () => void runSidecarExport() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [runExport, runSidecarExport]);

  const handleDelete = useCallback(() => {
    Alert.alert('Delete scan?', 'This permanently removes the frame and its files.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await deleteImage(imageId);
            onBack();
          })();
        },
      },
    ]);
  }, [deleteImage, imageId, onBack]);

  if (image === undefined) {
    return (
      <View style={[styles.missing, { backgroundColor: theme.background }]}>
        <Text style={[styles.missingTitle, { color: theme.text }]}>Scan not found</Text>
        <Button onPress={onBack}>Back to Gallery</Button>
      </View>
    );
  }

  const displayUri = image.processedUri ?? image.originalUri;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.previewArea, { height: previewHeight }]}>
        <WatermarkOverlay>
          <View style={[styles.imageWrap, { height: previewHeight }]}>
            <Image
              source={{ uri: displayUri }}
              style={styles.image}
              contentFit="contain"
              transition={150}
              cachePolicy="memory-disk"
            />
          </View>
        </WatermarkOverlay>

        {isExporting && (
          <View style={styles.exportOverlay} pointerEvents="none">
            <ActivityIndicator color={theme.accent} size="large" />
          </View>
        )}
      </View>

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {/* Status line */}
        <Text style={[styles.status, { color: theme.textSecondary }]}>
          {image.isProcessed ? 'Processed' : 'Not yet processed'}
          {image.isRaw ? ' · RAW' : ''}
          {frameNumber !== undefined ? ` · Frame ${frameNumber}` : ''}
        </Text>

        {/* Actions */}
        <View style={styles.actions}>
          <Button variant="secondary" onPress={() => onReadjust(imageId)} style={styles.actionButton}>
            {image.isProcessed ? 'Re-adjust' : 'Adjust'}
          </Button>
          <Button onPress={handleExport} style={styles.actionButton}>
            Export
          </Button>
        </View>

        {/* Per-frame capture metadata + editable note */}
        <FrameMetadataPanel
          image={image}
          onNoteSaved={() => void refreshSession(image.sessionId)}
        />

        <View style={styles.deleteRow}>
          <Button variant="ghost" size="sm" onPress={handleDelete}>
            <Text style={{ color: Palette.danger, fontWeight: FontWeight.semibold }}>Delete scan</Text>
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  previewArea: {
    width: '100%',
  },
  imageWrap: {
    width: '100%',
  },
  image: {
    flex: 1,
  },
  exportOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  status: {
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  deleteRow: {
    alignItems: 'center',
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  missingTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semibold,
  },
});
