/**
 * src/camera/useCameraPermissions.ts
 *
 * Camera permission flow for the scan screen. Thin wrapper around
 * react-native-vision-camera's `useCameraPermission` that auto-requests once
 * and exposes a small, intent-revealing status enum for the UI.
 *
 * Microphone is intentionally NOT requested — Analog Intelligence is a stills
 * scanner with no video/audio capture (see task #5 scope).
 *
 * Ported behaviour from legacy `CameraManager.requestAuthorization()`:
 *   notDetermined → request; denied/restricted → surface a "go to Settings"
 *   state; authorized → ready.
 */

import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';

/**
 * Coarse permission status for UI branching.
 * - `checking`   — initial mount, before the first status read settles
 * - `granted`    — camera authorized, preview can mount
 * - `denied`     — user denied; can still re-request in-app
 * - `blocked`    — denied and cannot re-request; must open system Settings
 */
export type CameraPermissionStatus = 'checking' | 'granted' | 'denied' | 'blocked';

export interface CameraPermissionsResult {
  status: CameraPermissionStatus;
  hasPermission: boolean;
  /** Re-request the permission from the user (no-op once blocked). */
  request: () => Promise<boolean>;
  /** Opens the OS app-settings page so a blocked user can grant manually. */
  openSettings: () => Promise<void>;
}

export function useCameraPermissions(): CameraPermissionsResult {
  const { hasPermission, requestPermission, canRequestPermission } =
    useCameraPermission();

  // Track whether we've completed at least one request/read cycle so we can
  // distinguish "still checking" from "definitively denied".
  const [hasResolved, setHasResolved] = useState(false);

  const request = useCallback(async (): Promise<boolean> => {
    try {
      const granted = await requestPermission();
      return granted;
    } finally {
      setHasResolved(true);
    }
  }, [requestPermission]);

  // Auto-request exactly once on mount when we don't yet have permission and
  // are still allowed to ask (mirrors legacy auto-request on screen appear).
  useEffect(() => {
    if (hasPermission) {
      setHasResolved(true);
      return;
    }
    if (canRequestPermission) {
      void request();
    } else {
      // Already decided (denied/blocked) and cannot ask again.
      setHasResolved(true);
    }
    // Only run on mount / when the underlying permission identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSettings = useCallback(async (): Promise<void> => {
    await Linking.openSettings();
  }, []);

  let status: CameraPermissionStatus;
  if (hasPermission) {
    status = 'granted';
  } else if (!hasResolved) {
    status = 'checking';
  } else if (canRequestPermission) {
    status = 'denied';
  } else {
    status = 'blocked';
  }

  return { status, hasPermission, request, openSettings };
}
