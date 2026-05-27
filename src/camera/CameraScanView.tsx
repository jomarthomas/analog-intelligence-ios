/**
 * src/camera/CameraScanView.tsx
 *
 * Live camera preview + capture for the film-negative scan screen.
 * Built on react-native-vision-camera v5 (Nitro-based output-composition API).
 *
 * Responsibilities:
 *   • Request camera permission (via useCameraPermissions) and gate the UI.
 *   • Open the back camera, attach preview + photo outputs.
 *   • Capture in HEIC / JPEG, and RAW/DNG only where the device + VisionCamera
 *     support it (graceful fallback to HEIC otherwise).
 *   • Tap-to-focus, torch toggle, flash-mode cycle, capture-format picker.
 *   • Host the manual controls panel + frame-alignment overlay.
 *   • Read device capabilities/3A snapshot into the capture store so the manual
 *     controls + calibration lock can operate.
 *
 * Integration contract:
 *   <CameraScanView onCaptured={(originalUri) => router.push(`/adjust/...`)} />
 *   `onCaptured` receives a `file://` URI to the ORIGINAL, unprocessed capture.
 *   This component does NOT process images and does NOT know about expo-router —
 *   the orchestrator wires navigation in the Scan screen.
 *
 * Ported from legacy-ios/CameraView.swift + CameraManager.swift (AVFoundation
 * session management is replaced by VisionCamera's declarative outputs).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  usePhotoOutput,
  usePreviewOutput,
  type CameraRef,
  type TargetPhotoContainerFormat,
} from 'react-native-vision-camera';

import { Button } from '@/theme';
import { Palette, Spacing, FontSize, FontWeight, Radius } from '@/theme';
import { useCaptureStore, PEAKING_THRESHOLDS } from '@/state/captureStore';
import { useCameraPermissions } from '@/camera/useCameraPermissions';
import { useFrameProcessors } from '@/camera/useFrameProcessors';
import { readCapabilities, readSnapshot } from '@/camera/cameraController';
import { capturePhoto } from '@/camera/capturePhoto';
import { CAPTURE_FORMATS, CAPTURE_FORMAT_ORDER, type CaptureFormat } from '@/camera/types';
import { FrameAlignmentOverlay } from '@/features/scan/FrameAlignmentOverlay';
import { ManualControlsPanel } from '@/features/scan/ManualControlsPanel';

export interface CameraScanViewProps {
  /**
   * Called after a successful capture with a `file://` URI pointing at the
   * ORIGINAL, unprocessed image in the app cache. The caller (Scan screen /
   * orchestrator) owns what happens next (e.g. push to the adjust route).
   */
  onCaptured: (originalUri: string) => void;
  /**
   * Whether the camera session should be active. The Scan screen should set
   * this `false` when the tab is not focused to release the camera.
   * @default true
   */
  isActive?: boolean;
  /** Optional capture error reporter (e.g. toast). */
  onError?: (error: unknown) => void;
}

export function CameraScanView({
  onCaptured,
  isActive = true,
  onError,
}: CameraScanViewProps) {
  const permission = useCameraPermissions();

  if (permission.status === 'checking') {
    return <PermissionGate variant="checking" />;
  }
  if (!permission.hasPermission) {
    return (
      <PermissionGate
        variant={permission.status === 'blocked' ? 'blocked' : 'denied'}
        onRequest={permission.request}
        onOpenSettings={permission.openSettings}
      />
    );
  }

  return <ReadyCamera onCaptured={onCaptured} isActive={isActive} onError={onError} />;
}

// ---------------------------------------------------------------------------
// ReadyCamera — mounted only once permission is granted
// ---------------------------------------------------------------------------

function ReadyCamera({ onCaptured, isActive, onError }: Required<Pick<CameraScanViewProps, 'onCaptured' | 'isActive'>> & Pick<CameraScanViewProps, 'onError'>) {
  const cameraRef = useRef<CameraRef>(null);
  const device = useCameraDevice('back');

  const captureFormat = useCaptureStore((s) => s.captureFormat);
  const torchEnabled = useCaptureStore((s) => s.torchEnabled);
  const flashMode = useCaptureStore((s) => s.flashMode);
  const isCapturing = useCaptureStore((s) => s.isCapturing);
  const showFrameGuide = useCaptureStore((s) => s.showFrameGuide);
  const focusPeakingEnabled = useCaptureStore((s) => s.focusPeakingEnabled);
  const peakingSensitivity = useCaptureStore((s) => s.peakingSensitivity);
  const peakingColor = useCaptureStore((s) => s.peakingColor);
  const capabilities = useCaptureStore((s) => s.capabilities);

  const setCapabilities = useCaptureStore((s) => s.setCapabilities);
  const setSnapshot = useCaptureStore((s) => s.setSnapshot);
  const setIsCapturing = useCaptureStore((s) => s.setIsCapturing);
  const cycleFlashMode = useCaptureStore((s) => s.cycleFlashMode);
  const toggleTorch = useCaptureStore((s) => s.toggleTorch);
  const setCaptureFormat = useCaptureStore((s) => s.setCaptureFormat);

  // Resolve effective format, downgrading DNG when RAW isn't supported.
  const effectiveFormat: CaptureFormat =
    captureFormat === 'dng' && !capabilities.supportsRawCapture ? 'heic' : captureFormat;

  // Outputs: live preview + still photo. The photo output's container format is
  // driven by the selected capture format — VisionCamera v5 sets the container
  // at the OUTPUT level (not per-capture), and `usePhotoOutput` re-creates the
  // output (re-configuring the session) when `containerFormat` changes.
  const previewOutput = usePreviewOutput();
  const photoOutput = usePhotoOutput({
    qualityPrioritization: 'quality',
    containerFormat: toContainerFormat(effectiveFormat),
  });

  // Frame processors (stubbed — see useFrameProcessors). Outputs is [] today.
  const frame = useFrameProcessors(
    { enabled: focusPeakingEnabled, sensitivity: peakingSensitivity, color: peakingColor },
    /* detectionEnabled */ true,
  );

  const [sessionReady, setSessionReady] = useState(false);

  // Pull capabilities + initial 3A snapshot once the controller is bound.
  const refreshFromController = useCallback(() => {
    const controller = cameraRef.current?.controller;
    setCapabilities(readCapabilities(device, controller));
    setSnapshot(readSnapshot(controller));
  }, [device, setCapabilities, setSnapshot]);

  const handleStarted = useCallback(() => {
    setSessionReady(true);
    refreshFromController();
  }, [refreshFromController]);

  // Keep capabilities in sync if the device changes (e.g. lens switch).
  useEffect(() => {
    if (sessionReady) refreshFromController();
  }, [sessionReady, refreshFromController]);

  // Tap-to-focus: convert the tap into a metering point and focus snappily.
  const handleTapToFocus = useCallback(
    (event: GestureResponderEvent) => {
      const cam = cameraRef.current;
      const controller = cam?.controller;
      const preview = cam?.preview;
      if (controller == null || preview == null) return;
      if (!device?.supportsFocusMetering) return;
      const { locationX, locationY } = event.nativeEvent;
      try {
        const point = preview.createMeteringPoint(locationX, locationY);
        void controller.focusTo(point, { responsiveness: 'snappy' });
      } catch {
        // Preview not ready / metering unsupported — ignore.
      }
    },
    [device],
  );

  const handleCapture = useCallback(async () => {
    if (isCapturing || !sessionReady) return;
    setIsCapturing(true);
    try {
      const result = await capturePhoto(photoOutput, {
        format: effectiveFormat,
        flashMode,
        supportsRaw: capabilities.supportsRawCapture,
      });
      onCaptured(result.uri);
    } catch (err) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.error('[CameraScanView] capture failed:', err);
      }
      onError?.(err);
    } finally {
      setIsCapturing(false);
    }
  }, [
    isCapturing,
    sessionReady,
    photoOutput,
    effectiveFormat,
    flashMode,
    capabilities.supportsRawCapture,
    onCaptured,
    onError,
    setIsCapturing,
  ]);

  if (device == null) {
    return <PermissionGate variant="noDevice" />;
  }

  return (
    <View style={styles.root}>
      {/* Live preview — tap anywhere to focus */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTapToFocus}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isActive}
          outputs={[previewOutput, photoOutput, ...frame.outputs]}
          torchMode={torchEnabled ? 'on' : 'off'}
          resizeMode="cover"
          onStarted={handleStarted}
          onError={onError}
        />
      </Pressable>

      {/* Composition guide (also the manual fallback for frame detection) */}
      {showFrameGuide ? <FrameAlignmentOverlay /> : null}

      {/* Focus-peaking status pill (live overlay stubbed — see useFrameProcessors) */}
      {focusPeakingEnabled && !frame.isPeakingActive ? (
        <View style={styles.peakingNotice} pointerEvents="none">
          <Text style={styles.peakingNoticeText}>
            Focus peaking unavailable — use manual focus
          </Text>
        </View>
      ) : null}

      {/* Top controls: flash + format picker */}
      <View style={styles.topBar} pointerEvents="box-none">
        <TopButton
          label={flashLabel(flashMode)}
          active={flashMode !== 'off'}
          disabled={!capabilities.hasFlash}
          onPress={cycleFlashMode}
        />
        <FormatPicker
          value={effectiveFormat}
          supportsRaw={capabilities.supportsRawCapture}
          onChange={setCaptureFormat}
        />
        <TopButton
          label={torchEnabled ? 'Light On' : 'Light'}
          active={torchEnabled}
          disabled={!capabilities.hasTorch}
          onPress={toggleTorch}
        />
      </View>

      {/* Bottom controls: manual panel + shutter */}
      <View style={styles.bottomArea} pointerEvents="box-none">
        <ManualControlsPanel cameraRef={cameraRef} />

        <View style={styles.shutterRow} pointerEvents="box-none">
          <ShutterButton
            capturing={isCapturing}
            disabled={!sessionReady}
            onPress={() => void handleCapture()}
          />
        </View>
      </View>

      {!sessionReady ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={Palette.amber} />
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Permission / no-device gate
// ---------------------------------------------------------------------------

function PermissionGate({
  variant,
  onRequest,
  onOpenSettings,
}: {
  variant: 'checking' | 'denied' | 'blocked' | 'noDevice';
  onRequest?: () => Promise<boolean>;
  onOpenSettings?: () => Promise<void>;
}) {
  return (
    <View style={styles.gate}>
      {variant === 'checking' ? (
        <ActivityIndicator color={Palette.amber} />
      ) : (
        <>
          <Text style={styles.gateTitle}>
            {variant === 'noDevice' ? 'No camera found' : 'Camera access needed'}
          </Text>
          <Text style={styles.gateBody}>
            {variant === 'noDevice'
              ? 'This device has no usable back camera for scanning.'
              : variant === 'blocked'
                ? 'Camera access is turned off. Enable it in Settings to scan negatives.'
                : 'Analog Intelligence needs the camera to scan film negatives.'}
          </Text>
          {variant === 'denied' && onRequest ? (
            <Button onPress={() => void onRequest()}>Grant access</Button>
          ) : null}
          {variant === 'blocked' && onOpenSettings ? (
            <Button onPress={() => void onOpenSettings()}>Open Settings</Button>
          ) : null}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function ShutterButton({
  capturing,
  disabled,
  onPress,
}: {
  capturing: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || capturing}
      accessibilityRole="button"
      accessibilityLabel="Capture"
      style={({ pressed }) => [
        styles.shutterOuter,
        (disabled || capturing) && styles.shutterDisabled,
        pressed && styles.shutterPressed,
      ]}>
      <View style={[styles.shutterInner, capturing && styles.shutterInnerCapturing]}>
        {capturing ? <ActivityIndicator color={Palette.black} /> : null}
      </View>
    </Pressable>
  );
}

function TopButton({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.topButton,
        active && styles.topButtonActive,
        disabled && styles.topButtonDisabled,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.topButtonText, active && styles.topButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function FormatPicker({
  value,
  supportsRaw,
  onChange,
}: {
  value: CaptureFormat;
  supportsRaw: boolean;
  onChange: (format: CaptureFormat) => void;
}) {
  const cycle = useCallback(() => {
    const available = CAPTURE_FORMAT_ORDER.filter(
      (f) => !CAPTURE_FORMATS[f].requiresRawSupport || supportsRaw,
    );
    const idx = available.indexOf(value);
    const next = available[(idx + 1) % available.length];
    onChange(next);
  }, [value, supportsRaw, onChange]);

  return (
    <Pressable
      onPress={cycle}
      style={({ pressed }) => [styles.formatPicker, pressed && styles.pressed]}>
      <Text style={styles.formatPickerText}>{CAPTURE_FORMATS[value].displayName}</Text>
    </Pressable>
  );
}

function flashLabel(mode: 'off' | 'on' | 'auto'): string {
  switch (mode) {
    case 'on':
      return 'Flash On';
    case 'auto':
      return 'Flash Auto';
    default:
      return 'Flash Off';
  }
}

/** Map our capture format to a VisionCamera output container format. */
function toContainerFormat(format: CaptureFormat): TargetPhotoContainerFormat {
  switch (format) {
    case 'jpeg':
      return 'jpeg';
    case 'dng':
      return 'dng';
    case 'heic':
    default:
      return 'heic';
  }
}

// Referenced so the threshold map is part of the build surface even while
// frame processors are stubbed (keeps the value tree-shake-safe for M2.3).
void PEAKING_THRESHOLDS;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.black,
  },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.darkBg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  gateTitle: {
    color: Palette.white,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  gateBody: {
    color: Palette.ash,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: FontSize.md * 1.4,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xxl,
    gap: Spacing.sm,
  },
  topButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  topButtonActive: {
    backgroundColor: Palette.amber,
  },
  topButtonDisabled: {
    opacity: 0.4,
  },
  topButtonText: {
    color: Palette.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  topButtonTextActive: {
    color: Palette.black,
  },
  formatPicker: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  formatPickerText: {
    color: Palette.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.5,
  },
  bottomArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  shutterRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: Palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInnerCapturing: {
    backgroundColor: Palette.amber,
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  shutterPressed: {
    opacity: 0.8,
  },
  peakingNotice: {
    position: 'absolute',
    top: Spacing.xxl + 44,
    alignSelf: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  peakingNoticeText: {
    color: Palette.ash,
    fontSize: FontSize.xs,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pressed: {
    opacity: 0.7,
  },
});
