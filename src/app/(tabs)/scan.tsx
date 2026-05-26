/**
 * Scan tab — film-negative capture screen.
 *
 * Intended flow (from legacy-ios/docs/PRODUCT_UI_SPEC.md):
 *   1. Camera preview fills screen
 *   2. Frame-alignment overlay with white border guides
 *   3. Large circular shutter button at bottom centre
 *   4. Settings icon top-left, flash / torch top-right
 *   5. Free tier: "AI Watermark" text overlay + "SPONSORED AD" banner
 *   6. On capture → navigate to adjust/[id]
 *
 * TODO(integration): Camera agent — mount <CameraPreview> and
 *   <FrameAlignmentOverlay> from src/camera/ here. Replace the
 *   PlaceholderScreen with the full camera layout below.
 *
 * TODO(integration): Monetization agent — mount <WatermarkOverlay> and
 *   <BannerAdView> from src/monetization/ here for free-tier users.
 */

import { Screen } from '@/theme/screen';
import { PlaceholderScreen } from '@/theme/placeholder-screen';

export default function ScanScreen() {
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <PlaceholderScreen
        title="Scan"
        purpose="Place a film negative on a light source, align the frame, and tap capture."
        icon="camera.fill"
      />
    </Screen>
  );
}
