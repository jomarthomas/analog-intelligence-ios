/**
 * src/monetization/consent.ts
 *
 * Google UMP (User Messaging Platform) consent — the GDPR / regional privacy
 * gate Google and Apple require an ad-supported app to present BEFORE serving
 * ads. Runs once at startup, right before AdMob initialises.
 *
 * It resolves gracefully and never throws, so it can't block or crash app
 * launch: outside a regulated region (e.g. the US) `gatherConsent()` resolves
 * without showing anything; if it fails, ads simply fall back to
 * non-personalised.
 *
 * iOS App Tracking Transparency: the ATT system prompt requires the
 * `expo-tracking-transparency` dependency (NOT yet installed) plus the
 * `NSUserTrackingUsageDescription` string (added in app.config.ts). Until that
 * dep lands, UMP still runs and ads serve non-personalised on iOS. Tracked in
 * docs/APP_STORE_READINESS.md.
 */

import { Platform } from 'react-native';
import { AdsConsent } from 'react-native-google-mobile-ads';

import { addBreadcrumb, captureException } from '@/lib/telemetry';

let gathered = false;

/**
 * Request a UMP consent-info update and show the consent form if required.
 * Idempotent — only the first call does work. Always resolves.
 */
export async function gatherAdsConsent(): Promise<void> {
  if (gathered || Platform.OS === 'web') return;
  gathered = true;
  try {
    const info = await AdsConsent.gatherConsent();
    addBreadcrumb({
      category: 'ads',
      message: `UMP consent gathered (status=${String(info.status)})`,
      level: 'info',
    });
  } catch (err) {
    // Non-fatal: without consent we serve non-personalised ads.
    captureException(err, { source: 'gatherAdsConsent' });
  }
}
