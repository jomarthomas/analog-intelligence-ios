/**
 * Insights tab — Pro-only roll exposure analysis.
 *
 * Intended layout (from legacy-ios/docs/PRODUCT_UI_SPEC.md):
 *   - Title: "INSIGHTS (PRO)"
 *   - Roll selector dropdown
 *   - Exposure analysis section with orange histogram chart
 *   - Shadow clipping % and Highlight clipping % metric cards
 *   - "Template-based" section: insight cards with icons + descriptions
 *   Example insights: "Highlights preserved well", "Overall well-exposed roll"
 *
 * TODO(integration): Insights agent — import <InsightsView>, <Histogram>,
 *   <ClippingCard> from src/insights/ and replace PlaceholderScreen.
 *   Wire up roll selector to src/storage/ GalleryRepository.
 *
 * TODO(integration): Monetization agent — wrap this entire screen in a
 *   Pro gate (<ProGate> from src/monetization/). Free users see an
 *   upgrade prompt with a preview of the histogram.
 */

import { Screen } from '@/theme/screen';
import { PlaceholderScreen } from '@/theme/placeholder-screen';

export default function InsightsScreen() {
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <PlaceholderScreen
        title="Insights"
        purpose="Analyse roll exposure — histogram, shadow/highlight clipping, and AI-generated insights."
        icon="waveform.path.ecg"
        pro
      />
    </Screen>
  );
}
