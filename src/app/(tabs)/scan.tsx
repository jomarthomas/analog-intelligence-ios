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
 * Wired capabilities:
 *   - AUTO-CROP ON CAPTURE: after capture, autoCropToFilmFrame(originalUri,…)
 *     detects the film boundary and SILENTLY crops the captured file down to the
 *     negative BEFORE it is saved or processed — so the engine never sees the
 *     bright room behind a held-up negative (which would blow the result to
 *     white). Detection/crop failures fall back to the full frame gracefully and
 *     the flow continues unchanged. The user is never asked to confirm a crop;
 *     the dimmed alignment guide in CameraScanView already framed the shot.
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
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { File } from 'expo-file-system';
import { useIsFocused, useRouter } from 'expo-router';

import { CameraScanView } from '@/camera';
import type { CaptureMeta } from '@/camera';
import { autoCropToFilmFrame } from '@/camera/autoCrop';
import { BannerAd, getProStatusSync } from '@/monetization';
import { saveImage } from '@/storage';
import type { CaptureMetadata } from '@/storage';
import { useGalleryStore } from '@/state/galleryStore';
import { useDockStore } from '@/state/useDockStore';
import { useCaptureStore } from '@/state/captureStore';
import { Screen } from '@/theme/screen';
import { Palette, Spacing, FontSize, FontWeight, Radius } from '@/theme';

import { DockStatusBar } from '@/features/scan';

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
// Screen
// ---------------------------------------------------------------------------

export default function ScanScreen() {
  const isFocused = useIsFocused();
  const router = useRouter();

  // Guard against double-navigation if onCaptured fires twice in quick succession.
  const isPersistingRef = useRef(false);

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

  // ── Batch capture mode ────────────────────────────────────────────────────
  const batchMode = useCaptureStore((s) => s.batchMode);
  const toggleBatchMode = useCaptureStore((s) => s.toggleBatchMode);
  const multiShot = useCaptureStore((s) => s.multiShot);
  const toggleMultiShot = useCaptureStore((s) => s.toggleMultiShot);
  const [batchCount, setBatchCount] = useState(0);

  const handleToggleBatch = useCallback(() => {
    setBatchCount(0);
    toggleBatchMode();
  }, [toggleBatchMode]);

  // ── Capture handler ───────────────────────────────────────────────────────

  const handleCaptured = useCallback(
    async (originalUri: string, meta: CaptureMeta) => {
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

        // 2. AUTO-CROP to the film frame BEFORE saving/processing. This is the
        //    core fix: a held-up negative is a small part of the shot against a
        //    bright room, which would blow the engine to white. We crop to just
        //    the negative so the pipeline only ever sees film. On ANY failure
        //    (no frame / low confidence / manipulator error / unknown dims) this
        //    returns the original uri unchanged — the flow continues full-frame.
        const cropped = await autoCropToFilmFrame(originalUri, meta.width, meta.height);
        const sourceUri = cropped.uri;

        // 3. Bridge the file:// capture into the base64 payload saveImage wants.
        //    NOTE: after an auto-crop the file is a re-encoded JPEG; format must
        //    track the ACTUAL file written, not the original capture container.
        const file = new File(sourceUri);
        const imageBase64 = await file.base64();

        const format = formatFromUri(sourceUri);
        const captureMetadata: CaptureMetadata = {
          whiteBalance: 'auto',
          format,
          focusLocked: false,
          exposureLocked: false,
          whiteBalanceLocked: false,
        };

        // 4. Persist (writes file + thumbnail + SQLite row).
        const newImage = await saveImage({
          imageBase64,
          format,
          sessionId,
          captureMetadata,
          wasProAtCapture: getProStatusSync(),
        });

        // 4b. Batch mode: stay on the camera and keep shooting. Just refresh the
        //     roll so counts/thumbnails update; the user reviews & edits the whole
        //     roll later from the Gallery. (The #1 mobile-scanner workflow ask.)
        if (useCaptureStore.getState().batchMode) {
          await store.loadGallery();
          setBatchCount((c) => c + 1);
          return;
        }

        // 5. Navigate to Adjust. The image is already cropped to the film, so no
        //    cropRect needs to be threaded through — Adjust opens on the negative.
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

      <View style={styles.cameraArea}>
        <CameraScanView
          isActive={isFocused}
          onCaptured={(uri, meta) => void handleCaptured(uri, meta)}
          onError={handleError}
        />

        {/* Batch capture controls — shoot a whole roll, review/edit later */}
        <View style={styles.batchBar} pointerEvents="box-none">
          <TouchableOpacity
            onPress={handleToggleBatch}
            accessibilityRole="button"
            accessibilityState={{ selected: batchMode }}
            accessibilityLabel="Batch capture mode"
            style={[styles.batchPill, batchMode && styles.batchPillActive]}>
            <Text style={[styles.batchPillText, batchMode && styles.batchPillTextActive]}>
              {batchMode ? `Batch · ${batchCount}` : 'Batch'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={toggleMultiShot}
            accessibilityRole="button"
            accessibilityState={{ selected: multiShot }}
            accessibilityLabel="Multi-shot denoise mode"
            style={[styles.batchPill, multiShot && styles.batchPillActive]}>
            <Text style={[styles.batchPillText, multiShot && styles.batchPillTextActive]}>
              {multiShot ? 'Multi · 4' : 'Multi'}
            </Text>
          </TouchableOpacity>
          {batchMode && batchCount > 0 ? (
            <TouchableOpacity
              onPress={() => router.push('/gallery')}
              accessibilityRole="button"
              accessibilityLabel={`Review ${batchCount} captured frames`}
              style={styles.reviewPill}>
              <Text style={styles.reviewPillText}>Review {batchCount}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Dock controls — shown below camera when connected */}
      {isDockConnected ? (
        <DockControls
          state={dockStatus.state}
          onStartRollScan={handleStartRollScan}
          onStopRollScan={dockStopRollScan}
          onDisconnect={() => void dockDisconnect()}
        />
      ) : __DEV__ ? (
        /* Dev-only shortcut (hidden in production): connect a simulated dock.
           Real dock pairing lives in Settings › Developer. */
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
      ) : null}

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
  // Batch controls — over the always-dark viewfinder, so fixed monochrome.
  batchBar: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  batchPill: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  batchPillActive: {
    backgroundColor: Palette.ink,
    borderColor: Palette.ink,
  },
  batchPillText: {
    color: Palette.ink,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  batchPillTextActive: {
    color: Palette.black,
  },
  reviewPill: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Palette.ink,
  },
  reviewPillText: {
    color: Palette.black,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
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
