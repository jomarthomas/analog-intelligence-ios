/**
 * Insights tab — Pro-only roll exposure analysis.
 *
 * Layout (from legacy-ios/docs/PRODUCT_UI_SPEC.md):
 *   - Title: "INSIGHTS (PRO)"
 *   - Exposure analysis section with orange histogram chart
 *   - Shadow / highlight clipping cards + template insight cards
 *
 * Wiring:
 *   <InsightsView /> (from @/insights) renders the real content and is
 *   Pro-gate agnostic. We wrap it in <ProGate> (from @/monetization) so free
 *   users get an upgrade prompt. We pass an explicit, flex-filling fallback
 *   (rather than the default dimmed overlay) because InsightsView is flex:1
 *   and ProGate's default container is not — a custom fallback gives free
 *   users a clean, full-screen prompt.
 */

import { StyleSheet, Text, View } from 'react-native';

import { InsightsView } from '@/insights';
import { ProGate, ProUpgradeBanner } from '@/monetization';
import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Palette, Radius, Spacing } from '@/constants/theme';
import { Screen } from '@/theme/screen';

export default function InsightsScreen() {
  return (
    <Screen edges={['top', 'left', 'right']}>
      <ProGate featureName="Insights" fallback={<InsightsLocked />}>
        <InsightsView />
      </ProGate>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Free-tier upgrade prompt with a teaser of the exposure histogram.
// ---------------------------------------------------------------------------

function InsightsLocked() {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>INSIGHTS</Text>
        <View style={[styles.proBadge, { backgroundColor: theme.accent }]}>
          <Text style={[styles.proBadgeText, { color: theme.accentText }]}>PRO</Text>
        </View>
      </View>

      {/* Faux histogram teaser bars (monochrome, like the real chart). */}
      <View style={[styles.teaser, { backgroundColor: theme.backgroundCard, borderColor: theme.border }]}>
        <View style={styles.bars}>
          {TEASER_BARS.map((h, i) => (
            <View
              key={i}
              style={[styles.bar, { height: `${h}%`, backgroundColor: theme.accent }]}
            />
          ))}
        </View>
        <Text style={[styles.teaserCaption, { color: theme.textSecondary }]}>
          Exposure analysis · shadow & highlight clipping · roll insights
        </Text>
      </View>

      <Text style={[styles.body, { color: theme.textSecondary }]}>
        Unlock Insights with Analog Intelligence Pro to see per-roll exposure
        histograms, clipping metrics, and automatic shooting feedback.
      </Text>

      <ProUpgradeBanner compact label="Upgrade to Pro" />
    </View>
  );
}

const TEASER_BARS = [20, 35, 55, 70, 85, 95, 80, 60, 45, 30, 22, 15];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  title: {
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
  teaser: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
    opacity: 0.45,
    gap: Spacing.xs,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
  },
  teaserCaption: {
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  body: {
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: FontSize.md * 1.5,
  },
});
