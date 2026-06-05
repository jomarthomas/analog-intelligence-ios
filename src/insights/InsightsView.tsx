/**
 * src/insights/InsightsView.tsx
 *
 * Insights screen body — mountable by the orchestrator into the Insights tab.
 *
 * Mounting API:
 *   import { InsightsView } from '@/insights/InsightsView';
 *   // Inside the Insights tab route (src/app/(tabs)/insights.tsx):
 *   <InsightsView />
 *
 * The component is Pro-gating agnostic: the orchestrator wraps it in a
 * <ProGate> before mounting; InsightsView renders the real content.
 *
 * Data flow:
 *   1. useGalleryStore.allImages (ScannedImage[]) is read from the zustand store.
 *   2. computeRollMetrics() derives roll-level metrics + template insights
 *      from each image's exposureMetrics (populated by the Pipeline workstream
 *      after calling analyzeHistogram() on the native module).
 *   3. If exposureMetrics.histogramJson is present on any image, the
 *      aggregate histogram is rendered via <Histogram>.
 *   4. Shadow + highlight clipping are rendered via two <ClippingCard> components.
 *   5. Template-based insights are rendered in a scrollable list.
 *
 * When there are no scanned images, a clean empty-state is shown.
 *
 * Ported from:
 *   legacy-ios/UI/Insights/InsightsView.swift
 */

import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useGalleryStore } from '@/state/galleryStore';
import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Palette, Radius, Spacing } from '@/constants/theme';
import { Card } from '@/theme/card';

import { computeRollMetrics } from './metrics';
import type { RollInsight } from './metrics';
import { Histogram } from './Histogram';
import { ClippingCard } from './ClippingCard';

type Theme = ReturnType<typeof useTheme>;

// ---------------------------------------------------------------------------
// InsightRow — renders one template insight card
// ---------------------------------------------------------------------------

const INSIGHT_ICON: Record<RollInsight['type'], string> = {
  positive: '✓',
  warning: '⚠',
  info: 'ℹ',
};

const INSIGHT_COLOR: Record<RollInsight['type'], string> = {
  positive: Palette.success,
  warning: Palette.warning,
  info: '#60a5fa', // info blue
};

function InsightRow({ insight }: { insight: RollInsight }) {
  const theme = useTheme();
  const color = INSIGHT_COLOR[insight.type];

  return (
    <View style={[styles.insightRow, { backgroundColor: theme.backgroundCard, borderColor: theme.border }]}>
      {/* Coloured left border accent */}
      <View style={[styles.insightAccent, { backgroundColor: color }]} />

      <View style={styles.insightBody}>
        {/* Icon + title */}
        <View style={styles.insightHeader}>
          <Text style={[styles.insightIcon, { color }]}>{INSIGHT_ICON[insight.type]}</Text>
          <Text style={[styles.insightTitle, { color: theme.text }]}>{insight.title}</Text>
        </View>

        {/* Description */}
        <Text style={[styles.insightDesc, { color: theme.textSecondary }]}>
          {insight.description}
        </Text>

        {/* Optional metric value */}
        {insight.metric != null && (
          <Text style={[styles.insightMetric, { color }]}>
            {(insight.metric * 100).toFixed(1)}%
          </Text>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SectionTitle — consistent section heading
// ---------------------------------------------------------------------------

function SectionTitle({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{label}</Text>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  const theme = useTheme();
  return (
    <View style={styles.emptyContainer}>
      {/* Large chart icon (text fallback) */}
      <Text style={[styles.emptyIcon, { color: theme.textSecondary }]}>{'▓▓\n▓▓▓\n▓▓▓▓'}</Text>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>No Analysis Available</Text>
      <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
        Scan some film to see exposure insights for your roll.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// InsightsView
// ---------------------------------------------------------------------------

export function InsightsView() {
  const theme = useTheme();
  const { allImages, isLoading } = useGalleryStore((s) => ({
    allImages: s.allImages,
    isLoading: s.isLoading,
  }));

  // Compute roll metrics from all images. Memoised so it doesn't rerun on
  // unrelated store updates (selection, sort order changes, etc.).
  const rollMetrics = useMemo(() => computeRollMetrics(allImages), [allImages]);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <View style={[styles.centred, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state — no images scanned yet
  // ---------------------------------------------------------------------------
  if (rollMetrics.frameCount === 0) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.background }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.screenTitle, { color: theme.text }]}>INSIGHTS</Text>
          <View style={[styles.proBadge, { backgroundColor: Palette.proBadgeBg }]}>
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
        </View>
        <EmptyState />
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Main content
  // ---------------------------------------------------------------------------
  const { aggregateHistogram, averageShadowClipping, averageHighlightClipping, insights } =
    rollMetrics;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      {/* Screen header */}
      <View style={styles.headerRow}>
        <Text style={[styles.screenTitle, { color: theme.text }]}>INSIGHTS</Text>
        <View style={[styles.proBadge, { backgroundColor: Palette.proBadgeBg }]}>
          <Text style={styles.proBadgeText}>PRO</Text>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Spacing.xxl }]}
        showsVerticalScrollIndicator={false}>

        {/* ------------------------------------------------------------------ */}
        {/* Exposure analysis + histogram                                       */}
        {/* ------------------------------------------------------------------ */}
        <Card style={styles.sectionCard}>
          <SectionTitle label="Exposure analysis" />

          {aggregateHistogram ? (
            <Histogram histogram={aggregateHistogram} height={180} style={styles.histogramChart} />
          ) : (
            // No histogram data available: show a placeholder
            <View style={[styles.histogramPlaceholder, { backgroundColor: theme.border }]}>
              <Text style={[styles.histogramPlaceholderText, { color: theme.textSecondary }]}>
                Histogram available after processing
              </Text>
            </View>
          )}

          {/* Roll stats summary row */}
          <View style={styles.statsRow}>
            <StatPill label="Frames" value={String(rollMetrics.frameCount)} theme={theme} />
            <StatPill
              label="Well-Exposed"
              value={`${(rollMetrics.wellExposedPct * 100).toFixed(0)}%`}
              theme={theme}
            />
            <StatPill
              label="Quality"
              value={capitalize(rollMetrics.quality)}
              theme={theme}
              accent={
                rollMetrics.quality === 'excellent' || rollMetrics.quality === 'good'
                  ? Palette.success
                  : rollMetrics.quality === 'fair'
                  ? Palette.warning
                  : Palette.danger
              }
            />
          </View>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* Clipping cards                                                       */}
        {/* ------------------------------------------------------------------ */}
        <View style={styles.clippingRow}>
          <ClippingCard
            percentage={averageShadowClipping}
            variant="shadow"
          />
          <ClippingCard
            percentage={averageHighlightClipping}
            variant="highlight"
          />
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* Template-based insights                                             */}
        {/* ------------------------------------------------------------------ */}
        {insights.length > 0 && (
          <View>
            <SectionTitle label="Template-based" />
            <View style={styles.insightList}>
              {insights.map((insight) => (
                <InsightRow key={insight.id} insight={insight} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// StatPill — compact key/value stat inside the histogram card
// ---------------------------------------------------------------------------

type StatPillProps = {
  label: string;
  value: string;
  theme: Theme;
  accent?: string;
};

function StatPill({ label, value, theme, accent }: StatPillProps) {
  return (
    <View style={styles.statPill}>
      <Text style={[styles.statValue, { color: accent ?? theme.accent }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- Header ---
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  screenTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.5,
  },
  proBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  proBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Palette.proBadgeText,
    letterSpacing: 0.5,
  },

  // --- ScrollView content ---
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },

  // --- Section card (histogram + stats) ---
  sectionCard: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // --- Histogram ---
  histogramChart: {
    // height is passed as a prop (180), width fills the card
  },
  histogramPlaceholder: {
    height: 180,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  histogramPlaceholderText: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },

  // --- Stats row ---
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: Spacing.sm,
  },
  statPill: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  statLabel: {
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // --- Clipping cards ---
  clippingRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },

  // --- Insight list ---
  insightList: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  insightRow: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  insightAccent: {
    width: 4,
  },
  insightBody: {
    flex: 1,
    padding: Spacing.md,
    gap: 4,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  insightIcon: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  insightTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    flex: 1,
  },
  insightDesc: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.5,
  },
  insightMetric: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    marginTop: 2,
  },

  // --- Empty state ---
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emptyIcon: {
    fontSize: 40,
    lineHeight: 48,
    textAlign: 'center',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: FontSize.md * 1.6,
    maxWidth: 280,
  },
});
