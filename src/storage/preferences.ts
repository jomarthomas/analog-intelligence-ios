/**
 * src/storage/preferences.ts
 *
 * react-native-mmkv-backed user preferences.
 *
 * Mirrors the full legacy UserPreferences.swift shape using the SDK 56
 * react-native-mmkv v4 API (createMMKV / MMKV interface via Nitro).
 *
 * Design choices:
 *   • One MMKV instance with id 'analog.prefs'.
 *   • Each preference is stored under its own key for granular reads/writes
 *     (avoids deserialising the whole object on every access).
 *   • A `get()` helper assembles the full UserPreferences snapshot.
 *   • Typed `set(key, value)` helpers guard against type mismatches.
 *   • Onboarding / one-time flags are string-keyed booleans.
 *
 * Consumers can subscribe to value changes via MMKV's addOnValueChangedListener
 * or via the zustand store (which reacts to preference mutations).
 */

import { createMMKV } from 'react-native-mmkv';
import type { AppTheme, ExportFormat, FilmType, GallerySortOrder, WatermarkPosition } from './models';

// ---------------------------------------------------------------------------
// MMKV instance
// ---------------------------------------------------------------------------

const storage = createMMKV({ id: 'analog.prefs' });

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

const K = {
  // Camera
  defaultCaptureFormat: 'camera.defaultCaptureFormat',
  enableRawCapture: 'camera.enableRawCapture',
  autoLockCalibration: 'camera.autoLockCalibration',
  showGridOverlay: 'camera.showGridOverlay',
  showHistogram: 'camera.showHistogram',

  // Processing defaults
  defaultExposure: 'processing.defaultExposure',
  defaultWarmth: 'processing.defaultWarmth',
  defaultContrast: 'processing.defaultContrast',
  autoApplyOrangeMaskCorrection: 'processing.autoApplyOrangeMaskCorrection',
  defaultSharpenAmount: 'processing.defaultSharpenAmount',
  defaultFilmType: 'processing.defaultFilmType',

  // Gallery
  galleryGridColumns: 'gallery.gridColumns',
  sortOrder: 'gallery.sortOrder',
  groupBySession: 'gallery.groupBySession',
  showMetadataInGallery: 'gallery.showMetadata',

  // Export
  defaultExportFormat: 'export.defaultFormat',
  saveToPhotosAfterProcessing: 'export.saveToPhotosAfterProcessing',
  includeMetadataInExports: 'export.includeMetadata',
  watermarkPosition: 'export.watermarkPosition',
  jpegQuality: 'export.jpegQuality',

  // Pro
  isPro: 'monetization.isPro',
  proUnlockDate: 'monetization.proUnlockDate',

  // AI (Pro)
  enableAIColorReconstruction: 'ai.colorReconstruction',
  enableAIDustRemoval: 'ai.dustRemoval',

  // UI
  theme: 'ui.theme',
  hapticFeedback: 'ui.hapticFeedback',
  soundEffects: 'ui.soundEffects',

  // Privacy
  analyticsEnabled: 'privacy.analytics',
  crashReportingEnabled: 'privacy.crashReporting',

  // Onboarding flags
  onboardingCompleted: 'onboarding.completed',
  cameraPermissionRequested: 'onboarding.cameraPermissionRequested',
  photosPermissionRequested: 'onboarding.photosPermissionRequested',
} as const;

// ---------------------------------------------------------------------------
// UserPreferences snapshot type
// ---------------------------------------------------------------------------

export interface UserPreferences {
  // Camera
  defaultCaptureFormat: 'heic' | 'jpeg' | 'raw';
  enableRawCapture: boolean;
  autoLockCalibration: boolean;
  showGridOverlay: boolean;
  showHistogram: boolean;

  // Processing defaults (mirror legacy defaults)
  defaultExposure: number;
  defaultWarmth: number;
  defaultContrast: number;
  autoApplyOrangeMaskCorrection: boolean;
  defaultSharpenAmount: number;
  /** Film type used as the default for new sessions. */
  defaultFilmType: FilmType;

  // Gallery
  galleryGridColumns: number;
  sortOrder: GallerySortOrder;
  groupBySession: boolean;
  showMetadataInGallery: boolean;

  // Export
  defaultExportFormat: ExportFormat;
  saveToPhotosAfterProcessing: boolean;
  includeMetadataInExports: boolean;
  watermarkPosition: WatermarkPosition;
  /** JPEG compression quality 0.0–1.0. */
  jpegQuality: number;

  // Pro
  isPro: boolean;
  proUnlockDate?: string; // ISO-8601

  // AI (Pro)
  enableAIColorReconstruction: boolean;
  enableAIDustRemoval: boolean;

  // UI
  theme: AppTheme;
  hapticFeedback: boolean;
  soundEffects: boolean;

  // Privacy
  analyticsEnabled: boolean;
  crashReportingEnabled: boolean;

  // Onboarding
  onboardingCompleted: boolean;
  cameraPermissionRequested: boolean;
  photosPermissionRequested: boolean;
}

// ---------------------------------------------------------------------------
// Defaults (faithful port of legacy UserPreferences.init() defaults)
// ---------------------------------------------------------------------------

const DEFAULTS: UserPreferences = {
  defaultCaptureFormat: 'heic',
  enableRawCapture: false,
  autoLockCalibration: true,
  showGridOverlay: true,
  showHistogram: false,

  defaultExposure: 0,
  defaultWarmth: 0,
  defaultContrast: 0,
  autoApplyOrangeMaskCorrection: true,
  defaultSharpenAmount: 0.5,
  defaultFilmType: 'colorNegative',

  galleryGridColumns: 3,
  sortOrder: 'newestFirst',
  groupBySession: true,
  showMetadataInGallery: false,

  defaultExportFormat: 'jpeg',
  saveToPhotosAfterProcessing: false,
  includeMetadataInExports: true,
  watermarkPosition: 'bottomRight',
  jpegQuality: 0.95,

  isPro: false,
  proUnlockDate: undefined,

  enableAIColorReconstruction: false,
  enableAIDustRemoval: false,

  theme: 'system',
  hapticFeedback: true,
  soundEffects: true,

  analyticsEnabled: true,
  crashReportingEnabled: true,

  onboardingCompleted: false,
  cameraPermissionRequested: false,
  photosPermissionRequested: false,
};

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

function getBool(key: string, defaultValue: boolean): boolean {
  return storage.getBoolean(key) ?? defaultValue;
}

function getStr<T extends string>(key: string, defaultValue: T): T {
  return (storage.getString(key) as T | undefined) ?? defaultValue;
}

function getNum(key: string, defaultValue: number): number {
  return storage.getNumber(key) ?? defaultValue;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read the full UserPreferences snapshot.
 * Fields that have never been set return their DEFAULTS value.
 */
export function getPreferences(): UserPreferences {
  return {
    defaultCaptureFormat: getStr(K.defaultCaptureFormat, DEFAULTS.defaultCaptureFormat),
    enableRawCapture: getBool(K.enableRawCapture, DEFAULTS.enableRawCapture),
    autoLockCalibration: getBool(K.autoLockCalibration, DEFAULTS.autoLockCalibration),
    showGridOverlay: getBool(K.showGridOverlay, DEFAULTS.showGridOverlay),
    showHistogram: getBool(K.showHistogram, DEFAULTS.showHistogram),

    defaultExposure: getNum(K.defaultExposure, DEFAULTS.defaultExposure),
    defaultWarmth: getNum(K.defaultWarmth, DEFAULTS.defaultWarmth),
    defaultContrast: getNum(K.defaultContrast, DEFAULTS.defaultContrast),
    autoApplyOrangeMaskCorrection: getBool(
      K.autoApplyOrangeMaskCorrection,
      DEFAULTS.autoApplyOrangeMaskCorrection,
    ),
    defaultSharpenAmount: getNum(K.defaultSharpenAmount, DEFAULTS.defaultSharpenAmount),
    defaultFilmType: getStr(K.defaultFilmType, DEFAULTS.defaultFilmType),

    galleryGridColumns: getNum(K.galleryGridColumns, DEFAULTS.galleryGridColumns),
    sortOrder: getStr(K.sortOrder, DEFAULTS.sortOrder),
    groupBySession: getBool(K.groupBySession, DEFAULTS.groupBySession),
    showMetadataInGallery: getBool(K.showMetadataInGallery, DEFAULTS.showMetadataInGallery),

    defaultExportFormat: getStr(K.defaultExportFormat, DEFAULTS.defaultExportFormat),
    saveToPhotosAfterProcessing: getBool(
      K.saveToPhotosAfterProcessing,
      DEFAULTS.saveToPhotosAfterProcessing,
    ),
    includeMetadataInExports: getBool(K.includeMetadataInExports, DEFAULTS.includeMetadataInExports),
    watermarkPosition: getStr(K.watermarkPosition, DEFAULTS.watermarkPosition),
    jpegQuality: getNum(K.jpegQuality, DEFAULTS.jpegQuality),

    isPro: getBool(K.isPro, DEFAULTS.isPro),
    proUnlockDate: storage.getString(K.proUnlockDate),

    enableAIColorReconstruction: getBool(
      K.enableAIColorReconstruction,
      DEFAULTS.enableAIColorReconstruction,
    ),
    enableAIDustRemoval: getBool(K.enableAIDustRemoval, DEFAULTS.enableAIDustRemoval),

    theme: getStr(K.theme, DEFAULTS.theme),
    hapticFeedback: getBool(K.hapticFeedback, DEFAULTS.hapticFeedback),
    soundEffects: getBool(K.soundEffects, DEFAULTS.soundEffects),

    analyticsEnabled: getBool(K.analyticsEnabled, DEFAULTS.analyticsEnabled),
    crashReportingEnabled: getBool(K.crashReportingEnabled, DEFAULTS.crashReportingEnabled),

    onboardingCompleted: getBool(K.onboardingCompleted, DEFAULTS.onboardingCompleted),
    cameraPermissionRequested: getBool(
      K.cameraPermissionRequested,
      DEFAULTS.cameraPermissionRequested,
    ),
    photosPermissionRequested: getBool(
      K.photosPermissionRequested,
      DEFAULTS.photosPermissionRequested,
    ),
  };
}

/**
 * Set a single preference value.
 * Type-safe overloads per value kind.
 */
export function setPreference(key: 'defaultCaptureFormat', value: UserPreferences['defaultCaptureFormat']): void;
export function setPreference(key: 'enableRawCapture', value: boolean): void;
export function setPreference(key: 'autoLockCalibration', value: boolean): void;
export function setPreference(key: 'showGridOverlay', value: boolean): void;
export function setPreference(key: 'showHistogram', value: boolean): void;
export function setPreference(key: 'defaultExposure', value: number): void;
export function setPreference(key: 'defaultWarmth', value: number): void;
export function setPreference(key: 'defaultContrast', value: number): void;
export function setPreference(key: 'autoApplyOrangeMaskCorrection', value: boolean): void;
export function setPreference(key: 'defaultSharpenAmount', value: number): void;
export function setPreference(key: 'defaultFilmType', value: FilmType): void;
export function setPreference(key: 'galleryGridColumns', value: number): void;
export function setPreference(key: 'sortOrder', value: GallerySortOrder): void;
export function setPreference(key: 'groupBySession', value: boolean): void;
export function setPreference(key: 'showMetadataInGallery', value: boolean): void;
export function setPreference(key: 'defaultExportFormat', value: ExportFormat): void;
export function setPreference(key: 'saveToPhotosAfterProcessing', value: boolean): void;
export function setPreference(key: 'includeMetadataInExports', value: boolean): void;
export function setPreference(key: 'watermarkPosition', value: WatermarkPosition): void;
export function setPreference(key: 'jpegQuality', value: number): void;
export function setPreference(key: 'isPro', value: boolean): void;
export function setPreference(key: 'proUnlockDate', value: string | undefined): void;
export function setPreference(key: 'enableAIColorReconstruction', value: boolean): void;
export function setPreference(key: 'enableAIDustRemoval', value: boolean): void;
export function setPreference(key: 'theme', value: AppTheme): void;
export function setPreference(key: 'hapticFeedback', value: boolean): void;
export function setPreference(key: 'soundEffects', value: boolean): void;
export function setPreference(key: 'analyticsEnabled', value: boolean): void;
export function setPreference(key: 'crashReportingEnabled', value: boolean): void;
export function setPreference(key: 'onboardingCompleted', value: boolean): void;
export function setPreference(key: 'cameraPermissionRequested', value: boolean): void;
export function setPreference(key: 'photosPermissionRequested', value: boolean): void;
// Implementation
export function setPreference(key: keyof UserPreferences, value: boolean | number | string | undefined): void {
  const mmkvKey = K[key as keyof typeof K];
  if (mmkvKey === undefined) return;

  if (value === undefined) {
    storage.remove(mmkvKey);
  } else if (typeof value === 'boolean') {
    storage.set(mmkvKey, value);
  } else if (typeof value === 'number') {
    storage.set(mmkvKey, value);
  } else {
    storage.set(mmkvKey, value);
  }
}

/**
 * Persist the full UserPreferences snapshot at once.
 * Useful after unlocking Pro or resetting to defaults.
 */
export function setAllPreferences(prefs: UserPreferences): void {
  // Use the implementation signature of setPreference (which accepts the union
  // of all value types) so we can iterate generically without the per-key
  // overloads forcing a cast to `any`.
  const setAny = setPreference as (
    key: keyof UserPreferences,
    value: boolean | number | string | undefined,
  ) => void;
  (Object.keys(prefs) as (keyof UserPreferences)[]).forEach((key) => {
    setAny(key, prefs[key]);
  });
}

/**
 * Unlock Pro features — sets isPro + records the unlock date.
 * Preserves all other preferences.
 */
export function unlockPro(): void {
  storage.set(K.isPro, true);
  storage.set(K.proUnlockDate, new Date().toISOString());
}

/**
 * Revoke Pro (e.g. subscription lapsed).
 * Preserves all other preferences.
 */
export function revokePro(): void {
  storage.set(K.isPro, false);
}

/**
 * Reset all preferences to factory defaults.
 * Preserves Pro status and the Pro unlock date (matches legacy behaviour).
 */
export function resetPreferencesToDefaults(): void {
  const isProNow = getBool(K.isPro, false);
  const proUnlockDate = storage.getString(K.proUnlockDate);

  storage.clearAll();

  setAllPreferences(DEFAULTS);

  if (isProNow) {
    storage.set(K.isPro, true);
    if (proUnlockDate) storage.set(K.proUnlockDate, proUnlockDate);
  }
}

/**
 * Subscribe to any preference value change.
 * Returns an unsubscribe function.
 *
 * @example
 * const unsub = onPreferenceChanged((key) => {
 *   if (key === K.isPro) refreshProGating();
 * });
 * // cleanup: unsub();
 */
export function onPreferenceChanged(callback: (key: string) => void): () => void {
  const listener = storage.addOnValueChangedListener(callback);
  return () => listener.remove();
}

/**
 * Derived: whether watermark should be applied for the current user.
 */
export function shouldApplyWatermark(): boolean {
  return !getBool(K.isPro, false);
}

/**
 * Derived: whether ads should be shown.
 */
export function shouldShowAds(): boolean {
  return !getBool(K.isPro, false);
}

/**
 * Derived: whether the user can access Pro features.
 */
export function canAccessProFeatures(): boolean {
  return getBool(K.isPro, false);
}

// Expose the raw MMKV instance for consumers that need direct access
// (e.g. the monetization agent for RevenueCat callbacks).
export { storage as prefsStorage };
