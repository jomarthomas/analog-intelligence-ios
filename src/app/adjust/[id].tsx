/**
 * Adjust screen — tone & colour correction after capture.
 *
 * Route: adjust/[id]  (id = scan record UUID from storage)
 * Presented as a modal or stack push from the Scan tab after capture.
 *
 * Intended layout (from legacy-ios/docs/PRODUCT_UI_SPEC.md + DESIGN_UPDATES.md):
 *   - Dark card background
 *   - Three sliders: Exposure, Warmth, Contrast (orange track)
 *   - Pro toggles: AI Color Reconstruction, AI Dust Removal
 *   - "Done" navigation button → saves and pushes to Gallery
 *   - Free tier: "AI Watermark" overlay visible on preview
 *
 * TODO(integration): Camera / Pipeline agent — accept the captured frame
 *   URI via route params or zustand store. Render a <SkiaPreview> of the
 *   negative→positive conversion from src/processing/.
 *
 * TODO(integration): Pipeline agent — wire up Exposure/Warmth/Contrast
 *   slider onChange to the processing pipeline (src/processing/pipeline.ts).
 *   Wire AI toggles to Pro gate + pipeline AI steps.
 *
 * TODO(integration): Storage agent — on Done, call
 *   ScanRepository.save(adjustedResult) from src/storage/ then navigate
 *   to gallery.
 *
 * TODO(integration): Monetization agent — render <WatermarkOverlay> on
 *   the preview for free-tier users; gate AI toggles behind <ProGate>.
 */

import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/theme/button';
import { Card } from '@/theme/card';
import { ProBadge } from '@/theme/pro-badge';
import { SectionHeader } from '@/theme/section-header';
import { Screen } from '@/theme/screen';
import { FontSize, FontWeight, Palette, Spacing } from '@/constants/theme';

export default function AdjustScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  function handleDone() {
    // TODO(integration): Storage agent — persist adjusted scan then navigate
    router.replace('/(tabs)/gallery');
  }

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      {/* Navigation header */}
      <View style={[styles.navBar, { borderBottomColor: theme.border }]}>
        <Text style={[styles.navTitle, { color: theme.text }]}>ADJUST</Text>
        <Button variant="primary" size="sm" onPress={handleDone}>
          Done
        </Button>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Preview placeholder */}
        {/* TODO(integration): Pipeline agent — replace with <SkiaPreview id={id} /> */}
        <View style={[styles.previewPlaceholder, { backgroundColor: theme.backgroundCard }]}>
          <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>
            Preview — scan {id ?? 'unknown'}
          </Text>
          <Text style={[styles.previewNote, { color: theme.textSecondary }]}>
            {/* TODO(integration): mount <SkiaPreview> + <WatermarkOverlay> here */}
            Camera/Pipeline agent mounts preview here
          </Text>
        </View>

        {/* Adjustments card */}
        <SectionHeader title="Adjustments" />
        <Card padding="md" elevated>
          {/* Exposure slider stub */}
          {/* TODO(integration): Pipeline agent — replace stubs with real sliders wired to pipeline */}
          <SliderRow label="Exposure" />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SliderRow label="Warmth" />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <SliderRow label="Contrast" />
        </Card>

        {/* AI options */}
        <SectionHeader title="AI Processing" right={<ProBadge size="sm" />} />
        <Card padding="md" elevated>
          {/* TODO(integration): Pipeline + Monetization agent — replace with real toggles behind ProGate */}
          <AIOptionRow label="AI Color Reconstruction" />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <AIOptionRow label="AI Dust Removal" />
        </Card>

        <View style={styles.footer}>
          <Text style={[styles.footerNote, { color: theme.textSecondary }]}>
            Wired up next — Pipeline agent mounts sliders &amp; AI toggles here
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Internal placeholder row components (no feature imports)
// ---------------------------------------------------------------------------

function SliderRow({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.sliderRow}>
      <Text style={[styles.sliderLabel, { color: theme.text }]}>{label}</Text>
      {/* Stub track — Pipeline agent replaces with Slider component */}
      <View style={[styles.sliderTrack, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.sliderFill, { backgroundColor: Palette.amber, width: '50%' }]} />
        <View style={[styles.sliderThumb, { backgroundColor: Palette.white, borderColor: Palette.amber }]} />
      </View>
    </View>
  );
}

function AIOptionRow({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.aiRow}>
      <Text style={[styles.sliderLabel, { color: theme.text }]}>{label}</Text>
      <View style={styles.aiRowRight}>
        <ProBadge size="sm" />
        {/* Stub toggle — Monetization + Pipeline agent replaces */}
        <View style={[styles.toggleStub, { backgroundColor: theme.backgroundSelected }]} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.5,
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  previewPlaceholder: {
    marginTop: Spacing.md,
    height: 280,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  previewLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  previewNote: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.sm,
  },
  sliderRow: {
    gap: Spacing.sm,
  },
  sliderLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    position: 'relative',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  sliderFill: {
    height: 4,
    borderRadius: 2,
    position: 'absolute',
    left: 0,
  },
  sliderThumb: {
    position: 'absolute',
    left: '50%',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginLeft: -10,
    marginTop: -8,
    top: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  aiRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  toggleStub: {
    width: 44,
    height: 24,
    borderRadius: 12,
  },
  footer: {
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  footerNote: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
