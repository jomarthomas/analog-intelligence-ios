/**
 * src/camera/cameraController.ts
 *
 * Pure helpers that translate between the live react-native-vision-camera v5
 * `CameraDevice` / `CameraController` objects and our framework-agnostic
 * capture-layer types. Keeping these out of the React components makes the
 * VisionCamera surface easy to mock and the components easy to read.
 *
 * Ported from legacy CameraManager + CalibrationManager device queries.
 */

import type {
  CameraController,
  CameraDevice,
  WhiteBalanceGains,
} from 'react-native-vision-camera';

import {
  DEFAULT_CAPABILITIES,
  gainsForTemperature,
  type CalibrationSnapshot,
  type CameraCapabilities,
} from '@/camera/types';

/**
 * Read static capability flags from a bound device + controller.
 *
 * RAW support is inferred from the device's photo output stream resolutions
 * combined with VisionCamera exposing the `'dng'` container format. VisionCamera
 * does not expose a direct `supportsRawCapture` boolean on the device, so we
 * treat a device that can stream photos AND supports manual exposure locking as
 * RAW-capable on iOS; the actual capture call falls back gracefully if the
 * format is rejected (see `CameraScanView.capture`).
 */
export function readCapabilities(
  device: CameraDevice | undefined,
  controller: CameraController | undefined,
): CameraCapabilities {
  if (device == null) return DEFAULT_CAPABILITIES;

  const supportsRawCapture = deviceSupportsRaw(device);

  return {
    supportsFocusLocking: device.supportsFocusLocking,
    supportsExposureLocking: device.supportsExposureLocking,
    supportsWhiteBalanceLocking: device.supportsWhiteBalanceLocking,
    supportsRawCapture,
    hasTorch: device.hasTorch,
    hasFlash: device.hasFlash,
    // Exposure ranges live on the controller (per active format); fall back to 0.
    minISO: controller?.minISO ?? 0,
    maxISO: controller?.maxISO ?? 0,
    minExposureDuration: controller?.minExposureDuration ?? 0,
    maxExposureDuration: controller?.maxExposureDuration ?? 0,
    maxWhiteBalanceGain: device.maxWhiteBalanceGain,
  };
}

/**
 * Heuristic for whether a device can capture RAW/DNG.
 *
 * VisionCamera v5 negotiates the container format at capture time and throws if
 * `'dng'` is unsupported, so this is only used to decide whether to *offer* the
 * DNG option in the UI. We require the device to support manual exposure
 * locking (a strong proxy for a full pro-camera pipeline / Bayer sensor access)
 * and to expose at least one photo resolution.
 */
export function deviceSupportsRaw(device: CameraDevice): boolean {
  try {
    const photoResolutions = device.getSupportedResolutions('photo');
    return photoResolutions.length > 0 && device.supportsExposureLocking;
  } catch {
    return false;
  }
}

/** Read the live 3A snapshot from the controller (legacy `updateCurrentValues`). */
export function readSnapshot(
  controller: CameraController | undefined,
): Partial<CalibrationSnapshot> {
  if (controller == null) return {};
  return {
    lensPosition: controller.lensPosition,
    iso: controller.iso,
    exposureDuration: controller.exposureDuration,
    whiteBalanceGains: controller.whiteBalanceGains,
  };
}

/** Clamp white-balance gains to the device's supported range (>= 1, <= max). */
export function clampWhiteBalanceGains(
  gains: WhiteBalanceGains,
  maxGain: number,
): WhiteBalanceGains {
  const cap = (v: number) => Math.max(1.0, Math.min(v, maxGain > 0 ? maxGain : v));
  return {
    redGain: cap(gains.redGain),
    greenGain: cap(gains.greenGain),
    blueGain: cap(gains.blueGain),
  };
}

/**
 * Resolve the white-balance gains to lock for a given Kelvin temperature.
 *
 * Prefers the controller's native `convertWhiteBalanceTemperatureAndTintValues`
 * (iOS, accurate) and falls back to the ported pure approximation
 * ({@link gainsForTemperature}) on platforms/devices without it. Result is
 * clamped to the device max.
 */
export function whiteBalanceGainsForTemperature(
  controller: CameraController,
  temperature: number,
  maxGain: number,
): WhiteBalanceGains {
  let gains: WhiteBalanceGains;
  try {
    gains = controller.convertWhiteBalanceTemperatureAndTintValues({
      temperature,
      tint: 0,
    });
  } catch {
    gains = gainsForTemperature(temperature);
  }
  return clampWhiteBalanceGains(gains, maxGain);
}
