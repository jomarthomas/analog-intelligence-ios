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
 * Task #13 additions:
 *   - LIVE HISTOGRAM: analyzeHistogram() is called on previewUri (debounced
 *     ~400 ms, race-guarded). The Insights <Histogram> component renders
 *     compactly below the preview. Loading / empty states are handled.
 *   - AUTO CROP: if the Scan screen detected a frame boundary and the user
 *     approved it, cropRect is passed as a JSON query param and applied to
 *     the initial pipeline params.
 *
 * Algorithm parity: legacy-ios/docs/PRODUCT_UI_SPEC.md + DESIGN_UPDATES.md
 *   (three orange sliders + Pro AI toggles + Done → Gallery).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/theme/button';
import { Card } from '@/theme/card';
import { ProBadge } from '@/theme/pro-badge';
import { SectionHeader } from '@/theme/section-header';
import { Screen } from '@/theme/screen';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';

import {
  DEFAULT_FULL_PROCESS_PARAMS,
  PARAM_RANGES,
  fromSnapshot,
  usePipeline,
  applyFilmProfile,
  clampParam,
  NEUTRAL_PROFILE_ID,
} from '@/processing';
import type { FullProcessParams, FilmProfile } from '@/processing';
import { ProGate } from '@/monetization';
import { useGalleryStore } from '@/state/galleryStore';

import {
  AdjustPreview,
  AdjustSlider,
  AIToggleRow,
  BeforeAfterCompare,
  FilmProfilePicker,
} from '@/features/adjust';
import { Histogram, suggestFromLuma } from '@/insights';
import { analyzeHistogram, estimateFilmBaseNeutral } from '../../../modules/ai-image-processing';
import type { Histogram as HistogramData } from '../../../modules/ai-image-processing';
import type { AggregateHistogram, SuggestionPatch } from '@/insights';

// ---------------------------------------------------------------------------
// Histogram adapter
// ---------------------------------------------------------------------------

/**
 * Convert the native Histogram (with shadowClipPct / highlightClipPct) into
 * the AggregateHistogram shape expected by the <Histogram> UI component.
 * The extra clipping fields are dropped — they are only used by ClippingCard.
 */
function toAggregateHistogram(h: HistogramData): AggregateHistogram {
  return { r: h.r, g: h.g, b: h.b, luma: h.luma };
}

// ---------------------------------------------------------------------------
// useLiveHistogram — debounced, race-guarded
// ---------------------------------------------------------------------------

const HISTOGRAM_DEBOUNCE_MS = 400;

/**
 * Analyzes the histogram of the given URI with a 400 ms debounce.
 * Returns null while loading and the AggregateHistogram when ready.
 * Guards against races: if the URI changes before the promise resolves,
 * the stale result is discarded.
 */
function useLiveHistogram(uri: string | undefined): {
  histogram: AggregateHistogram | null;
  isLoading: boolean;
} {
  const [histogram, setHistogram] = useState<AggregateHistogram | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the URI that produced the current in-flight request.
  const inflightUriRef = useRef<string | null>(null);

  useEffect(() => {
    if (!uri) {
      // Reset to the empty state when there's no preview yet. This is an
      // input-driven reset for the debounced fetch below, not a render loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHistogram(null);
      setIsLoading(false);
      return;
    }

    // Clear any pending debounce timer.
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    setIsLoading(true);

    timerRef.current = setTimeout(() => {
      inflightUriRef.current = uri;
      analyzeHistogram(uri)
        .then((result) => {
          // Discard stale results if the URI changed while we were waiting.
          if (inflightUriRef.current !== uri) return;
          setHistogram(toAggregateHistogram(result));
          setIsLoading(false);
        })
        .catch(() => {
          if (inflightUriRef.current !== uri) return;
          setHistogram(null);
          setIsLoading(false);
        });
    }, HISTOGRAM_DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [uri]);

  return { histogram, isLoading };
}

// ---------------------------------------------------------------------------
// Crop-rect param parsing
// ---------------------------------------------------------------------------

/**
 * Parse the JSON-encoded cropRect passed as a route query param from the
 * Scan screen after the user approves a detected frame boundary.
 * Returns null if the param is absent or malformed.
 */
function parseCropRectParam(
  raw: string | string[] | undefined,
): FullProcessParams['cropRect'] | null {
  if (!raw || Array.isArray(raw)) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'x' in parsed &&
      'y' in parsed &&
      'width' in parsed &&
      'height' in parsed
    ) {
      const r = parsed as { x: unknown; y: unknown; width: unknown; height: unknown };
      if (
        typeof r.x === 'number' &&
        typeof r.y === 'number' &&
        typeof r.width === 'number' &&
        typeof r.height === 'number'
      ) {
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }
    }
  } catch {
    // malformed JSON — ignore
  }
  return null;
}

// ---------------------------------------------------------------------------
// Route entry point
// ---------------------------------------------------------------------------

export default function AdjustScreen() {
  const { id, cropRect: cropRectParam } = useLocalSearchParams<{
    id: string;
    cropRect?: string;
  }>();
  const router = useRouter();

  const image = useGalleryStore((s) => s.allImages.find((i) => i.id === id));
  const loadGallery = useGalleryStore((s) => s.loadGallery);

  if (image === undefined) {
    return <ImageMissing onBack={() => router.replace('/(tabs)/gallery')} />;
  }

  // If the Scan screen passed an approved cropRect, merge it into the initial params.
  const detectedCropRect = parseCropRectParam(cropRectParam);
  const baseParams = fromSnapshot(image.processParams) ?? DEFAULT_FULL_PROCESS_PARAMS;
  const initialParams: FullProcessParams = detectedCropRect
    ? { ...baseParams, cropRect: detectedCropRect }
    : baseParams;

  return (
    <AdjustScreenBody
      imageId={image.id}
      originalUri={image.originalUri}
      initialParams={initialParams}
      onCommitted={async () => {
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
  const [profileId, setProfileId] = useState<string>(NEUTRAL_PROFILE_ID);
  const [compareMode, setCompareMode] = useState(false);

  // Selecting a film/lab look resets the 7 user-adjustment sliders to that
  // profile's values (applied over neutral), which the live preview re-renders.
  const handleSelectProfile = useCallback(
    (profile: FilmProfile) => {
      setProfileId(profile.id);
      const neutral: FullProcessParams = {
        ...pipeline.params,
        exposure: 0,
        warmth: 0,
        contrast: 0,
        saturation: 0,
        highlights: 0,
        shadows: 0,
        vibrance: 0,
      };
      const looked = applyFilmProfile(neutral, profile.id);
      pipeline.mergeParams({
        exposure: looked.exposure,
        warmth: looked.warmth,
        contrast: looked.contrast,
        saturation: looked.saturation,
        highlights: looked.highlights,
        shadows: looked.shadows,
        vibrance: looked.vibrance,
      });
    },
    [pipeline],
  );

  // Live histogram on the current preview URI (debounced, race-guarded).
  const { histogram, isLoading: isHistogramLoading } = useLiveHistogram(pipeline.previewUri);

  // Actionable suggestion derived from the live histogram (one-tap apply).
  const [dismissedSuggestionId, setDismissedSuggestionId] = useState<string | null>(null);
  const suggestion = useMemo(() => {
    const s = suggestFromLuma(histogram?.luma);
    return s != null && s.id !== dismissedSuggestionId ? s : null;
  }, [histogram, dismissedSuggestionId]);

  const handleApplySuggestion = useCallback(() => {
    if (suggestion == null) return;
    const cur = pipeline.params;
    const p = suggestion.patch;
    const add = (key: keyof SuggestionPatch, base: number | undefined) =>
      clampParam(key, (base ?? 0) + (p[key] ?? 0));
    pipeline.mergeParams({
      exposure: add('exposure', cur.exposure),
      warmth: add('warmth', cur.warmth),
      contrast: add('contrast', cur.contrast),
      saturation: add('saturation', cur.saturation),
      highlights: add('highlights', cur.highlights),
      shadows: add('shadows', cur.shadows),
      vibrance: add('vibrance', cur.vibrance)
    });
    setDismissedSuggestionId(suggestion.id);
  }, [suggestion, pipeline]);

  // One-tap white balance: sample the unexposed film base (rebate) and set the
  // warmth slider to neutralise its cast — a mobile take on IT8/grey-card
  // calibration that no competitor does. (Tint axis isn't a slider yet.)
  const [autoWbBusy, setAutoWbBusy] = useState(false);
  const handleAutoWhiteBalance = useCallback(async () => {
    setAutoWbBusy(true);
    try {
      const wb = await estimateFilmBaseNeutral(originalUri);
      if (wb.found) {
        pipeline.mergeParams({ warmth: clampParam('warmth', wb.warmth) });
      } else {
        Alert.alert(
          'No film base found',
          'Couldn’t find an unexposed film base in this frame to set white balance from.',
        );
      }
    } catch {
      // Non-fatal — leave the current white balance unchanged.
    } finally {
      setAutoWbBusy(false);
    }
  }, [originalUri, pipeline]);

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
        {/* Before/after toggle */}
        <View style={styles.previewHeaderRow}>
          <Button variant="ghost" size="sm" onPress={() => setCompareMode((m) => !m)}>
            {compareMode ? 'Edit' : 'Before / After'}
          </Button>
        </View>

        {/* Live preview (positive) + watermark — or the drag-to-reveal compare */}
        {compareMode ? (
          <View style={styles.compareWrap}>
            <BeforeAfterCompare
              beforeUri={originalUri}
              afterUri={pipeline.previewUri ?? originalUri}
            />
          </View>
        ) : (
          <AdjustPreview
            previewUri={pipeline.previewUri}
            originalUri={originalUri}
            isProcessing={pipeline.isProcessing}
          />
        )}

        {/* Live histogram — shown below the preview when data is available.
            Uses the Insights <Histogram> component (compact height 80). */}
        <View style={styles.histogramContainer}>
          {histogram !== null ? (
            <Histogram
              histogram={histogram}
              height={80}
              style={styles.histogramChart}
            />
          ) : isHistogramLoading ? (
            <View style={[styles.histogramPlaceholder, { backgroundColor: theme.backgroundCard }]}>
              <Text style={[styles.histogramPlaceholderText, { color: theme.textSecondary }]}>
                Analysing…
              </Text>
            </View>
          ) : (
            // No preview yet — show a subtle placeholder so the layout
            // doesn't shift when the histogram arrives.
            <View style={[styles.histogramPlaceholder, { backgroundColor: theme.backgroundCard }]}>
              <Text style={[styles.histogramPlaceholderText, { color: theme.textSecondary }]}>
                Histogram
              </Text>
            </View>
          )}
        </View>

        {/* Actionable suggestion from the live histogram — one-tap apply */}
        {suggestion != null ? (
          <View style={[styles.suggestionChip, { backgroundColor: theme.backgroundCard, borderColor: theme.border }]}>
            <Text style={[styles.suggestionText, { color: theme.text }]} numberOfLines={2}>
              {suggestion.title}
            </Text>
            <View style={styles.suggestionActions}>
              <Pressable
                onPress={() => setDismissedSuggestionId(suggestion.id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Dismiss suggestion">
                <Text style={[styles.suggestionDismiss, { color: theme.textSecondary }]}>✕</Text>
              </Pressable>
              <Pressable
                onPress={handleApplySuggestion}
                accessibilityRole="button"
                accessibilityLabel={`Apply: ${suggestion.title}`}
                style={({ pressed }) => [
                  styles.suggestionApply,
                  { backgroundColor: theme.accent },
                  pressed && { opacity: 0.8 }
                ]}>
                <Text style={[styles.suggestionApplyText, { color: theme.accentText }]}>Apply</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Film / lab look */}
        <SectionHeader title="Look" />
        <View style={styles.profilePicker}>
          <FilmProfilePicker selectedId={profileId} onSelect={handleSelectProfile} />
        </View>
        <View style={styles.autoWbRow}>
          <Button
            variant="secondary"
            size="sm"
            loading={autoWbBusy}
            onPress={() => void handleAutoWhiteBalance()}>
            Auto WB from film base
          </Button>
        </View>

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
  profilePicker: {
    // Full-bleed horizontal scroll: cancel the content's horizontal padding so
    // the chip row reaches the screen edges and scrolls naturally.
    marginHorizontal: -Spacing.md,
    marginBottom: Spacing.sm,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: Spacing.xs,
  },
  autoWbRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  compareWrap: {
    height: 320,
    borderRadius: 12,
    overflow: 'hidden',
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.sm,
  },
  suggestionText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  suggestionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  suggestionDismiss: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  suggestionApply: {
    paddingVertical: 5,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
  },
  suggestionApplyText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.2,
  },
  histogramContainer: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  histogramChart: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  histogramPlaceholder: {
    height: 80,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  histogramPlaceholderText: {
    fontSize: FontSize.sm,
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
