/**
 * src/features/adjust/AdjustPreview.tsx
 *
 * Live preview of the negative→positive conversion for the Adjust screen.
 *
 *   - Renders pipeline.previewUri via expo-image (contain, dark backdrop).
 *   - Falls back to the original capture while the first preview renders.
 *   - Shows a spinner overlay while pipeline.isProcessing is true.
 *   - Wrapped in <WatermarkOverlay> so the free-tier watermark is visible on
 *     the preview (Pro users see it clean; the overlay no-ops for them).
 */

import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { useTheme } from '@/hooks/use-theme';
import { Palette, Radius } from '@/constants/theme';
import { WatermarkOverlay } from '@/monetization';

export type AdjustPreviewProps = {
  /** file:// URI of the rendered positive (undefined until first render). */
  previewUri: string | undefined;
  /** Original capture URI — shown dimmed until the first preview lands. */
  originalUri: string;
  /** True while a preview re-process is in flight. */
  isProcessing: boolean;
};

export function AdjustPreview({
  previewUri,
  originalUri,
  isProcessing,
}: AdjustPreviewProps) {
  const theme = useTheme();

  // Until the first positive preview is ready, show the (negative) original so
  // the preview area is never blank. Dim it so the spinner reads as "working".
  const hasPreview = previewUri !== undefined;
  const displayUri = previewUri ?? originalUri;

  return (
    <WatermarkOverlay>
      <View style={[styles.container, { backgroundColor: Palette.black }]}>
        <Image
          source={{ uri: displayUri }}
          style={styles.image}
          contentFit="contain"
          transition={150}
          cachePolicy="memory-disk"
        />

        {(isProcessing || !hasPreview) && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator color={theme.accent} size="large" />
          </View>
        )}
      </View>
    </WatermarkOverlay>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 320,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  image: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
