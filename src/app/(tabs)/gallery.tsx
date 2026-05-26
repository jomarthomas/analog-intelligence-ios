/**
 * Gallery tab — scanned image grid.
 *
 * Intended layout (from legacy-ios/docs/PRODUCT_UI_SPEC.md):
 *   - 3-column grid of thumbnails
 *   - Dark background, inline navigation title
 *   - Tap to preview full image
 *   - Multi-select → Export / Delete toolbar
 *   - Pro: Contact Sheet generator action
 *   - Free tier: "SPONSORED AD" banner at bottom
 *
 * TODO(integration): Storage agent — import useGalleryStore or
 *   GalleryRepository from src/storage/ and replace PlaceholderScreen
 *   with the real <GalleryGrid> component. Wire up the scan→gallery
 *   data flow (new scan saved to storage, gallery reloads).
 *
 * TODO(integration): Monetization agent — mount <BannerAdView> from
 *   src/monetization/ at the bottom for free-tier users.
 *   Mount Pro gating around "Contact Sheet" action.
 */

import { Screen } from '@/theme/screen';
import { PlaceholderScreen } from '@/theme/placeholder-screen';

export default function GalleryScreen() {
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <PlaceholderScreen
        title="Gallery"
        purpose="Browse and export your scanned film negatives in a 3-column grid."
        icon="photo.on.rectangle.angled"
      />
    </Screen>
  );
}
