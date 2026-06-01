/**
 * src/features/scan/ManualControlsPanel.tsx
 *
 * Expandable panel of manual camera controls + a calibration lock, for
 * consistent batch scanning of film negatives.
 *
 * Ported from:
 *   - legacy-ios/ManualControlsPanel.swift  (Focus / ISO / Shutter / WB sliders)
 *   - legacy-ios/CalibrationManager.swift    (lock / unlock focus+exposure+WB)
 *
 * Mapping to react-native-vision-camera v5 `CameraController`:
 *   • Focus      → setFocusLocked(lensPosition 0..1) / resetFocus()
 *   • ISO        → setExposureLocked(duration, iso)
 *   • Shutter    → setExposureLocked(duration, iso)   (log scale on duration)
 *   • WB preset  → setWhiteBalanceLocked(gains) / resetFocus() for 'auto'
 *   • Lock All   → lockCurrentFocus + lockCurrentExposure + lockCurrentWhiteBalance
 *   • Unlock     → resetFocus()  (resets all locked 3A back to continuous-auto)
 *
 * All controls gate on the live device capability flags so we never call an
 * unsupported API (legacy guarded with `isFocusModeSupported(.locked)` etc).
 * Lock indicators tint orange when a subsystem is locked.
 *
 * NOTE on platform: per-channel manual focus/exposure/WB locking is iOS-first
 * in VisionCamera (`@platform iOS` on setFocusLocked/setExposureLocked/
 * setWhiteBalanceLocked). On Android these may be unsupported; the capability
 * flags collapse the unavailable controls automatically.
 */

import { RefObject, useCallback, useMemo, useState, type ReactNode } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import type { CameraRef } from 'react-native-vision-camera';

import { Palette, Spacing, FontSize, FontWeight, Radius } from '@/theme';
import { useCaptureStore, type PeakingColor, type PeakingSensitivity } from '@/state/captureStore';
import {
  whiteBalanceGainsForTemperature,
  clampWhiteBalanceGains,
  readSnapshot,
} from '@/camera/cameraController';
import {
  WHITE_BALANCE_PRESETS,
  WHITE_BALANCE_PRESET_ORDER,
  gainsForTemperature,
  type WhiteBalancePreset,
} from '@/camera/types';

export interface ManualControlsPanelProps {
  /** Ref to the mounted `<Camera>` — used to reach the live `controller`. */
  cameraRef: RefObject<CameraRef | null>;
}

export function ManualControlsPanel({ cameraRef }: ManualControlsPanelProps) {
  const capabilities = useCaptureStore((s) => s.capabilities);
  const locks = useCaptureStore((s) => s.locks);
  const isCalibrated = useCaptureStore((s) => s.isCalibrated);
  const snapshot = useCaptureStore((s) => s.snapshot);
  const wbPreset = useCaptureStore((s) => s.whiteBalancePreset);

  const focusPeakingEnabled = useCaptureStore((s) => s.focusPeakingEnabled);
  const peakingSensitivity = useCaptureStore((s) => s.peakingSensitivity);
  const peakingColor = useCaptureStore((s) => s.peakingColor);

  const setSnapshot = useCaptureStore((s) => s.setSnapshot);
  const setLocks = useCaptureStore((s) => s.setLocks);
  const setAllLocks = useCaptureStore((s) => s.setAllLocks);
  const setWhiteBalancePreset = useCaptureStore((s) => s.setWhiteBalancePreset);
  const toggleFocusPeaking = useCaptureStore((s) => s.toggleFocusPeaking);
  const setPeakingSensitivity = useCaptureStore((s) => s.setPeakingSensitivity);
  const setPeakingColor = useCaptureStore((s) => s.setPeakingColor);

  // Local expand/collapse (not global UI state).
  const expanded = useExpanded();

  const controller = () => cameraRef.current?.controller;

  // Re-read live 3A values into the store (legacy `updateCurrentValues`).
  const refreshSnapshot = useCallback(() => {
    setSnapshot(readSnapshot(controller()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSnapshot]);

  // --- Focus ---------------------------------------------------------------
  const onFocusChange = useCallback(
    async (lensPosition: number) => {
      const c = controller();
      if (c == null || !capabilities.supportsFocusLocking) return;
      const clamped = Math.max(0, Math.min(1, lensPosition));
      try {
        await c.setFocusLocked(clamped);
        setSnapshot({ lensPosition: clamped });
        setLocks({ focus: true });
      } catch {
        /* unsupported / transient */
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [capabilities.supportsFocusLocking, setSnapshot, setLocks],
  );

  // --- Exposure (ISO + shutter share setExposureLocked) --------------------
  const applyExposure = useCallback(
    async (iso: number, duration: number) => {
      const c = controller();
      if (c == null || !capabilities.supportsExposureLocking) return;
      const clampedIso = clamp(iso, capabilities.minISO, capabilities.maxISO);
      const clampedDuration = clamp(
        duration,
        capabilities.minExposureDuration,
        capabilities.maxExposureDuration,
      );
      try {
        await c.setExposureLocked(clampedDuration, clampedIso);
        setSnapshot({ iso: clampedIso, exposureDuration: clampedDuration });
        setLocks({ exposure: true });
      } catch {
        /* unsupported / transient */
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [
      capabilities.supportsExposureLocking,
      capabilities.minISO,
      capabilities.maxISO,
      capabilities.minExposureDuration,
      capabilities.maxExposureDuration,
      setSnapshot,
      setLocks,
    ],
  );

  const onIsoChange = useCallback(
    (iso: number) => {
      const duration = snapshot.exposureDuration > 0 ? snapshot.exposureDuration : 1 / 60;
      void applyExposure(iso, duration);
    },
    [applyExposure, snapshot.exposureDuration],
  );

  const onShutterLogChange = useCallback(
    (logValue: number) => {
      const seconds = Math.pow(2, logValue);
      const iso = snapshot.iso > 0 ? snapshot.iso : capabilities.minISO || 100;
      void applyExposure(iso, seconds);
    },
    [applyExposure, snapshot.iso, capabilities.minISO],
  );

  // --- White balance -------------------------------------------------------
  const onWbPreset = useCallback(
    async (preset: WhiteBalancePreset) => {
      setWhiteBalancePreset(preset);
      const c = controller();
      if (c == null) return;
      const info = WHITE_BALANCE_PRESETS[preset];
      if (info.temperature == null) {
        // 'auto' → release WB lock (resetFocus resets all locked 3A; we then
        // re-lock focus/exposure if they were locked to preserve calibration).
        if (capabilities.supportsWhiteBalanceLocking) {
          try {
            await c.resetFocus();
            setLocks({ whiteBalance: false });
            if (locks.focus) await c.lockCurrentFocus();
            if (locks.exposure) await c.lockCurrentExposure();
          } catch {
            /* ignore */
          }
        }
        return;
      }
      if (!capabilities.supportsWhiteBalanceLocking) return;
      try {
        const gains = whiteBalanceGainsForTemperature(
          c,
          info.temperature,
          capabilities.maxWhiteBalanceGain,
        );
        await c.setWhiteBalanceLocked(gains);
        setSnapshot({ whiteBalanceGains: gains });
        setLocks({ whiteBalance: true });
      } catch {
        // Fallback to the pure approximation if the native conversion path failed.
        try {
          const gains = clampWhiteBalanceGains(
            gainsForTemperature(info.temperature),
            capabilities.maxWhiteBalanceGain,
          );
          await c.setWhiteBalanceLocked(gains);
          setSnapshot({ whiteBalanceGains: gains });
          setLocks({ whiteBalance: true });
        } catch {
          /* give up silently */
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [
      capabilities.supportsWhiteBalanceLocking,
      capabilities.maxWhiteBalanceGain,
      locks.focus,
      locks.exposure,
      setWhiteBalancePreset,
      setSnapshot,
      setLocks,
    ],
  );

  // --- Calibration lock / unlock (legacy lockCalibration/unlockCalibration) -
  const onLockAll = useCallback(async () => {
    const c = controller();
    if (c == null) return;
    try {
      if (capabilities.supportsFocusLocking) await c.lockCurrentFocus();
      if (capabilities.supportsExposureLocking) await c.lockCurrentExposure();
      if (capabilities.supportsWhiteBalanceLocking) await c.lockCurrentWhiteBalance();
      setLocks({
        focus: capabilities.supportsFocusLocking,
        exposure: capabilities.supportsExposureLocking,
        whiteBalance: capabilities.supportsWhiteBalanceLocking,
      });
      refreshSnapshot();
    } catch {
      /* ignore */
    }
  }, [
    capabilities.supportsFocusLocking,
    capabilities.supportsExposureLocking,
    capabilities.supportsWhiteBalanceLocking,
    setLocks,
    refreshSnapshot,
  ]);

  const onUnlockAll = useCallback(async () => {
    const c = controller();
    if (c == null) return;
    try {
      await c.resetFocus(); // resets all locked AF/AE/AWB → continuous-auto
      setAllLocks(false);
      setWhiteBalancePreset('auto');
      refreshSnapshot();
    } catch {
      /* ignore */
    }
  }, [setAllLocks, setWhiteBalancePreset, refreshSnapshot]);

  const anyManualSupported =
    capabilities.supportsFocusLocking ||
    capabilities.supportsExposureLocking ||
    capabilities.supportsWhiteBalanceLocking;

  return (
    <View style={styles.container}>
      {/* Header / expand toggle */}
      <Pressable style={styles.header} onPress={expanded.toggle}>
        <Text style={styles.headerTitle}>Manual Controls</Text>
        <View style={styles.headerRight}>
          {isCalibrated ? (
            <View style={styles.calibratedPill}>
              <Text style={styles.calibratedText}>Calibrated</Text>
            </View>
          ) : null}
          <Text style={styles.chevron}>{expanded.value ? '⌄' : '⌃'}</Text>
        </View>
      </Pressable>

      {expanded.value ? (
        <View style={styles.body}>
          {!anyManualSupported ? (
            <Text style={styles.unsupportedNote}>
              Manual controls aren&apos;t supported on this camera.
            </Text>
          ) : null}

          {/* Focus */}
          {capabilities.supportsFocusLocking ? (
            <ControlBlock
              label="Focus"
              locked={locks.focus}
              valueText={focusDistanceLabel(snapshot.lensPosition)}>
              <SliderRow
                minLabel="∞"
                maxLabel="Macro"
                min={0}
                max={1}
                value={snapshot.lensPosition}
                onChange={onFocusChange}
              />
            </ControlBlock>
          ) : null}

          {/* ISO */}
          {capabilities.supportsExposureLocking ? (
            <ControlBlock
              label="ISO"
              locked={locks.exposure}
              valueText={`ISO ${Math.round(snapshot.iso)}`}>
              <SliderRow
                minLabel={String(Math.round(capabilities.minISO) || 25)}
                maxLabel={String(Math.round(capabilities.maxISO) || 3200)}
                min={capabilities.minISO || 25}
                max={capabilities.maxISO || 3200}
                value={snapshot.iso || capabilities.minISO || 25}
                onChange={onIsoChange}
              />
            </ControlBlock>
          ) : null}

          {/* Shutter speed (log scale) */}
          {capabilities.supportsExposureLocking ? (
            <ControlBlock
              label="Shutter Speed"
              locked={locks.exposure}
              valueText={formatShutter(snapshot.exposureDuration)}>
              <SliderRow
                minLabel="Fast"
                maxLabel="Slow"
                min={shutterLogRange(capabilities.minExposureDuration).min}
                max={shutterLogRange(capabilities.maxExposureDuration).max}
                value={durationToLog(snapshot.exposureDuration)}
                onChange={onShutterLogChange}
              />
            </ControlBlock>
          ) : null}

          {/* White balance presets */}
          {capabilities.supportsWhiteBalanceLocking ? (
            <ControlBlock
              label="White Balance"
              locked={locks.whiteBalance}
              valueText={WHITE_BALANCE_PRESETS[wbPreset].description}>
              <WhiteBalanceSegments value={wbPreset} onChange={(p) => void onWbPreset(p)} />
            </ControlBlock>
          ) : null}

          {/* Calibration lock / unlock */}
          {anyManualSupported ? (
            <View style={styles.lockRow}>
              {isCalibrated ? (
                <Pressable
                  style={[styles.lockButton, styles.unlockButton]}
                  onPress={() => void onUnlockAll()}>
                  <Text style={styles.lockButtonText}>Unlock</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.lockButton, styles.lockAllButton]}
                  onPress={() => void onLockAll()}>
                  <Text style={[styles.lockButtonText, styles.lockAllText]}>
                    Lock Calibration
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}

          {/* Focus Peaking toggle + sub-controls */}
          <FocusPeakingControls
            enabled={focusPeakingEnabled}
            sensitivity={peakingSensitivity}
            color={peakingColor}
            onToggle={toggleFocusPeaking}
            onSensitivityChange={setPeakingSensitivity}
            onColorChange={setPeakingColor}
          />
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ControlBlock({
  label,
  locked,
  valueText,
  children,
}: {
  label: string;
  locked: boolean;
  valueText: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.block}>
      <View style={styles.blockHeader}>
        <Text style={styles.blockLabel}>{label}</Text>
        {locked ? <Text style={styles.lockIcon}>🔒</Text> : null}
      </View>
      {children}
      <Text style={styles.blockValue}>{valueText}</Text>
    </View>
  );
}

function SliderRow({
  minLabel,
  maxLabel,
  min,
  max,
  value,
  onChange,
}: {
  minLabel: string;
  maxLabel: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  // Guard against an inverted/zero range before the device reports real bounds.
  const safeMax = max > min ? max : min + 1;
  const safeValue = Math.max(min, Math.min(safeMax, value));
  return (
    <View style={styles.sliderRow}>
      <Text style={styles.sliderEndLabel}>{minLabel}</Text>
      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={safeMax}
        value={safeValue}
        onSlidingComplete={onChange}
        minimumTrackTintColor={Palette.amber}
        maximumTrackTintColor="rgba(255,255,255,0.3)"
        thumbTintColor={Palette.amber}
      />
      <Text style={styles.sliderEndLabel}>{maxLabel}</Text>
    </View>
  );
}

function WhiteBalanceSegments({
  value,
  onChange,
}: {
  value: WhiteBalancePreset;
  onChange: (preset: WhiteBalancePreset) => void;
}) {
  return (
    <View style={styles.segments}>
      {WHITE_BALANCE_PRESET_ORDER.map((preset) => {
        const active = preset === value;
        return (
          <Pressable
            key={preset}
            onPress={() => onChange(preset)}
            style={[styles.segment, active && styles.segmentActive]}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {WHITE_BALANCE_PRESETS[preset].label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Focus Peaking controls
// ---------------------------------------------------------------------------

/** Sensitivity labels shown in the segmented control. */
const SENSITIVITY_OPTIONS: { value: PeakingSensitivity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
];

/** Colour options for the peaking overlay. */
const COLOR_OPTIONS: { value: PeakingColor; label: string }[] = [
  { value: 'red', label: 'Red' },
  { value: 'green', label: 'Grn' },
  { value: 'blue', label: 'Blu' },
  { value: 'yellow', label: 'Ylw' },
  { value: 'white', label: 'Wht' },
];

function FocusPeakingControls({
  enabled,
  sensitivity,
  color,
  onToggle,
  onSensitivityChange,
  onColorChange,
}: {
  enabled: boolean;
  sensitivity: PeakingSensitivity;
  color: PeakingColor;
  onToggle: () => void;
  onSensitivityChange: (s: PeakingSensitivity) => void;
  onColorChange: (c: PeakingColor) => void;
}) {
  return (
    <View style={styles.peakingSection}>
      {/* Toggle row */}
      <Pressable style={styles.peakingHeader} onPress={onToggle} accessibilityRole="switch">
        <Text style={styles.blockLabel}>Focus Peaking</Text>
        <View style={[styles.peakingBadge, enabled && styles.peakingBadgeActive]}>
          <Text style={[styles.peakingBadgeText, enabled && styles.peakingBadgeTextActive]}>
            {enabled ? 'ON' : 'OFF'}
          </Text>
        </View>
      </Pressable>

      {/* Sub-controls only visible when enabled */}
      {enabled ? (
        <View style={styles.peakingBody}>
          {/* Sensitivity */}
          <View style={styles.peakingRow}>
            <Text style={styles.peakingSubLabel}>Sensitivity</Text>
            <View style={styles.segments}>
              {SENSITIVITY_OPTIONS.map(({ value, label }) => {
                const active = value === sensitivity;
                return (
                  <Pressable
                    key={value}
                    onPress={() => onSensitivityChange(value)}
                    style={[styles.segment, active && styles.segmentActive]}>
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Colour */}
          <View style={styles.peakingRow}>
            <Text style={styles.peakingSubLabel}>Colour</Text>
            <View style={styles.segments}>
              {COLOR_OPTIONS.map(({ value, label }) => {
                const active = value === color;
                return (
                  <Pressable
                    key={value}
                    onPress={() => onColorChange(value)}
                    style={[styles.segment, active && styles.segmentActive]}>
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Expand/collapse (with LayoutAnimation, matching the legacy spring)
// ---------------------------------------------------------------------------

/**
 * Local panel-expanded state. Kept out of the global store because it is pure
 * presentation. Animates the open/close with LayoutAnimation (≈ the legacy
 * SwiftUI `.spring(response: 0.3)` transition).
 */
function useExpanded() {
  const [value, setValue] = useState(false);
  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setValue((v) => !v);
  }, []);
  return useMemo(() => ({ value, toggle }), [value, toggle]);
}

// ---------------------------------------------------------------------------
// Formatting helpers (ported from ManualControlsPanel.swift)
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  if (max <= min) return v;
  return Math.max(min, Math.min(max, v));
}

/** Approximate focus distance label (legacy `focusDistanceDescription`). */
function focusDistanceLabel(position: number): string {
  if (position < 0.1) return 'Focus: Infinity (∞)';
  if (position < 0.3) return 'Focus: ~5-10m';
  if (position < 0.5) return 'Focus: ~2-5m';
  if (position < 0.7) return 'Focus: ~1-2m';
  if (position < 0.9) return 'Focus: ~0.5-1m';
  return 'Focus: Macro (~10-50cm)';
}

/** Format an exposure duration in seconds as 1/x s or x.x s (legacy logic). */
function formatShutter(seconds: number): string {
  if (seconds <= 0) return '—';
  if (seconds >= 0.5) return `${seconds.toFixed(1)}s`;
  const denominator = Math.round(1 / seconds);
  return `1/${denominator}s`;
}

/** log2(seconds), with a safe default when duration is unknown. */
function durationToLog(seconds: number): number {
  if (seconds <= 0) return -7; // ~1/128s default (legacy default 1/125)
  return Math.log2(seconds);
}

/**
 * Derive the slider's log range from the device's exposure-duration limits.
 * Falls back to the legacy fixed range (-15 … 0) when limits are unknown.
 */
function shutterLogRange(durationSecondsLimit: number): { min: number; max: number } {
  // We expose a single helper used for both ends; callers pick .min or .max.
  // min end = fastest shutter (smallest duration) → most negative log.
  // max end = slowest shutter (largest duration)  → up to 0 (1s) by default.
  if (durationSecondsLimit <= 0) return { min: -15, max: 0 };
  const log = Math.log2(durationSecondsLimit);
  // For the fast (min duration) limit this is very negative; for the slow
  // (max duration) limit, clamp the upper bound to 0 (1s) to match legacy UX.
  return { min: log < 0 ? log : -15, max: log > 0 ? Math.min(log, 0) : 0 };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.70)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  headerTitle: {
    color: Palette.white,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  chevron: {
    color: Palette.white,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  calibratedPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Palette.success,
  },
  calibratedText: {
    color: Palette.white,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  body: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  unsupportedNote: {
    color: Palette.ash,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
  block: {
    gap: Spacing.xs,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  blockLabel: {
    color: Palette.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  lockIcon: {
    fontSize: FontSize.sm,
  },
  blockValue: {
    color: Palette.amber,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  slider: {
    flex: 1,
    height: 36,
  },
  sliderEndLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: FontSize.xs,
    minWidth: 34,
    textAlign: 'center',
  },
  segments: {
    flexDirection: 'row',
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.xs + 2,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: Palette.amber,
  },
  segmentText: {
    color: Palette.white,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  segmentTextActive: {
    color: Palette.black,
    fontWeight: FontWeight.semibold,
  },
  lockRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  lockButton: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  lockAllButton: {
    backgroundColor: Palette.success,
  },
  unlockButton: {
    backgroundColor: Palette.amber,
  },
  lockButtonText: {
    color: Palette.white,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  lockAllText: {
    color: Palette.white,
  },

  // ---- Focus Peaking -------------------------------------------------------
  peakingSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  peakingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  peakingBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  peakingBadgeActive: {
    backgroundColor: Palette.amber,
  },
  peakingBadgeText: {
    color: Palette.ash,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  peakingBadgeTextActive: {
    color: Palette.black,
  },
  peakingBody: {
    gap: Spacing.sm,
  },
  peakingRow: {
    gap: Spacing.xs,
  },
  peakingSubLabel: {
    color: Palette.ash,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
});
