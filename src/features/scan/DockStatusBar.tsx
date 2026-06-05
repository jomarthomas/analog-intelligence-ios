/**
 * src/features/scan/DockStatusBar.tsx
 *
 * A compact status bar shown at the top of the Scan screen when a dock is
 * connected. Displays:
 *   - Connection indicator (amber pill, simulation badge)
 *   - Battery level (when known)
 *   - Frame progress indicator: "12 / 36 frames"
 *   - Retry count when in retryingCapture state
 *
 * Purely presentational — reads from useDockStore props passed by the parent.
 */

import { StyleSheet, Text, View } from 'react-native';
import type { DockStatus } from '../../../modules/dock-ble/src/DockBle.types';
import { Palette, Spacing, FontSize, FontWeight, Radius } from '@/theme';

export type DockStatusBarProps = {
  status: DockStatus;
};

export function DockStatusBar({ status }: DockStatusBarProps) {
  const { state, framesScanned, totalFrames, batteryLevel, retryCount, isSimulation } = status;

  const stateLabel = STATE_LABELS[state] ?? state;

  return (
    <View style={styles.bar}>
      {/* Left: status dot + label */}
      <View style={styles.leftGroup}>
        <View style={[styles.dot, { backgroundColor: dotColor(state) }]} />
        <Text style={styles.stateText} numberOfLines={1}>
          {stateLabel}
        </Text>
        {isSimulation ? (
          <View style={styles.simBadge}>
            <Text style={styles.simBadgeText}>SIM</Text>
          </View>
        ) : null}
      </View>

      {/* Center: frame progress */}
      {totalFrames !== null ? (
        <View style={styles.centerGroup}>
          <Text style={styles.frameText}>
            {framesScanned} / {totalFrames}
          </Text>
          {retryCount > 0 ? (
            <Text style={styles.retryText}> (retry {retryCount})</Text>
          ) : null}
        </View>
      ) : null}

      {/* Right: battery */}
      {batteryLevel !== null ? (
        <Text style={styles.batteryText}>{batteryLevel}%</Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATE_LABELS: Record<string, string> = {
  idle: 'Idle',
  connectingToDock: 'Connecting…',
  waitingForDockAlignment: 'Waiting for alignment',
  capturing: 'Capturing',
  verifyingQuality: 'Checking quality',
  retryingCapture: 'Retrying…',
  completed: 'Roll complete',
  error: 'Error',
};

function dotColor(state: string): string {
  switch (state) {
    case 'waitingForDockAlignment':
    case 'capturing':
    case 'verifyingQuality':
      return Palette.amber;
    case 'completed':
      return Palette.success;
    case 'error':
      return Palette.danger;
    default:
      return Palette.ash;
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.70)',
    borderRadius: Radius.sm,
    gap: Spacing.sm,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stateText: {
    color: Palette.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  simBadge: {
    backgroundColor: Palette.amberMuted,
    borderRadius: Radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  simBadgeText: {
    color: Palette.amber,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
  centerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  frameText: {
    color: Palette.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  retryText: {
    color: Palette.ash,
    fontSize: FontSize.sm,
  },
  batteryText: {
    color: Palette.ash,
    fontSize: FontSize.sm,
  },
});
