/**
 * src/monetization/BannerAd.tsx
 *
 * AdMob adaptive banner for free-tier users.
 * Renders null automatically when the user has Pro (no ads).
 *
 * Port of legacy BannerAdView.swift + AdMobBannerViewRepresentable.
 *
 * Usage — mount at the bottom of scan/gallery screens:
 *   <BannerAd />
 *
 * The banner uses the adaptive anchored format which automatically
 * sizes itself to fill the container width.
 *
 * Ad unit IDs are read from @/monetization/config (expo-constants → app.json
 * extra).  Google TEST IDs are the fallback — safe for development.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BannerAd as GoogleBannerAd,
  BannerAdSize,
  type BannerAdProps,
} from 'react-native-google-mobile-ads';

import { useTheme } from '@/hooks/use-theme';
import { useProStatus } from './useProStatus';
import { ADMOB_BANNER_AD_UNIT_ID } from './config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BannerAdComponentProps = {
  /**
   * Override the banner ad size.
   * Default: ANCHORED_ADAPTIVE_BANNER (fills container width).
   */
  size?: BannerAdProps['size'];
  /**
   * Override the ad unit ID.
   * Falls back to the platform-correct ID from config.ts (TEST ID in dev).
   */
  adUnitId?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BannerAd({
  size = BannerAdSize.ANCHORED_ADAPTIVE_BANNER,
  adUnitId = ADMOB_BANNER_AD_UNIT_ID,
}: BannerAdComponentProps) {
  const theme = useTheme();
  const { isPro } = useProStatus();
  const [adLoaded, setAdLoaded] = useState(false);
  const [adFailed, setAdFailed] = useState(false);

  const handleLoaded = useCallback(() => {
    setAdLoaded(true);
    setAdFailed(false);
  }, []);

  const handleError = useCallback((error: Error) => {
    console.warn('[BannerAd] Failed to load:', error.message);
    setAdFailed(true);
    setAdLoaded(false);
  }, []);

  // Pro users see no ads.
  if (isPro) return null;

  // If the ad failed to load, render nothing (don't show an empty strip).
  if (adFailed) return null;

  return (
    <View
      style={[
        styles.container,
        { borderTopColor: theme.border },
        // Show a thin placeholder height until the ad loads so the layout
        // doesn't jump; the GoogleBannerAd component fills it when ready.
        !adLoaded && styles.placeholder,
      ]}>
      <GoogleBannerAd
        unitId={adUnitId}
        size={size}
        requestOptions={{
          // Request non-personalised ads by default (GDPR-safer until ATT
          // consent is obtained).  The orchestrator can relax this after
          // implementing the consent flow.
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={handleLoaded}
        onAdFailedToLoad={handleError}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  /** Minimal reserved height before the ad loads to avoid layout jump. */
  placeholder: {
    minHeight: 50,
  },
});
