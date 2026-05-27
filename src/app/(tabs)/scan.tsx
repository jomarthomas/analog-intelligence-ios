/**
 * Scan tab — film-negative capture screen.
 *
 * Flow (legacy-ios/docs/PRODUCT_UI_SPEC.md):
 *   1. Camera preview fills the screen (CameraScanView owns the camera UI:
 *      frame-alignment overlay, manual controls, shutter, flash/torch).
 *   2. On capture, the ORIGINAL is persisted to storage and we navigate to
 *      the Adjust screen for the new image.
 *   3. Free tier shows a "SPONSORED AD" banner at the bottom (BannerAd renders
 *      null for Pro automatically).
 *
 * Capture → storage seam (the base64 bridge):
 *   CameraScanView.onCaptured(originalUri) hands us a `file://` URI to the raw
 *   capture in the cache. imageRepository.saveImage() currently expects an
 *   `imageBase64` payload, so we bridge by reading the file to base64 via the
 *   expo-file-system `File` API, then persist, then push to /adjust/[id].
 *
 *   TODO(storage): add imageRepository.saveOriginalFromUri(uri, …) so the
 *   capture path can avoid the base64 round-trip (large files) and just move
 *   the cache file into Documents/originals/. Until then the bridge below is
 *   the documented seam.
 *
 * Camera lifecycle: isActive is bound to tab focus (useIsFocused) so the
 * camera session is released when the user switches tabs.
 */

import { useCallback, useRef } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { File } from 'expo-file-system';
import { useIsFocused, useRouter } from 'expo-router';

import { CameraScanView } from '@/camera';
import { BannerAd, getProStatusSync } from '@/monetization';
import { saveImage } from '@/storage';
import type { CaptureMetadata } from '@/storage';
import { useGalleryStore } from '@/state/galleryStore';
import { Screen } from '@/theme/screen';

/** Map a captured file's extension to the storage CaptureMetadata format. */
function formatFromUri(uri: string): CaptureMetadata['format'] {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'dng':
      return 'raw';
    case 'jpg':
    case 'jpeg':
      return 'jpeg';
    case 'png':
      return 'png';
    case 'heic':
    default:
      return 'heic';
  }
}

export default function ScanScreen() {
  const isFocused = useIsFocused();
  const router = useRouter();

  // Guard against double-navigation if onCaptured fires twice in quick
  // succession (e.g. rapid taps before the screen blurs).
  const isPersistingRef = useRef(false);

  const handleCaptured = useCallback(
    async (originalUri: string) => {
      if (isPersistingRef.current) return;
      isPersistingRef.current = true;

      try {
        const store = useGalleryStore.getState();

        // 1. Ensure there is an active session to attach the frame to.
        let sessionId = store.currentSessionId;
        if (sessionId === null) {
          const session = await store.createSession({ name: 'New Roll' });
          sessionId = session.id;
        }

        // 2. Bridge the file:// capture into the base64 payload saveImage wants.
        const file = new File(originalUri);
        const imageBase64 = await file.base64();

        const format = formatFromUri(originalUri);
        const captureMetadata: CaptureMetadata = {
          whiteBalance: 'auto',
          format,
          focusLocked: false,
          exposureLocked: false,
          whiteBalanceLocked: false,
        };

        // 3. Persist the original (writes file + thumbnail + SQLite row).
        const newImage = await saveImage({
          imageBase64,
          format,
          sessionId,
          captureMetadata,
          wasProAtCapture: getProStatusSync(),
        });

        // 4. Refresh the store so the gallery + adjust screen see the new frame,
        //    then navigate to Adjust.
        await store.loadGallery();
        router.push(`/adjust/${newImage.id}`);
      } catch (err) {
        Alert.alert(
          'Could not save scan',
          err instanceof Error ? err.message : 'An unexpected error occurred.',
        );
      } finally {
        isPersistingRef.current = false;
      }
    },
    [router],
  );

  const handleError = useCallback((error: unknown) => {
    Alert.alert(
      'Camera error',
      error instanceof Error ? error.message : 'The camera reported an error.',
    );
  }, []);

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.cameraArea}>
        <CameraScanView
          isActive={isFocused}
          onCaptured={(uri) => void handleCaptured(uri)}
          onError={handleError}
        />
      </View>

      {/* Free-tier sponsored banner (renders null for Pro). */}
      <BannerAd />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraArea: {
    flex: 1,
  },
});
