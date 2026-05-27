/**
 * Adjust screen — tone & colour correction after capture.
 *
 * Route: adjust/[id]  (id = ScannedImage UUID from storage)
 * Presented as a modal stack push from the Scan tab after capture.
 *
 * Wiring (capstone integration):
 *   - The captured ScannedImage is read from useGalleryStore by id.
 *   - usePipeline({ imageId, originalUri, initialParams }) drives a debounced
 *     live preview (previewUri / isProcessing) and the final commit().
 *   - <AdjustPreview> renders the positive preview inside <WatermarkOverlay>.
 *   - <AdjustSlider> rows bind exposure / warmth / contrast to setParam().
 *   - AI toggles (aiColor / aiDustRemoval) live inside a <ProGate>.
 *   - "Done": await pipeline.commit() → reload gallery → replace to gallery.
 *     pipeline.fallbackNotice (Android DNG) and pipeline.error are surfaced.
 *
 * Algorithm parity: legacy-ios/docs/PRODUCT_UI_SPEC.md + DESIGN_UPDATES.md
 *   (three orange sliders + Pro AI toggles + Done → Gallery).
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/theme/button';
import { Card } from '@/theme/card';
import { ProBadge } from '@/theme/pro-badge';
import { SectionHeader } from '@/theme/section-header';
import { Screen } from '@/theme/screen';
import { FontSize, FontWeight, Spacing } from '@/constants/theme';

import {
  DEFAULT_FULL_PROCESS_PARAMS,
  PARAM_RANGES,
  fromSnapshot,
  usePipeline,
} from '@/processing';
import { ProGate } from '@/monetization';
import { useGalleryStore } from '@/state/galleryStore';

import { AdjustPreview, AdjustSlider, AIToggleRow } from '@/features/adjust';

export default function AdjustScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // The image was persisted by the Scan screen before navigation, so it is
  // already present in the gallery store. Selecting by id keeps us in sync if
  // the store reloads (e.g. after a background refresh).
  const image = useGalleryStore((s) => s.allImages.find((i) => i.id === id));
  const loadGallery = useGalleryStore((s) => s.loadGallery);

  // Image not found (stale deep link / deleted while navigating): bail out
  // gracefully back to the gallery rather than rendering a broken pipeline.
  if (image === undefined) {
    return <ImageMissing onBack={() => router.replace('/(tabs)/gallery')} />;
  }

  return (
    <AdjustScreenBody
      imageId={image.id}
      originalUri={image.originalUri}
      initialParams={fromSnapshot(image.processParams) ?? DEFAULT_FULL_PROCESS_PARAMS}
      onCommitted={async () => {
        // Refresh the store so the gallery shows the freshly processed frame.
        await loadGallery();
        router.replace('/(tabs)/gallery');
      }}
      onCancel={() => router.back()}
    />
  );
}

// ---------------------------------------------------------------------------
// Body — only mounted once a valid image exists (keeps the hook unconditional)
// ---------------------------------------------------------------------------

type AdjustScreenBodyProps = {
  imageId: string;
  originalUri: string;
  initialParams: Parameters<typeof usePipeline>[0]['initialParams'];
  onCommitted: () => Promise<void>;
  onCancel: () => void;
};

function AdjustScreenBody({
  imageId,
  originalUri,
  initialParams,
  onCommitted,
  onCancel,
}: AdjustScreenBodyProps) {
  const theme = useTheme();

  const pipeline = usePipeline({ imageId, originalUri, initialParams });
  const [isCommitting, setIsCommitting] = useState(false);

  // Surface hard pipeline errors as an alert (preview + commit failures).
  useEffect(() => {
    if (pipeline.error !== null) {
      Alert.alert('Processing error', pipeline.error.message, [
        { text: 'OK', onPress: pipeline.clearError },
      ]);
    }
  }, [pipeline.error, pipeline.clearError]);

  // Surface the Android DNG fallback as a one-time informational alert.
  useEffect(() => {
    if (pipeline.fallbackNotice !== null) {
      Alert.alert('Note', pipeline.fallbackNotice, [
        { text: 'OK', onPress: pipeline.clearFallbackNotice },
      ]);
    }
  }, [pipeline.fallbackNotice, pipeline.clearFallbackNotice]);

  const handleDone = useCallback(async () => {
    setIsCommitting(true);
    try {
      await pipeline.commit();
      await onCommitted();
    } catch {
      // commit() already set pipeline.error; the effect above shows the alert.
      // Stay on the screen so the user can retry.
    } finally {
      setIsCommitting(false);
    }
  }, [pipeline, onCommitted]);

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      {/* Navigation header */}
      <View style={[styles.navBar, { borderBottomColor: theme.border }]}>
        <Button variant="ghost" size="sm" onPress={onCancel}>
          Cancel
        </Button>
        <Text style={[styles.navTitle, { color: theme.text }]}>ADJUST</Text>
        <Button
          variant="primary"
          size="sm"
          onPress={() => void handleDone()}
          loading={isCommitting}>
          Done
        </Button>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* Live preview (positive) + watermark for free tier */}
        <AdjustPreview
          previewUri={pipeline.previewUri}
          originalUri={originalUri}
          isProcessing={pipeline.isProcessing}
        />

        {/* Adjustments */}
        <SectionHeader title="Adjustments" />
        <Card padding="md" elevated style={styles.card}>
          <AdjustSlider
            label="Exposure"
            value={pipeline.params.exposure}
            min={PARAM_RANGES.exposure.min}
            max={PARAM_RANGES.exposure.max}
            step={PARAM_RANGES.exposure.step}
            onChange={(v) => pipeline.setParam('exposure', v)}
          />
          <AdjustSlider
            label="Warmth"
            value={pipeline.params.warmth}
            min={PARAM_RANGES.warmth.min}
            max={PARAM_RANGES.warmth.max}
            step={PARAM_RANGES.warmth.step}
            onChange={(v) => pipeline.setParam('warmth', v)}
          />
          <AdjustSlider
            label="Contrast"
            value={pipeline.params.contrast}
            min={PARAM_RANGES.contrast.min}
            max={PARAM_RANGES.contrast.max}
            step={PARAM_RANGES.contrast.step}
            onChange={(v) => pipeline.setParam('contrast', v)}
          />
        </Card>

        {/* AI processing — gated behind Pro */}
        <SectionHeader title="AI Processing" right={<ProBadge size="sm" />} />
        <ProGate featureName="AI Processing">
          <Card padding="md" elevated style={styles.card}>
            <AIToggleRow
              label="AI Color Reconstruction"
              description="Advanced colour correction for accurate film reproduction."
              value={pipeline.params.aiColor ?? false}
              onValueChange={(v) => pipeline.setParam('aiColor', v)}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <AIToggleRow
              label="AI Dust Removal"
              description="Automatically clean up dust and scratches."
              value={pipeline.params.aiDustRemoval ?? false}
              onValueChange={(v) => pipeline.setParam('aiDustRemoval', v)}
            />
          </Card>
        </ProGate>

        {/* Reset adjustments */}
        <View style={styles.resetRow}>
          <Button variant="secondary" size="sm" onPress={pipeline.resetParams}>
            Reset adjustments
          </Button>
        </View>
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Missing-image fallback
// ---------------------------------------------------------------------------

function ImageMissing({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.missing}>
        <Text style={[styles.missingTitle, { color: theme.text }]}>
          Scan not found
        </Text>
        <Text style={[styles.missingBody, { color: theme.textSecondary }]}>
          This frame is no longer available.
        </Text>
        <Button onPress={onBack}>Back to Gallery</Button>
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  card: {
    gap: Spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.sm,
  },
  resetRow: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  missingTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semibold,
  },
  missingBody: {
    fontSize: FontSize.md,
    textAlign: 'center',
  },
});
