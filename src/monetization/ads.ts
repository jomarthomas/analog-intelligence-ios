/**
 * src/monetization/ads.ts
 *
 * One-time AdMob (Google Mobile Ads SDK) initialisation.
 *
 * The native SDK MUST be initialised once before any `<BannerAd>` will serve;
 * without this call banners silently never load. Call `initAds()` from the root
 * layout bootstrap. It is safe to call when ads are unconfigured (test IDs) and
 * resolves gracefully on failure so it can never crash app startup.
 */

import { Platform } from 'react-native';
import mobileAds from 'react-native-google-mobile-ads';

import { addBreadcrumb, captureException } from '@/lib/telemetry';

let started = false;

/** Initialise the Google Mobile Ads SDK once. No-op on web / repeat calls. */
export async function initAds(): Promise<void> {
  if (started || Platform.OS === 'web') return;
  started = true;
  try {
    await mobileAds().initialize();
    addBreadcrumb({ category: 'ads', message: 'AdMob SDK initialised', level: 'info' });
  } catch (err) {
    // Non-fatal: ads just won't serve. Surface to telemetry, never throw.
    captureException(err, { source: 'initAds' });
  }
}
