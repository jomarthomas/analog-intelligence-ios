/**
 * src/features/adjust/AdjustSlider.tsx
 *
 * A labelled slider row for the Adjust screen, bound to a single
 * FullProcessParams numeric key via usePipeline().setParam(...).
 *
 * Uses @react-native-community/slider with the amber darkroom track colour.
 * Ranges come from the pipeline's PARAM_RANGES contract so the UI stays in
 * sync with the native engine's accepted bounds.
 */

import { StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Palette, Spacing } from '@/constants/theme';

export type AdjustSliderProps = {
  /** Row label, e.g. "Exposure". */
  label: string;
  /** Current value (controlled by usePipeline). */
  value: number;
  /** Inclusive minimum. */
  min: number;
  /** Inclusive maximum. */
  max: number;
  /** Step granularity (0 = continuous). */
  step?: number;
  /**
   * Called continuously as the user drags. Wire to pipeline.setParam(key, v)
   * — the pipeline debounces the resulting preview re-process internally.
   */
  onChange: (value: number) => void;
  /**
   * Formats the displayed value. Defaults to a signed one-decimal number,
   * which reads naturally for the -2…+2 / -1…+1 adjustment sliders.
   */
  formatValue?: (value: number) => string;
};

function defaultFormat(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  // Show a leading + for positive non-zero values to echo the legacy UI.
  if (rounded > 0) return `+${rounded.toFixed(1)}`;
  return rounded.toFixed(1);
}

export function AdjustSlider({
  label,
  value,
  min,
  max,
  step = 0,
  onChange,
  formatValue = defaultFormat,
}: AdjustSliderProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.value, { color: theme.textSecondary }]}>
          {formatValue(value)}
        </Text>
      </View>
      <Slider
        style={styles.slider}
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={onChange}
        minimumTrackTintColor={Palette.amber}
        maximumTrackTintColor={theme.backgroundSelected}
        thumbTintColor={Palette.amber}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  value: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    fontVariant: ['tabular-nums'],
  },
  slider: {
    width: '100%',
    height: 36,
  },
});
