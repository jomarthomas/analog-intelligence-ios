/**
 * src/insights/metrics.ts
 *
 * Roll-level metrics and template-insight generation.
 *
 * Ported from:
 *   legacy-ios/Processing/Metrics/ExposureMetrics.swift (RollExposureMetrics)
 *   legacy-ios/Processing/Metrics/RollInsight.swift     (InsightGenerator)
 *   legacy-ios/Processing/Metrics/HistogramAnalyzer.swift (averageLuminance, analyzeClipping)
 *
 * All functions are pure and testable — no side-effects, no RN imports.
 * The Insights screen consumes these, feeding data from:
 *   - src/state/galleryStore  (allImages: ScannedImage[])
 *   - exposureMetrics.histogramJson (parsed into Histogram when available)
 *   - native analyzeHistogram() result when metrics are missing
 */

import type { Histogram } from '../../modules/ai-image-processing/src/AiImageProcessing.types';
import type { ExposureMetrics, ScannedImage } from '@/storage/models';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type InsightType = 'positive' | 'warning' | 'info';

export interface RollInsight {
  /** Unique key for React list rendering (stable, deterministic). */
  id: string;
  type: InsightType;
  title: string;
  description: string;
  /** The raw metric value this insight was derived from (for display). */
  metric?: number;
}

/**
 * Per-frame exposure quality category.
 * Mirrors legacy `FrameExposureMetrics.ExposureQuality`.
 */
export type ExposureQuality = 'excellent' | 'acceptable' | 'underexposed' | 'overexposed';

/**
 * Processed summary for one frame. Derived from ExposureMetrics stored on
 * ScannedImage, or directly from a Histogram returned by analyzeHistogram().
 */
export interface FrameMetrics {
  imageId: string;
  /** Mean luminance normalised to 0–1. */
  averageLuminance: number;
  /** Shadow-clipped pixels as a fraction 0–1. */
  shadowClipping: number;
  /** Highlight-clipped pixels as a fraction 0–1. */
  highlightClipping: number;
  quality: ExposureQuality;
}

/**
 * Roll-level aggregate of all frame metrics.
 * Mirrors legacy `RollExposureMetrics`.
 */
export interface RollMetrics {
  frameCount: number;
  /** 0–1 mean of all frame averageLuminance values. */
  averageLuminance: number;
  /** 0–1 mean of all frame shadowClipping fractions. */
  averageShadowClipping: number;
  /** 0–1 mean of all frame highlightClipping fractions. */
  averageHighlightClipping: number;
  wellExposedCount: number;
  /** 0–1 fraction of well-exposed frames. */
  wellExposedPct: number;
  /** 0–1 consistency score (1 = perfectly uniform exposure). */
  consistencyScore: number;
  /** Qualitative roll quality label. */
  quality: RollQuality;
  insights: RollInsight[];
  /** Per-frame breakdown, indexed by imageId. */
  frames: FrameMetrics[];
  /**
   * Aggregate histogram bins ready for charting.
   * Each channel is 256 bins; values are the arithmetic mean across all frames
   * that contributed histogram data.  null when no frames have histogram data.
   */
  aggregateHistogram: AggregateHistogram | null;
}

export type RollQuality = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * Aggregate histogram derived by averaging normalised bins across all frames.
 * Mirrors the Histogram contract from the native module but carries an extra
 * `hasData` flag for defensive rendering.
 */
export interface AggregateHistogram {
  r: number[];
  g: number[];
  b: number[];
  luma: number[];
}

// ---------------------------------------------------------------------------
// Histogram helpers (ported from HistogramAnalyzer.swift)
// ---------------------------------------------------------------------------

/**
 * Compute the weighted average luminance from a 256-bin normalised luma array.
 * Each bin centre is (index + 0.5) / 256.
 * Mirrors `HistogramAnalyzer.averageLuminance`.
 */
export function averageLuminanceFromBins(luma: number[]): number {
  const bins = luma.length;
  if (bins === 0) return 0;
  let weightedSum = 0;
  for (let i = 0; i < bins; i++) {
    const binCenter = (i + 0.5) / bins;
    weightedSum += binCenter * luma[i];
  }
  return weightedSum;
}

/**
 * Convert a Histogram (from native analyzeHistogram) into FrameMetrics.
 * shadowClipPct / highlightClipPct from the native module are already
 * expressed as 0–100; we normalise to 0–1 here.
 */
export function histogramToFrameMetrics(imageId: string, h: Histogram): FrameMetrics {
  const avgLum = averageLuminanceFromBins(h.luma);
  const shadowClipping = h.shadowClipPct / 100;
  const highlightClipping = h.highlightClipPct / 100;
  return {
    imageId,
    averageLuminance: avgLum,
    shadowClipping,
    highlightClipping,
    quality: frameExposureQuality(avgLum, shadowClipping, highlightClipping),
  };
}

/**
 * Derive FrameMetrics from the ExposureMetrics already stored on a
 * ScannedImage (populated by the Pipeline workstream after analyzeHistogram).
 *
 * ExposureMetrics stores:
 *   meanLuminance  0–255  (divide by 255 to normalise)
 *   shadowClipPct  0–100  (divide by 100 to normalise)
 *   highlightClipPct 0–100
 */
export function exposureMetricsToFrameMetrics(
  imageId: string,
  em: ExposureMetrics,
): FrameMetrics {
  const avgLum = em.meanLuminance != null ? em.meanLuminance / 255 : 0.5;
  const shadowClipping = em.shadowClipPct != null ? em.shadowClipPct / 100 : 0;
  const highlightClipping = em.highlightClipPct != null ? em.highlightClipPct / 100 : 0;
  return {
    imageId,
    averageLuminance: avgLum,
    shadowClipping,
    highlightClipping,
    quality: frameExposureQuality(avgLum, shadowClipping, highlightClipping),
  };
}

/**
 * Parse a Histogram out of the JSON blob stored in ExposureMetrics.histogramJson.
 * Returns null if absent or malformed.
 */
export function parseHistogramJson(json: string | undefined): Histogram | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'r' in parsed &&
      'g' in parsed &&
      'b' in parsed &&
      'luma' in parsed
    ) {
      return parsed as Histogram;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-frame quality classification (mirrors ExposureMetrics.swift)
// ---------------------------------------------------------------------------

/**
 * Classify a frame's exposure quality from normalised metrics.
 * Mirrors `FrameExposureMetrics.exposureQuality` in legacy Swift.
 *
 * Thresholds:
 *   underexposed  → shadowClipping  > 0.20
 *   overexposed   → highlightClipping > 0.20
 *   excellent     → luminance in [0.30, 0.70] AND shadow < 0.10 AND highlight < 0.10
 *   acceptable    → everything else
 */
export function frameExposureQuality(
  avgLuminance: number,
  shadowClipping: number,
  highlightClipping: number,
): ExposureQuality {
  if (shadowClipping > 0.20) return 'underexposed';
  if (highlightClipping > 0.20) return 'overexposed';
  const isWell =
    avgLuminance > 0.30 &&
    avgLuminance < 0.70 &&
    shadowClipping < 0.10 &&
    highlightClipping < 0.10;
  return isWell ? 'excellent' : 'acceptable';
}

// ---------------------------------------------------------------------------
// Roll-level aggregation (mirrors RollExposureMetrics.swift)
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

/**
 * Consistency score 0–1 (1 = perfect uniformity).
 * Based on standard deviation of frame luminances; std-dev ≥ 0.20 → score 0.
 * Mirrors `RollExposureMetrics.consistencyScore`.
 */
function consistencyScore(frames: FrameMetrics[]): number {
  if (frames.length <= 1) return 1;
  const avg = mean(frames.map((f) => f.averageLuminance));
  const variance = mean(frames.map((f) => Math.pow(f.averageLuminance - avg, 2)));
  const stdDev = Math.sqrt(variance);
  return Math.max(0, 1 - stdDev / 0.2);
}

/**
 * Classify roll quality from the fraction of well-exposed frames and
 * consistency score. Mirrors `RollExposureMetrics.overallQuality`.
 */
function rollQuality(wellExposedPct: number, consistency: number): RollQuality {
  if (wellExposedPct > 0.8 && consistency > 0.7) return 'excellent';
  if (wellExposedPct > 0.6) return 'good';
  if (wellExposedPct > 0.4) return 'fair';
  return 'poor';
}

/**
 * Average 256-bin channel arrays across multiple histograms.
 * Returns null when no valid histograms are provided.
 */
function averageHistograms(histograms: Histogram[]): AggregateHistogram | null {
  if (histograms.length === 0) return null;
  const bins = 256;
  const r = new Array<number>(bins).fill(0);
  const g = new Array<number>(bins).fill(0);
  const b = new Array<number>(bins).fill(0);
  const luma = new Array<number>(bins).fill(0);
  for (const h of histograms) {
    for (let i = 0; i < bins; i++) {
      r[i] += (h.r[i] ?? 0) / histograms.length;
      g[i] += (h.g[i] ?? 0) / histograms.length;
      b[i] += (h.b[i] ?? 0) / histograms.length;
      luma[i] += (h.luma[i] ?? 0) / histograms.length;
    }
  }
  return { r, g, b, luma };
}

// ---------------------------------------------------------------------------
// Template insights (mirrors InsightGenerator + RollExposureMetrics.generateRollInsights)
// ---------------------------------------------------------------------------

/**
 * Generate template-based RollInsights from aggregate roll statistics.
 *
 * Ported from:
 *   `InsightGenerator.generateInsights`       (RollInsight.swift)
 *   `RollExposureMetrics.generateRollInsights` (ExposureMetrics.swift)
 *
 * Returns insights ordered: overall quality → consistency → shadow → highlight → midtones.
 */
export function generateRollInsights(
  quality: RollQuality,
  wellExposedPct: number,
  consistency: number,
  avgShadowClipping: number,
  avgHighlightClipping: number,
  lumaHistogram: number[] | null,
): RollInsight[] {
  const insights: RollInsight[] = [];

  // --- Overall quality (mirrors RollExposureMetrics.generateRollInsights) ---
  const qualityLabels: Record<RollQuality, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
  };
  const qualityDescriptions: Record<RollQuality, string> = {
    excellent: 'Consistently well-exposed throughout the roll',
    good: 'Most frames are well-exposed with minor variations',
    fair: 'Mixed exposure quality across the roll',
    poor: 'Significant exposure issues detected',
  };
  insights.push({
    id: 'overall-quality',
    type: quality === 'excellent' || quality === 'good' ? 'positive' : 'warning',
    title: `Roll Quality: ${qualityLabels[quality]}`,
    description: qualityDescriptions[quality],
    metric: wellExposedPct,
  });

  // --- Consistency ---
  if (consistency > 0.8) {
    insights.push({
      id: 'consistency-excellent',
      type: 'positive',
      title: 'Excellent Consistency',
      description: 'Exposure is very consistent across the roll',
      metric: consistency,
    });
  } else if (consistency < 0.5) {
    insights.push({
      id: 'consistency-poor',
      type: 'warning',
      title: 'Inconsistent Exposure',
      description: 'Exposure varies significantly between frames',
      metric: consistency,
    });
  }

  // --- Shadow clipping ---
  if (avgShadowClipping < 0.05) {
    insights.push({
      id: 'shadow-excellent',
      type: 'positive',
      title: 'Excellent Shadow Detail',
      description: 'Shadows are well-preserved with minimal clipping',
      metric: avgShadowClipping,
    });
  } else if (avgShadowClipping > 0.15) {
    insights.push({
      id: 'shadow-warning',
      type: 'warning',
      title: 'Shadow Clipping Detected',
      description: 'Consider increasing exposure to preserve shadow detail',
      metric: avgShadowClipping,
    });
  }

  // --- Highlight clipping ---
  if (avgHighlightClipping < 0.05) {
    insights.push({
      id: 'highlight-excellent',
      type: 'positive',
      title: 'Highlights Preserved Well',
      description: 'No significant highlight clipping detected',
      metric: avgHighlightClipping,
    });
  } else if (avgHighlightClipping > 0.15) {
    insights.push({
      id: 'highlight-warning',
      type: 'warning',
      title: 'Highlight Clipping Detected',
      description: 'Some highlights may be overexposed',
      metric: avgHighlightClipping,
    });
  }

  // --- Midtone distribution (only when histogram data is available) ---
  if (lumaHistogram && lumaHistogram.length >= 3) {
    const third = Math.floor(lumaHistogram.length / 3);
    const midSlice = lumaHistogram.slice(third, 2 * third);
    const midtonesValue = mean(midSlice);
    if (midtonesValue > 0.5) {
      insights.push({
        id: 'midtones-good',
        type: 'info',
        title: 'Good Midtone Separation',
        description: 'Strong detail in middle tones',
        metric: midtonesValue,
      });
    }
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Top-level: compute roll metrics from ScannedImage list
// ---------------------------------------------------------------------------

/**
 * Derive FrameMetrics for a single ScannedImage.
 *
 * Resolution order (mirrors Pipeline → Storage → Insights flow):
 *   1. exposureMetrics on the image (written by Pipeline after analyzeHistogram)
 *   2. processParams.exposure as a rough luminance proxy (fallback for images
 *      processed before Insights was wired)
 *
 * Returns null when no usable data is present (unprocessed image with no metrics).
 */
export function frameMetricsFromImage(image: ScannedImage): FrameMetrics | null {
  const em = image.exposureMetrics;

  if (em) {
    // If a histogram JSON blob is stored, parse and prefer it for luminance.
    const hist = parseHistogramJson(em.histogramJson);
    if (hist) {
      return histogramToFrameMetrics(image.id, hist);
    }
    // Fall back to scalar fields on ExposureMetrics.
    if (em.meanLuminance != null || em.shadowClipPct != null || em.highlightClipPct != null) {
      return exposureMetricsToFrameMetrics(image.id, em);
    }
  }

  // Last-resort fallback: derive a rough luminance from the exposure slider.
  // exposure is in EV (−2…+2); map to 0–1 with 0 EV → 0.5.
  const ev = image.processParams?.exposure ?? 0;
  const approxLum = Math.min(1, Math.max(0, 0.5 + ev * 0.125));
  return {
    imageId: image.id,
    averageLuminance: approxLum,
    shadowClipping: 0,
    highlightClipping: 0,
    quality: frameExposureQuality(approxLum, 0, 0),
  };
}

/**
 * Compute full RollMetrics for a list of ScannedImages.
 *
 * Safe to call with an empty array — returns a zero-state RollMetrics
 * with frameCount = 0.
 */
export function computeRollMetrics(images: ScannedImage[]): RollMetrics {
  if (images.length === 0) {
    return {
      frameCount: 0,
      averageLuminance: 0,
      averageShadowClipping: 0,
      averageHighlightClipping: 0,
      wellExposedCount: 0,
      wellExposedPct: 0,
      consistencyScore: 1,
      quality: 'fair',
      insights: [],
      frames: [],
      aggregateHistogram: null,
    };
  }

  // Build per-frame metrics.
  const frames: FrameMetrics[] = images
    .map(frameMetricsFromImage)
    .filter((f): f is FrameMetrics => f !== null);

  // Collect all parsed histograms for the aggregate.
  const histograms: Histogram[] = images.flatMap((img) => {
    const hist = parseHistogramJson(img.exposureMetrics?.histogramJson);
    return hist ? [hist] : [];
  });

  const avgLum = mean(frames.map((f) => f.averageLuminance));
  const avgShadow = mean(frames.map((f) => f.shadowClipping));
  const avgHighlight = mean(frames.map((f) => f.highlightClipping));
  const wellExposedCount = frames.filter(
    (f) => f.quality === 'excellent' || f.quality === 'acceptable',
  ).length;
  const wellExposedPct = frames.length > 0 ? wellExposedCount / frames.length : 0;
  const consistency = consistencyScore(frames);
  const quality = rollQuality(wellExposedPct, consistency);
  const aggregateHistogram = averageHistograms(histograms);

  const lumaHistogram = aggregateHistogram?.luma ?? null;
  const insights = generateRollInsights(
    quality,
    wellExposedPct,
    consistency,
    avgShadow,
    avgHighlight,
    lumaHistogram,
  );

  return {
    frameCount: frames.length,
    averageLuminance: avgLum,
    averageShadowClipping: avgShadow,
    averageHighlightClipping: avgHighlight,
    wellExposedCount,
    wellExposedPct,
    consistencyScore: consistency,
    quality,
    insights,
    frames,
    aggregateHistogram,
  };
}
