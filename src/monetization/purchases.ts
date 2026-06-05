/**
 * src/monetization/purchases.ts
 *
 * RevenueCat integration: initialise the SDK, fetch offerings, purchase,
 * and restore.  After every authoritative entitlement change the Pro status
 * is synced into preferences (unlockPro / revokePro) so the rest of the app
 * can gate features with canAccessProFeatures() from @/storage/preferences.
 *
 * Design notes
 * ─────────────
 * • RevenueCat is the single source of truth for entitlements; MMKV prefs
 *   are a fast local cache so gates work offline / before RC resolves.
 * • All public functions are safe to call even when RC is not yet configured
 *   (placeholder key): they log a warning and resolve gracefully.
 * • No StoreKit or Billing Client code lives here — RC abstracts that away.
 */

import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
  LOG_LEVEL,
} from 'react-native-purchases';

import { unlockPro, revokePro } from '@/storage/preferences';
import {
  REVENUECAT_API_KEY,
  REVENUECAT_ENTITLEMENT_ID,
  REVENUECAT_OFFERING_ID,
  IS_REVENUECAT_CONFIGURED,
} from './config';

// ---------------------------------------------------------------------------
// Module-level initialisation state
// ---------------------------------------------------------------------------

let _initialized = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Syncs the Pro entitlement from a CustomerInfo snapshot into MMKV prefs.
 * Called after init, purchase, and restore.
 */
function syncEntitlementToPrefs(customerInfo: CustomerInfo): boolean {
  const isPro =
    customerInfo.entitlements.active[REVENUECAT_ENTITLEMENT_ID] !== undefined;

  if (isPro) {
    unlockPro();
  } else {
    revokePro();
  }

  return isPro;
}

// ---------------------------------------------------------------------------
// Initialise
// ---------------------------------------------------------------------------

/**
 * Initialise the RevenueCat SDK.  Must be called once, early in app startup
 * (typically from the root layout or the monetization zustand store).
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initPurchases(): Promise<void> {
  if (_initialized) return;

  if (!IS_REVENUECAT_CONFIGURED) {
    console.warn(
      '[monetization] RevenueCat API key is a placeholder — purchases unavailable. ' +
        'Set revenueCatApiKeyIos / revenueCatApiKeyAndroid in app.json extra.',
    );
    // Still mark initialized so we don't retry on every render.
    _initialized = true;
    return;
  }

  try {
    // In development, show verbose RevenueCat logs.
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    Purchases.configure({ apiKey: REVENUECAT_API_KEY });

    // Sync entitlements immediately on startup.
    const customerInfo = await Purchases.getCustomerInfo();
    syncEntitlementToPrefs(customerInfo);

    _initialized = true;
    console.log('[monetization] RevenueCat initialized.');
  } catch (err) {
    console.error('[monetization] RevenueCat init failed:', err);
    // Don't throw — the app must not crash if purchases are unavailable.
  }
}

// ---------------------------------------------------------------------------
// Fetch offerings
// ---------------------------------------------------------------------------

/**
 * Fetch the current RevenueCat offering.
 * Returns null when RC is not configured or the network request fails.
 */
export async function fetchOffering(): Promise<PurchasesOffering | null> {
  if (!IS_REVENUECAT_CONFIGURED) return null;

  try {
    const offerings = await Purchases.getOfferings();

    const offering =
      REVENUECAT_OFFERING_ID === 'default'
        ? offerings.current
        : (offerings.all[REVENUECAT_OFFERING_ID] ?? offerings.current);

    return offering ?? null;
  } catch (err) {
    console.error('[monetization] fetchOffering error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Purchase
// ---------------------------------------------------------------------------

export type PurchaseResult =
  | { success: true; isPro: boolean; customerInfo: CustomerInfo }
  | { success: false; cancelled: boolean; error: string };

/**
 * Purchase the given RevenueCat package (e.g. the monthly/annual/lifetime
 * package from the current offering).
 *
 * Syncs the resulting entitlement into MMKV prefs on success.
 */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<PurchaseResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPro = syncEntitlementToPrefs(customerInfo);

    return { success: true, isPro, customerInfo };
  } catch (err: unknown) {
    // RevenueCat surfaces user-cancellation as an error with a specific code.
    // The RC SDK's error object has an `userCancelled` field.
    const rcErr = err as { userCancelled?: boolean; message?: string };
    if (rcErr.userCancelled === true) {
      return { success: false, cancelled: true, error: 'Purchase cancelled.' };
    }

    const message = rcErr.message ?? 'Unknown purchase error.';
    console.error('[monetization] purchasePackage error:', err);
    return { success: false, cancelled: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

export type RestoreResult =
  | { success: true; isPro: boolean; customerInfo: CustomerInfo }
  | { success: false; error: string };

/**
 * Restore previously completed purchases.
 * Syncs the restored entitlement into MMKV prefs.
 */
export async function restorePurchases(): Promise<RestoreResult> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isPro = syncEntitlementToPrefs(customerInfo);

    return { success: true, isPro, customerInfo };
  } catch (err: unknown) {
    const message = (err as { message?: string }).message ?? 'Restore failed.';
    console.error('[monetization] restorePurchases error:', err);
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Get current customer info
// ---------------------------------------------------------------------------

/**
 * Fetch the latest CustomerInfo snapshot from RevenueCat.
 * Returns null when RC is not configured or on network error.
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!IS_REVENUECAT_CONFIGURED) return null;

  try {
    return await Purchases.getCustomerInfo();
  } catch (err) {
    console.error('[monetization] getCustomerInfo error:', err);
    return null;
  }
}
