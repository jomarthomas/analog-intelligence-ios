/**
 * src/monetization/useProStatus.ts
 *
 * React hook that returns the user's Pro status and purchase actions.
 *
 * Sources of truth (in priority order):
 *   1. RevenueCat customerInfo (authoritative, async)
 *   2. MMKV preferences (fast local cache, updated by purchases.ts helpers)
 *
 * The hook reads the initial value from MMKV (synchronous, zero-flash), then
 * reconciles with RevenueCat on mount and after each purchase/restore action.
 *
 * Public API
 * ──────────
 *   const { isPro, isLoading, refresh, purchase, restore } = useProStatus();
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PurchasesPackage } from 'react-native-purchases';

import { canAccessProFeatures } from '@/storage/preferences';
import {
  fetchOffering,
  getCustomerInfo,
  purchasePackage,
  restorePurchases,
  type PurchaseResult,
  type RestoreResult,
} from './purchases';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProStatusState = {
  /** True when the user has an active Pro entitlement. */
  isPro: boolean;
  /** True while an async RC check, purchase, or restore is in-flight. */
  isLoading: boolean;
  /** Non-null when a purchase or restore attempt fails. */
  error: string | null;
  /**
   * Refreshes Pro status from RevenueCat.
   * Call after app foreground events or external subscription changes.
   */
  refresh: () => Promise<void>;
  /**
   * Purchase the given RevenueCat package and refresh Pro status.
   * Returns the purchase result for the caller to handle UI feedback.
   */
  purchase: (pkg: PurchasesPackage) => Promise<PurchaseResult>;
  /**
   * Restore previous purchases and refresh Pro status.
   * Returns the restore result for the caller to handle UI feedback.
   */
  restore: () => Promise<RestoreResult>;
  /** Clears the current error state. */
  clearError: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProStatus(): ProStatusState {
  // Initialise from MMKV for an instant, synchronous value.
  const [isPro, setIsPro] = useState<boolean>(() => canAccessProFeatures());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Prevent state updates after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ------------------------------------------------------------------
  // Refresh from RevenueCat
  // ------------------------------------------------------------------

  const refresh = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;
    setIsLoading(true);

    try {
      const customerInfo = await getCustomerInfo();
      if (!mountedRef.current) return;

      if (customerInfo !== null) {
        // purchases.ts already synced MMKV; read back the ground-truth value.
        setIsPro(canAccessProFeatures());
      }
    } catch (err) {
      // Non-fatal — keep cached MMKV value.
      console.warn('[useProStatus] refresh error:', err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  // Refresh once on mount.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ------------------------------------------------------------------
  // Purchase
  // ------------------------------------------------------------------

  const purchase = useCallback(
    async (pkg: PurchasesPackage): Promise<PurchaseResult> => {
      if (!mountedRef.current) {
        return { success: false, cancelled: false, error: 'Component unmounted.' };
      }

      setIsLoading(true);
      setError(null);

      const result = await purchasePackage(pkg);

      if (mountedRef.current) {
        if (result.success) {
          setIsPro(result.isPro);
        } else if (!result.cancelled) {
          setError(result.error);
        }
        setIsLoading(false);
      }

      return result;
    },
    [],
  );

  // ------------------------------------------------------------------
  // Restore
  // ------------------------------------------------------------------

  const restore = useCallback(async (): Promise<RestoreResult> => {
    if (!mountedRef.current) {
      return { success: false, error: 'Component unmounted.' };
    }

    setIsLoading(true);
    setError(null);

    const result = await restorePurchases();

    if (mountedRef.current) {
      if (result.success) {
        setIsPro(result.isPro);
      } else {
        setError(result.error);
      }
      setIsLoading(false);
    }

    return result;
  }, []);

  // ------------------------------------------------------------------
  // Clear error
  // ------------------------------------------------------------------

  const clearError = useCallback(() => setError(null), []);

  // ------------------------------------------------------------------

  return { isPro, isLoading, error, refresh, purchase, restore, clearError };
}

// ---------------------------------------------------------------------------
// Lightweight non-hook helper (for use outside React components)
// ---------------------------------------------------------------------------

/**
 * Returns the current Pro status from the MMKV cache synchronously.
 * Does NOT trigger a RevenueCat network request.
 * Use inside callbacks, utils, and the resolution limiter where hooks are
 * not available.
 */
export function getProStatusSync(): boolean {
  return canAccessProFeatures();
}

// Re-export the fetchOffering helper so callers can get packages to purchase
// without importing from purchases.ts directly.
export { fetchOffering };
