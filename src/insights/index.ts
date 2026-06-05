/**
 * src/insights/index.ts
 *
 * Public API barrel for the Insights feature.
 *
 * Consumers (the Insights tab route in src/app):
 *   import { InsightsView } from '@/insights';
 *
 * The orchestrator mounts <InsightsView> inside a Pro gate in
 * src/app/(tabs)/insights.tsx — InsightsView itself is Pro-gate agnostic.
 */
export { InsightsView } from './InsightsView';
export { Histogram } from './Histogram';
export { ClippingCard } from './ClippingCard';
export type { ClippingVariant } from './ClippingCard';
export {
  computeRollMetrics,
  frameMetricsFromImage,
  generateRollInsights,
  histogramToFrameMetrics,
  exposureMetricsToFrameMetrics,
  averageLuminanceFromBins,
  frameExposureQuality,
  parseHistogramJson,
} from './metrics';
export type {
  RollInsight,
  RollMetrics,
  FrameMetrics,
  AggregateHistogram,
  RollQuality,
  ExposureQuality,
  InsightType,
} from './metrics';
