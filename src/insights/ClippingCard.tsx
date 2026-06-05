/**
 * src/insights/ClippingCard.tsx
 *
 * Shadow / highlight clipping metric card.
 *
 * Ported from legacy-ios/UI/Insights/InsightsView.swift (ClippingCard).
 *
 * Shows:
 *   - A small icon (moon.fill for shadows, sun.max.fill for highlights)
 *   - A label ("Shadow Clipping" / "Highlight Clipping")
 *   - The percentage value in large bold type, coloured by severity
 *   - A subtle bar indicator (0 → full width at 100 %)
 *
 * Props:
 *   title      — Card label text.
 *   percentage — Fraction 0–1 (NOT 0–100); the component multiplies by 100.
 *   variant    — 'shadow' | 'highlight' drives icon + colour palette.
 */

import React from 'react';
import { DimensionValue, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Palette, Radius, Spacing } from '@/constants/theme';
import { Card } from '@/theme/card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClippingVariant = 'shadow' | 'highlight';

type ClippingCardProps = {
  title?: string;
  /** Clipping fraction 0–1. */
  percentage: number;
  variant: ClippingVariant;
};

// ---------------------------------------------------------------------------
// Severity thresholds (mirrors InsightGenerator in metrics.ts)
// ---------------------------------------------------------------------------

type Severity = 'good' | 'moderate' | 'severe';

function severity(pct: number): Severity {
  if (pct < 0.05) return 'good';
  if (pct < 0.15) return 'moderate';
  return 'severe';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Unicode stand-ins for SF Symbols (unavailable in cross-platform RN).
 * SymbolView / expo-symbols can be used on iOS; text fallbacks here keep the
 * component cross-platform without a conditional import.
 */
// Monochrome geometric glyphs (filled = shadows/dark, hollow = highlights/light)
// — they inherit the text colour, staying coherent with the black-&-white theme.
const ICON: Record<ClippingVariant, string> = {
  shadow: '●',
  highlight: '○',
};

const VARIANT_LABEL: Record<ClippingVariant, string> = {
  shadow: '% Shadow Clipping',
  highlight: '% Highlight Clipping',
};

const SEVERITY_COLOR: Record<Severity, string> = {
  good: Palette.success,
  moderate: Palette.warning,
  severe: Palette.danger,
};

export function ClippingCard({ title, percentage, variant }: ClippingCardProps) {
  const theme = useTheme();

  const displayPct = Math.min(100, Math.max(0, percentage * 100));
  const sev = severity(percentage);
  const valueColor = SEVERITY_COLOR[sev];
  const label = title ?? VARIANT_LABEL[variant];
  const barFillRatio = Math.min(1, percentage);

  return (
    <Card style={styles.card}>
      {/* Header row: icon + label */}
      <View style={styles.header}>
        <Text style={styles.icon} accessibilityLabel={variant}>
          {ICON[variant]}
        </Text>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      </View>

      {/* Large percentage value */}
      <Text style={[styles.value, { color: valueColor }]}>
        {displayPct.toFixed(1)}
        <Text style={[styles.pctSymbol, { color: valueColor }]}>%</Text>
      </Text>

      {/* Bar indicator */}
      <View style={[styles.barTrack, { backgroundColor: theme.border }]}>
        <View
          style={[
            styles.barFill,
            {
              width: `${(barFillRatio * 100).toFixed(1)}%` as DimensionValue,
              backgroundColor: valueColor,
            },
          ]}
        />
      </View>

      {/* Severity label */}
      <Text style={[styles.severityLabel, { color: valueColor }]}>
        {sev === 'good' ? 'Good' : sev === 'moderate' ? 'Moderate' : 'Severe'}
      </Text>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  icon: {
    fontSize: 16,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    flexShrink: 1,
  },
  value: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.bold,
    lineHeight: FontSize.display * 1.1,
  },
  pctSymbol: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  barTrack: {
    height: 4,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  severityLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
