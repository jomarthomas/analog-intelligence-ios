import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic Expo config.
 *
 * `app.json` holds the static config and is passed in as `config`. Here we
 * inject production credentials from the environment (EAS secrets / CI / a
 * gitignored `.env`) so real keys never land in this PUBLIC repo. Every value
 * falls back to the `app.json` placeholder / Google TEST id, so `expo run`
 * works with no secrets in development.
 *
 * Production env vars (set via `eas secret:create` or CI):
 *   ADMOB_IOS_APP_ID / ADMOB_ANDROID_APP_ID     — real AdMob app IDs
 *   ADMOB_BANNER_IOS / ADMOB_BANNER_ANDROID      — real banner ad-unit IDs
 *   REVENUECAT_IOS_KEY / REVENUECAT_ANDROID_KEY  — real RevenueCat public keys
 *   IOS_BUILD_NUMBER / ANDROID_VERSION_CODE      — store build numbers
 *
 * See docs/APP_STORE_READINESS.md.
 */

// Google's official TEST AdMob app IDs (safe default for dev/sim builds).
const TEST_ADMOB_APP_ID_IOS = 'ca-app-pub-3940256099942544~1458002511';
const TEST_ADMOB_APP_ID_ANDROID = 'ca-app-pub-3940256099942544~3347511713';

// Shown by the iOS App Tracking Transparency prompt (free-tier ads only).
const ATT_USAGE =
  'Analog Intelligence uses your device identifier to show relevant ads in the ' +
  'free tier. Your scans are processed on-device and never leave your phone.';

// Apple "required reason" API declarations for the app's own dependencies
// (MMKV/UserDefaults, file-system timestamps, available disk space, uptime).
const PRIVACY_MANIFESTS = {
  NSPrivacyAccessedAPITypes: [
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
      NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
    },
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
      NSPrivacyAccessedAPITypeReasons: ['C617.1'],
    },
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
      NSPrivacyAccessedAPITypeReasons: ['E174.1'],
    },
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
      NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
    },
  ],
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = process.env;

  const admobIosAppId = env.ADMOB_IOS_APP_ID ?? TEST_ADMOB_APP_ID_IOS;
  const admobAndroidAppId = env.ADMOB_ANDROID_APP_ID ?? TEST_ADMOB_APP_ID_ANDROID;

  // Rewrite the google-mobile-ads plugin entry with the resolved app IDs
  // (the app ID is baked natively, so it must be correct at prebuild time).
  type PluginEntry = NonNullable<ExpoConfig['plugins']>[number];
  const plugins = (config.plugins ?? []).map((plugin): PluginEntry => {
    if (Array.isArray(plugin) && plugin[0] === 'react-native-google-mobile-ads') {
      return [
        'react-native-google-mobile-ads',
        { iosAppId: admobIosAppId, androidAppId: admobAndroidAppId },
      ];
    }
    return plugin;
  });

  return {
    ...config,
    name: config.name ?? 'Analog Intelligence',
    slug: config.slug ?? 'analog-intelligence',
    plugins,
    ios: {
      ...config.ios,
      buildNumber: env.IOS_BUILD_NUMBER ?? config.ios?.buildNumber ?? '1',
      infoPlist: {
        ...config.ios?.infoPlist,
        NSUserTrackingUsageDescription: ATT_USAGE,
      },
      privacyManifests: PRIVACY_MANIFESTS,
    },
    android: {
      ...config.android,
      versionCode: env.ANDROID_VERSION_CODE
        ? Number.parseInt(env.ANDROID_VERSION_CODE, 10)
        : (config.android?.versionCode ?? 1),
    },
    extra: {
      ...config.extra,
      revenueCatApiKeyIos: env.REVENUECAT_IOS_KEY ?? config.extra?.revenueCatApiKeyIos,
      revenueCatApiKeyAndroid:
        env.REVENUECAT_ANDROID_KEY ?? config.extra?.revenueCatApiKeyAndroid,
      admobBannerAdUnitIdIos: env.ADMOB_BANNER_IOS ?? config.extra?.admobBannerAdUnitIdIos,
      admobBannerAdUnitIdAndroid:
        env.ADMOB_BANNER_ANDROID ?? config.extra?.admobBannerAdUnitIdAndroid,
    },
  };
};
