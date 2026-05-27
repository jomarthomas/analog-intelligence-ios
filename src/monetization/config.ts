/**
 * src/monetization/config.ts
 *
 * Reads all monetization credentials and IDs from expo-constants
 * (which surfaces app.json `expo.extra` at runtime), with safe
 * placeholder / Google TEST ad unit ID fallbacks so the module
 * is always importable — even without a real app.json configuration.
 *
 * IMPORTANT: never commit real RevenueCat API keys or AdMob app IDs
 * to this file.  All production values must live in app.json `extra`
 * (or a gitignored .env that feeds into it).  See docs/DECISIONS.md Q4.
 *
 * app.json `expo.extra` keys the orchestrator must add
 * ─────────────────────────────────────────────────────
 *   revenueCatApiKeyIos:        "appl_PLACEHOLDER"
 *   revenueCatApiKeyAndroid:    "goog_PLACEHOLDER"
 *   revenueCatEntitlementId:    "pro"
 *   revenueCatOfferingId:       "default"
 *   admobBannerAdUnitIdIos:     "ca-app-pub-PLACEHOLDER/PLACEHOLDER"
 *   admobBannerAdUnitIdAndroid: "ca-app-pub-PLACEHOLDER/PLACEHOLDER"
 *
 * react-native-google-mobile-ads plugin config (app.json `expo.plugins`)
 * ────────────────────────────────────────────────────────────────────────
 *   [
 *     "react-native-google-mobile-ads",
 *     {
 *       "android_app_id": "ca-app-pub-3940256099942544~3347511713",
 *       "ios_app_id":     "ca-app-pub-3940256099942544~1458002511"
 *     }
 *   ]
 *
 * The values above are Google's official TEST app IDs (safe to ship during
 * development).  Replace with production app IDs before App Store / Play
 * Store release.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Raw extra blob (may be undefined in bare/test environments)
// ---------------------------------------------------------------------------

type ExtraConfig = {
  revenueCatApiKeyIos?: string;
  revenueCatApiKeyAndroid?: string;
  revenueCatEntitlementId?: string;
  revenueCatOfferingId?: string;
  admobBannerAdUnitIdIos?: string;
  admobBannerAdUnitIdAndroid?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

// ---------------------------------------------------------------------------
// RevenueCat
// ---------------------------------------------------------------------------

/**
 * RevenueCat public API key for the current platform.
 * Placeholder values signal "not yet configured" — RevenueCat will fail to
 * initialise gracefully (purchases unavailable, but the app won't crash).
 */
export const REVENUECAT_API_KEY: string =
  Platform.OS === 'ios'
    ? (extra.revenueCatApiKeyIos ?? 'appl_PLACEHOLDER_REVENUECAT_IOS_KEY')
    : (extra.revenueCatApiKeyAndroid ?? 'goog_PLACEHOLDER_REVENUECAT_ANDROID_KEY');

/**
 * RevenueCat entitlement identifier that represents Pro access.
 * Must match the entitlement created in the RevenueCat dashboard.
 */
export const REVENUECAT_ENTITLEMENT_ID: string =
  extra.revenueCatEntitlementId ?? 'pro';

/**
 * RevenueCat offering identifier to fetch and display on the paywall.
 * 'default' resolves to whatever offering is marked current in the dashboard.
 */
export const REVENUECAT_OFFERING_ID: string =
  extra.revenueCatOfferingId ?? 'default';

// ---------------------------------------------------------------------------
// AdMob
// ---------------------------------------------------------------------------

/**
 * Google TEST ad unit IDs (official Google test IDs — safe for development).
 * iOS:     ca-app-pub-3940256099942544/2934735716  (banner)
 * Android: ca-app-pub-3940256099942544/6300978111  (banner)
 *
 * Replace with production IDs via app.json `extra` before release.
 */
const TEST_BANNER_ID_IOS = 'ca-app-pub-3940256099942544/2934735716';
const TEST_BANNER_ID_ANDROID = 'ca-app-pub-3940256099942544/6300978111';

/** Banner ad unit ID for the current platform. Defaults to Google TEST ID. */
export const ADMOB_BANNER_AD_UNIT_ID: string =
  Platform.OS === 'ios'
    ? (extra.admobBannerAdUnitIdIos ?? TEST_BANNER_ID_IOS)
    : (extra.admobBannerAdUnitIdAndroid ?? TEST_BANNER_ID_ANDROID);

// ---------------------------------------------------------------------------
// Feature flags derived from config presence
// ---------------------------------------------------------------------------

/** True when a real (non-placeholder) RevenueCat key is configured. */
export const IS_REVENUECAT_CONFIGURED: boolean =
  !REVENUECAT_API_KEY.includes('PLACEHOLDER');

/** True when a real (non-test) AdMob banner ID is configured. */
export const IS_ADMOB_CONFIGURED: boolean =
  !ADMOB_BANNER_AD_UNIT_ID.startsWith('ca-app-pub-3940256099942544');
