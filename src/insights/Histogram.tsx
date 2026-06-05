/**
 * src/insights/Histogram.tsx
 *
 * RGB + luma histogram chart using react-native-svg.
 *
 * Renders four overlapping area paths (R, G, B, luma) at a downsampled
 * resolution for performance. The channels are drawn semi-transparent so
 * all four are visible. Luma is rendered last (on top) as a white/ash line.
 *
 * Ported from legacy-ios/UI/Insights/InsightsView.swift (HistogramChart).
 *
 * Props
 *   histogram    — AggregateHistogram with 256-bin R/G/B/luma arrays.
 *   height       — chart height in logical pixels (default 160).
 *   style        — optional ViewStyle for the outer container.
 */

import React, { useMemo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import type { AggregateHistogram } from './metrics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HistogramProps = {
  histogram: AggregateHistogram;
  height?: number;
  style?: ViewStyle;
};

// ---------------------------------------------------------------------------
// Channel colour definitions
// ---------------------------------------------------------------------------

type ChannelDef = {
  key: 'r' | 'g' | 'b' | 'luma';
  stroke: string;
  fillStart: string;
  fillEnd: string;
  gradientId: string;
};

const CHANNEL_DEFS: ChannelDef[] = [
  {
    key: 'r',
    stroke: 'rgba(255, 80, 80, 0.9)',
    fillStart: 'rgba(255, 80, 80, 0.35)',
    fillEnd: 'rgba(255, 80, 80, 0)',
    gradientId: 'gradR',
  },
  {
    key: 'g',
    stroke: 'rgba(80, 200, 120, 0.9)',
    fillStart: 'rgba(80, 200, 120, 0.30)',
    fillEnd: 'rgba(80, 200, 120, 0)',
    gradientId: 'gradG',
  },
  {
    key: 'b',
    stroke: 'rgba(80, 140, 255, 0.9)',
    fillStart: 'rgba(80, 140, 255, 0.30)',
    fillEnd: 'rgba(80, 140, 255, 0)',
    gradientId: 'gradB',
  },
  {
    key: 'luma',
    // luma overlaid as white/ash, drawn last so it's most visible
    stroke: 'rgba(220, 220, 220, 0.95)',
    fillStart: 'rgba(220, 220, 220, 0.15)',
    fillEnd: 'rgba(220, 220, 220, 0)',
    gradientId: 'gradLuma',
  },
];

// ---------------------------------------------------------------------------
// Path builder
// ---------------------------------------------------------------------------

/**
 * Downsample a 256-bin array to `targetBins` by averaging contiguous groups.
 * This reduces SVG path complexity while preserving the overall shape.
 */
function downsample(data: number[], targetBins: number): number[] {
  const inputLen = data.length;
  if (inputLen <= targetBins) return data;
  const step = inputLen / targetBins;
  const result: number[] = [];
  for (let i = 0; i < targetBins; i++) {
    const start = Math.floor(i * step);
    const end = Math.min(Math.floor((i + 1) * step), inputLen);
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += data[j] ?? 0;
    }
    result.push(sum / (end - start));
  }
  return result;
}

/**
 * Build an SVG path for a filled area chart from normalised histogram bins.
 *
 * @param bins     Downsampled normalised bin values (each 0–max).
 * @param maxVal   Global maximum value used for Y-axis normalisation.
 * @param width    SVG width in px.
 * @param height   SVG height in px.
 * @returns SVG path `d` attribute string.
 */
function buildAreaPath(
  bins: number[],
  maxVal: number,
  width: number,
  height: number,
): string {
  if (bins.length === 0 || maxVal <= 0) return '';

  const xStep = width / (bins.length - 1);
  const safeMax = maxVal > 0 ? maxVal : 1;

  // Move to bottom-left
  let d = `M 0 ${height}`;

  // Line to start of histogram
  const firstY = height - (bins[0]! / safeMax) * height;
  d += ` L 0 ${firstY.toFixed(2)}`;

  // Cubic bezier through each bin for a smooth curve.
  // Using a simple approach: straight line segments (performance-safe for 64 bins).
  for (let i = 1; i < bins.length; i++) {
    const x = (i * xStep).toFixed(2);
    const y = (height - ((bins[i]! / safeMax) * height)).toFixed(2);
    d += ` L ${x} ${y}`;
  }

  // Close to bottom-right then bottom-left
  d += ` L ${width.toFixed(2)} ${height} Z`;
  return d;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TARGET_BINS = 64; // downsample 256 → 64 for rendering
const DEFAULT_HEIGHT = 160;

export function Histogram({ histogram, height = DEFAULT_HEIGHT, style }: HistogramProps) {
  const theme = useTheme();

  // Compute a shared global maximum so all four channels share the same Y scale.
  const globalMax = useMemo(() => {
    const allBins = [
      ...histogram.r,
      ...histogram.g,
      ...histogram.b,
      ...histogram.luma,
    ];
    return Math.max(...allBins, 0.001); // guard against all-zeros
  }, [histogram]);

  // Downsample each channel once.
  const downsampled = useMemo(
    () => ({
      r: downsample(histogram.r, TARGET_BINS),
      g: downsample(histogram.g, TARGET_BINS),
      b: downsample(histogram.b, TARGET_BINS),
      luma: downsample(histogram.luma, TARGET_BINS),
    }),
    [histogram],
  );

  return (
    <View
      style={[styles.container, { backgroundColor: theme.backgroundCard }, style]}
      accessible
      accessibilityLabel="RGB and luminance histogram">
      <Svg width="100%" height={height} viewBox={`0 0 256 ${height}`} preserveAspectRatio="none">
        <Defs>
          {CHANNEL_DEFS.map((ch) => (
            <LinearGradient
              key={ch.gradientId}
              id={ch.gradientId}
              x1="0"
              y1="0"
              x2="0"
              y2="1">
              <Stop offset="0%" stopColor={ch.fillStart} />
              <Stop offset="100%" stopColor={ch.fillEnd} />
            </LinearGradient>
          ))}
        </Defs>

        {CHANNEL_DEFS.map((ch) => {
          const d = buildAreaPath(downsampled[ch.key], globalMax, 256, height);
          if (!d) return null;
          return (
            <Path
              key={ch.key}
              d={d}
              fill={`url(#${ch.gradientId})`}
              stroke={ch.stroke}
              strokeWidth={ch.key === 'luma' ? 1.5 : 1}
            />
          );
        })}
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
  },
});
