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
 * Wired capabilities (task #13):
 *   - AUTO FRAME-DETECTION: after capture, detectFilmFrame(originalUri) runs
 *     non-blocking. If found, DetectedFrameOverlay is shown and the user can
 *     apply the cropRect into the Adjust flow. If not found, the normal
 *     FrameAlignmentOverlay fallback remains in CameraScanView.
 *   - DOCK UI: when a dock is connected, a DockStatusBar is shown and the
 *     "Start Roll Scan" / "Stop Roll Scan" controls appear. Jam / disconnect
 *     errors surface as Alerts. The normal handheld capture flow is intact
 *     when no dock is connected.
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

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { File } from 'expo-file-system';
import { useIsFocused, useRouter } from 'expo-router';

import { CameraScanView } from '@/camera';
import { BannerAd, getProStatusSync } from '@/monetization';
import { saveImage } from '@/storage';
import type { CaptureMetadata } from '@/storage';
import { useGalleryStore } from '@/state/galleryStore';
import { useDockStore } from '@/state/useDockStore';
import { Screen } from '@/theme/screen';
import { Palette, Spacing, FontSize, FontWeight, Radius } from '@/theme';

import { DetectedFrameOverlay, DockStatusBar } from '@/features/scan';
import { detectFilmFrame } from '../../../modules/ai-image-processing';
import type { FrameDetectionResult } from '../../../modules/ai-image-processing';

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** State for a pending frame-detection result waiting for user action. */
type PendingDetection = {
  uri: string;
  result: FrameDetectionResult;
  /** The image pixel dimensions needed to scale quad coordinates. */
  imageSize: { width: number; height: number };
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ScanScreen() {
  const isFocused = useIsFocused();
  const router = useRouter();

  // Guard against double-navigation if onCaptured fires twice in quick succession.
  const isPersistingRef = useRef(false);

  // ── Frame detection state ─────────────────────────────────────────────────

  /**
   * When set, a DetectedFrameOverlay is shown. The user can apply the cropRect
   * or dismiss. Cleared after navigation or user action.
   */
  const [pendingDetection, setPendingDetection] = useState<PendingDetection | null>(null);

  /**
   * cropRect that the user approved from a frame-detection result. Carried
   * into the Adjust screen via the router params.
   * NOTE: expo-router's typed routes require params to be strings, so we
   * JSON-encode the rect and let the adjust screen decode it.
   */
  const approvedCropRectRef = useRef<NonNullable<FrameDetectionResult['cropRect']> | null>(null);

  /** Layout dimensions of the camera area container — needed to scale quad coords. */
  const [cameraLayout, setCameraLayout] = useState({ width: 0, height: 0 });

  const handleCameraLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCameraLayout({ width, height });
  }, []);

  // ── Dock state ────────────────────────────────────────────────────────────

  const dockStatus = useDockStore((s) => s.status);
  const dockConnect = useDockStore((s) => s.connect);
  const dockStartRollScan = useDockStore((s) => s.startRollScan);
  const dockStopRollScan = useDockStore((s) => s.stopRollScan);
  const dockDisconnect = useDockStore((s) => s.disconnect);
  const isConnecting = useDockStore((s) => s.isConnecting);

  const isDockConnected =
    dockStatus.state !== 'idle' && dockStatus.state !== 'connectingToDock';

  // Surface dock errors as Alerts.
  useEffect(() => {
    if (dockStatus.state === 'error' && dockStatus.lastError !== null) {
      Alert.alert(
        'Dock error',
        dockStatus.lastError,
        [
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: () => void dockDisconnect(),
          },
          { text: 'OK' },
        ],
      );
    }
  }, [dockStatus.state, dockStatus.lastError, dockDisconnect]);

  // ── Capture handler ───────────────────────────────────────────────────────

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

        // 4. Kick off auto frame-detection NON-BLOCKING — do not await here.
        //    The detection promise resolves in the background; if it succeeds
        //    we show the overlay BEFORE navigating so the user can approve/dismiss.
        //    If detection fails or returns found=false we navigate immediately.
        detectFilmFrame(originalUri)
          .then((result) => {
            if (result.found && result.quad) {
              // Pause navigation — show the overlay.
              setPendingDetection({
                uri: originalUri,
                result,
                // Image dimensions: not available from the URI alone without
                // parsing EXIF. We fall back to the camera layout dimensions
                // as a best-effort approximation for the coordinate scaling.
                // TODO(integration): get true image dimensions from capturePhoto result.
                imageSize: cameraLayout.width > 0
                  ? { width: cameraLayout.width, height: cameraLayout.height }
                  : { width: 4032, height: 3024 }, // common 12MP default
              });
              // Store imageId so we can navigate after user acts.
              pendingImageIdRef.current = newImage.id;
            } else {
              // No frame found — navigate immediately.
              void store.loadGallery().then(() => {
                router.push(`/adjust/${newImage.id}`);
              });
            }
          })
          .catch(() => {
            // Detection failed → navigate without crop.
            void store.loadGallery().then(() => {
              router.push(`/adjust/${newImage.id}`);
            });
          });

        // Note: navigation is now deferred to the detection .then() / .catch()
        // above, or to the overlay's onApplyCrop / onDismiss handlers.

      } catch (err) {
        Alert.alert(
          'Could not save scan',
          err instanceof Error ? err.message : 'An unexpected error occurred.',
        );
      } finally {
        isPersistingRef.current = false;
      }
    },
    [router, cameraLayout],
  );

  // Ref to hold the image ID while we wait for the user to act on the overlay.
  const pendingImageIdRef = useRef<string | null>(null);

  const handleApplyCrop = useCallback(
    (cropRect: NonNullable<FrameDetectionResult['cropRect']>) => {
      approvedCropRectRef.current = cropRect;
      setPendingDetection(null);
      const imageId = pendingImageIdRef.current;
      if (imageId !== null) {
        // Encode cropRect as a JSON query param so the Adjust screen can decode.
        // expo-router typed-routes allow string params; we pass cropRect as a
        // JSON string and the Adjust screen decodes it.
        void useGalleryStore.getState().loadGallery().then(() => {
          router.push({
            pathname: `/adjust/${imageId}`,
            params: { cropRect: JSON.stringify(cropRect) },
          } as Parameters<typeof router.push>[0]);
        });
      }
    },
    [router],
  );

  const handleDismissDetection = useCallback(() => {
    setPendingDetection(null);
    const imageId = pendingImageIdRef.current;
    if (imageId !== null) {
      void useGalleryStore.getState().loadGallery().then(() => {
        router.push(`/adjust/${imageId}`);
      });
    }
  }, [router]);

  const handleError = useCallback((error: unknown) => {
    Alert.alert(
      'Camera error',
      error instanceof Error ? error.message : 'The camera reported an error.',
    );
  }, []);

  // ── Dock action handlers ──────────────────────────────────────────────────

  const handleSimulateDock = useCallback(async () => {
    try {
      await dockConnect({ simulation: true });
    } catch (err) {
      Alert.alert(
        'Dock connect failed',
        err instanceof Error ? err.message : 'Could not connect to simulated dock.',
      );
    }
  }, [dockConnect]);

  const handleStartRollScan = useCallback(() => {
    try {
      dockStartRollScan({ frameCount: 36 });
    } catch (err) {
      Alert.alert(
        'Scan error',
        err instanceof Error ? err.message : 'Could not start roll scan.',
      );
    }
  }, [dockStartRollScan]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      {/* Dock status bar — shown only when dock is connected */}
      {isDockConnected ? (
        <View style={styles.dockBarWrap}>
          <DockStatusBar status={dockStatus} />
        </View>
      ) : null}

      <View style={styles.cameraArea} onLayout={handleCameraLayout}>
        <CameraScanView
          isActive={isFocused && !pendingDetection}
          onCaptured={(uri) => void handleCaptured(uri)}
          onError={handleError}
        />

        {/* Detected-frame overlay — shown non-blockingly after capture */}
        {pendingDetection !== null ? (
          <DetectedFrameOverlay
            detection={pendingDetection.result}
            imageSize={pendingDetection.imageSize}
            containerSize={cameraLayout}
            onApplyCrop={handleApplyCrop}
            onDismiss={handleDismissDetection}
          />
        ) : null}
      </View>

      {/* Dock controls — shown below camera when connected */}
      {isDockConnected ? (
        <DockControls
          state={dockStatus.state}
          onStartRollScan={handleStartRollScan}
          onStopRollScan={dockStopRollScan}
          onDisconnect={() => void dockDisconnect()}
        />
      ) : (
        /* Dev shortcut: connect simulated dock when none is connected */
        <View style={styles.dockConnectRow}>
          <TouchableOpacity
            style={[styles.connectBtn, isConnecting && styles.connectBtnDisabled]}
            disabled={isConnecting}
            onPress={() => void handleSimulateDock()}
            accessibilityRole="button"
            accessibilityLabel="Connect simulated dock">
            <Text style={styles.connectBtnText}>
              {isConnecting ? 'Connecting…' : 'Connect Dock (Sim)'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Free-tier sponsored banner (renders null for Pro). */}
      <BannerAd />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Dock controls sub-component
// ---------------------------------------------------------------------------

type DockControlsProps = {
  state: string;
  onStartRollScan: () => void;
  onStopRollScan: () => void;
  onDisconnect: () => void;
};

function DockControls({
  state,
  onStartRollScan,
  onStopRollScan,
  onDisconnect,
}: DockControlsProps) {
  const canStart = state === 'waitingForDockAlignment';
  const canStop = state !== 'idle' && state !== 'completed' && state !== 'error';
  const isActive =
    state === 'capturing' || state === 'verifyingQuality' || state === 'retryingCapture';

  return (
    <View style={styles.dockControls}>
      {canStart ? (
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onStartRollScan}
          accessibilityRole="button"
          accessibilityLabel="Start roll scan">
          <Text style={styles.primaryBtnText}>Start Roll Scan</Text>
        </TouchableOpacity>
      ) : null}

      {isActive ? (
        <View style={styles.scanningRow}>
          <View style={[styles.scanDot, { backgroundColor: Palette.ink }]} />
          <Text style={styles.scanningText}>Scanning…</Text>
        </View>
      ) : null}

      {canStop ? (
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={onStopRollScan}
          accessibilityRole="button"
          accessibilityLabel="Stop roll scan">
          <Text style={styles.secondaryBtnText}>Stop Scan</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={styles.disconnectBtn}
        onPress={onDisconnect}
        accessibilityRole="button"
        accessibilityLabel="Disconnect dock">
        <Text style={styles.disconnectBtnText}>Disconnect</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  cameraArea: {
    flex: 1,
  },
  dockBarWrap: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  dockControls: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  primaryBtn: {
    backgroundColor: Palette.ink,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: Palette.black,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  secondaryBtnText: {
    color: Palette.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  disconnectBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  disconnectBtnText: {
    color: Palette.danger,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  scanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  scanDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scanningText: {
    color: Palette.white,
    fontSize: FontSize.sm,
  },
  dockConnectRow: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  connectBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Palette.ash,
  },
  connectBtnDisabled: {
    opacity: 0.5,
  },
  connectBtnText: {
    color: Palette.ash,
    fontSize: FontSize.sm,
  },
});
