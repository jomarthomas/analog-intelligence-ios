/**
 * src/monetization/index.ts
 *
 * Public API barrel for the monetization module.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  ORCHESTRATOR WIRING REQUIRED                                   │
 * │                                                                 │
 * │  1. Call initPurchases() once, early in the app lifecycle       │
 * │     (e.g. in src/app/_layout.tsx useEffect on first mount).     │
 * │                                                                 │
 * │  2. Mount <BannerAd /> at the bottom of the scan / gallery      │
 * │     tab screens (renders null automatically for Pro users).     │
 * │                                                                 │
 * │  3. Use <ProGate> to wrap Pro-only sections (Insights tab,      │
 * │     AI panel, full-res export option).                          │
 * │                                                                 │
 * │  4. Use clampResolution(size) from resolutionLimiter.ts in the  │
 * │     export pipeline before calling expo-image-manipulator.      │
 * │                                                                 │
 * │  5. Wrap image views with <WatermarkOverlay> and call           │
 * │     buildExportWatermarkParams() in the export pipeline.        │
 * │                                                                 │
 * │  6. Add the required app.json keys — see config.ts header       │
 * │     for the exact key names and plugin config snippet.          │
 * └─────────────────────────────────────────────────────────────────┘
 */

// Config & IDs
export {
  REVENUECAT_API_KEY,
  REVENUECAT_ENTITLEMENT_ID,
  REVENUECAT_OFFERING_ID,
  ADMOB_BANNER_AD_UNIT_ID,
  IS_REVENUECAT_CONFIGURED,
  IS_ADMOB_CONFIGURED,
} from './config';

// RevenueCat purchase layer
export {
  initPurchases,
  fetchOffering,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
} from './purchases';
export type { PurchaseResult, RestoreResult } from './purchases';

// React hook
export { useProStatus, getProStatusSync } from './useProStatus';
export type { ProStatusState } from './useProStatus';

// UI components
export { ProGate } from './ProGate';
export { ProUpgradeBanner } from './ProUpgradeBanner';
export { Paywall } from './Paywall';
export { BannerAd } from './BannerAd';
export { WatermarkOverlay, buildExportWatermarkParams } from './WatermarkOverlay';
export type { ExportWatermarkParams } from './WatermarkOverlay';

// Resolution limiting (pure TS — usable in pipeline without React)
export {
  clampResolution,
  getResolutionInfo,
  wouldBeLimited,
  calculateTargetSize,
  maxAllowedResolution,
  resolutionLimitDescription,
  formatResolution,
  formatMegapixels,
  FREE_MAX_RESOLUTION,
  PRO_MAX_RESOLUTION,
} from './resolutionLimiter';
export type { Size, ResolutionInfo } from './resolutionLimiter';
