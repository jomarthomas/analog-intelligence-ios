# Analog Intelligence — Swift to React Native Migration Map

This document is the authoritative reference for what is being ported, how, and where each piece lands in the new codebase. It is primarily for the Native, Pipeline, Camera, and Storage agents.

---

## Guiding Principle: Port Behavior, Not Swift Idioms

The algorithms in `legacy-ios/` are the source of truth. The mathematical steps (orange-mask estimation, histogram-based auto-tone, per-channel colour correction) are reused verbatim in the native module's Swift (iOS) and Kotlin (Android) files. What is **not** carried over: SwiftUI views, Combine publishers, `@Published` / `@ObservedObject` patterns, or AVFoundation session management — all of these have idiomatic React Native equivalents.

---

## File-Level Migration Table

### Camera System

| Legacy File | Lines | Status | RN Home | Notes |
|---|---|---|---|---|
| `Camera/CameraManager.swift` | 614 | Reimplemented | `src/camera/useCameraSetup.ts` + native module | react-native-vision-camera owns session management; useCameraSetup wraps VisionCamera hooks |
| `Camera/CalibrationManager.swift` | 321 | Reimplemented | `src/camera/CalibrationService.ts` + native module `calibrate*` methods | Camera2 API (Android) replaces AVCaptureDevice; manual control API ported to native module |
| `Camera/CaptureMode.swift` | 161 | Reimplemented | `src/camera/types.ts` → `CaptureMode` enum | HEIC/JPEG/RAW enum; RAW availability checked via VisionCamera `supportsRawCapture` |
| `Camera/CameraPreviewView.swift` | 89 | Replaced | VisionCamera `<Camera>` component + Skia overlay | No UIKit `CALayer` wrapper needed |
| `Camera/CameraView.swift` | 264 | Reimplemented | `src/app/(tabs)/index.tsx` + `src/camera/` hooks | SwiftUI view → expo-router screen |
| `Camera/FocusPeakingProcessor.swift` | — | Reimplemented | `src/camera/useFrameProcessors.ts` (worklet) | Runs in VisionCamera worklet context; edge detection logic ported to JS/native module |

### Processing Pipeline

| Legacy File | Lines | Status | RN Home | Notes |
|---|---|---|---|---|
| `Processing/Pipeline/ImageProcessor.swift` | 306 | **Core Image algorithms reused** | `modules/ai-image-processing/ios/AiImageProcessingModule.swift` | Swift file imports Core Image directly; 8-step orchestration moved to TS pipeline |
| `Processing/Pipeline/NegativeInverter.swift` | 231 | **Algorithm reused** | `modules/ai-image-processing/ios/` (step: `invert`) | `CIColorInvert`, `CIColorMatrix` filter calls copied; Accelerate path preserved |
| `Processing/Pipeline/OrangeMaskEstimator.swift` | 376 | **Algorithm reused** | `modules/ai-image-processing/ios/` (step: `removeOrangeMask`) | Dark-region sampling + `CIColorMatrix` removal; entire algorithm reused |
| `Processing/Pipeline/ColorCorrector.swift` | 489 | **Algorithm reused** | `modules/ai-image-processing/ios/` (steps: `normalize`, `autoTone`) | `CIAreaAverage`, `CIAreaHistogram`, histogram CDF logic reused |
| `Processing/Pipeline/UserAdjustments.swift` | 462 | **Algorithm reused** | `modules/ai-image-processing/ios/` (step: `adjust`) | All 6 Core Image filters (Exposure, HighlightShadow, Contrast, Temperature, Saturation, Vibrance) reused |
| `Processing/Pipeline/ExportManager.swift` | 234 | Reimplemented (partially) | `modules/ai-image-processing/ios/` (step: `sharpenExport`) + `src/monetization/watermark.ts` | DNG export stub added; watermark moved to TS monetization layer |
| `Processing/Pipeline/WatermarkRenderer.swift` | 187 | Reimplemented | `src/monetization/watermark.ts` (expo-image-manipulator) | Moved to monetization layer; no native code needed |

### Processing Metrics

| Legacy File | Lines | Status | RN Home | Notes |
|---|---|---|---|---|
| `Processing/Metrics/HistogramAnalyzer.swift` | 185 | **Algorithm reused** | `modules/ai-image-processing/ios/` (function: `computeHistogram`) | `CIAreaHistogram` render-to-bitmap logic reused; result returned as typed JS object |
| `Processing/Metrics/ExposureMetrics.swift` | 230 | Reimplemented | `src/insights/rollMetrics.ts` | Pure TS calculations on histogram data returned from native module |
| `Processing/Metrics/RollInsight.swift` | 112 | Reimplemented | `src/insights/rollMetrics.ts` | Template-based insight strings moved to TS |

### Vision / Frame Detection

| Legacy File | Lines | Status | RN Home | Notes |
|---|---|---|---|---|
| `Vision/FrameDetector.swift` | — | Reimplemented | `modules/ai-image-processing/ios/` (function: `detectFilmFrame`) | Vision framework `VNDetectRectanglesRequest` ported; result returned as corner points |
| `Processing/Vision/FrameDetector.swift` | — | Same as above | Same as above | Duplicate path in legacy; single implementation in RN |

### Storage

| Legacy File | Lines | Status | RN Home | Notes |
|---|---|---|---|---|
| `Storage/StorageManager.swift` | 412 | Reimplemented | `src/storage/imageRepository.ts` + `src/storage/fileStore.ts` | Files replaced by expo-file-system; SQLite replaces JSON metadata files |
| `Storage/ScannedImage.swift` | 198 | Reimplemented | `src/storage/models.ts` (`ScannedImage` interface) | SHARED CONTRACT — Swift struct → TS interface |
| `Storage/ScanSession.swift` | 147 | Reimplemented | `src/storage/models.ts` (`ScanSession` interface) | SHARED CONTRACT |
| `Storage/PreferencesManager.swift` | 167 | Reimplemented | `src/storage/prefsStore.ts` (react-native-mmkv) | UserDefaults → MMKV |
| `Storage/UserPreferences.swift` | 89 | Reimplemented | `src/storage/models.ts` (`UserPreferences` interface) | SHARED CONTRACT |
| `Storage/ImageRepository.swift` | — | Reimplemented | `src/storage/imageRepository.ts` | Pattern preserved; SQLite backend replaces file-based JSON index |
| `Storage/FileSystemHelper.swift` | — | Reimplemented | `src/storage/fileStore.ts` | expo-file-system API replaces FileManager |

### UI Layer

| Legacy Area | Status | RN Home | Notes |
|---|---|---|---|
| `UI/Scan/ScanView.swift` | Reimplemented | `src/app/(tabs)/index.tsx` | expo-router screen; VisionCamera preview + Skia overlays |
| `UI/Scan/FrameAlignmentOverlay.swift` | Reimplemented | `src/components/FrameAlignmentOverlay.tsx` (Skia) | Canvas-based frame guides |
| `UI/Scan/Adjust/AdjustView.swift` | Reimplemented | `src/app/adjust/[id].tsx` | Route receives image id; sliders wired to `useProcessingStore` |
| `UI/Scan/Adjust/ExposureSlider.swift` | Reimplemented | `src/components/ui/` slider primitives | Reusable TS component; orange tint from theme |
| `UI/Scan/Adjust/WarmthSlider.swift` | Reimplemented | Same as above | |
| `UI/Scan/Adjust/ContrastSlider.swift` | Reimplemented | Same as above | |
| `UI/Scan/Adjust/AIOptionsPanel.swift` | Reimplemented | Milestone 3 | Stub component in `src/components/` until AI ships |
| `UI/Scan/ManualControlsPanel.swift` | Reimplemented | `src/components/ManualControlsPanel.tsx` | Milestone 2; collapsible panel |
| `UI/Gallery/GalleryView.swift` | Reimplemented | `src/app/(tabs)/gallery.tsx` | `FlatList` / `FlashList` grid |
| `UI/Gallery/GalleryGridItem.swift` | Reimplemented | `src/components/GalleryGridItem.tsx` | expo-image for thumbnail |
| `UI/Gallery/ImageDetailView.swift` | Reimplemented | Modal or sub-route from gallery | Fullscreen preview |
| `UI/Gallery/ContactSheetGenerator.swift` | Deferred | — | Post-MVP |
| `UI/Gallery/MultiSelectToolbar.swift` | Reimplemented | `src/components/MultiSelectToolbar.tsx` | |
| `UI/Insights/InsightsView.swift` | Reimplemented | `src/app/(tabs)/insights.tsx` | Pro-gated; Skia histogram chart |
| `UI/Common/DesignSystem.swift` | Reimplemented | `src/theme/` + `src/components/ui/` | Orange colour tokens, typography scale |
| `UI/Common/SharedViews.swift` | Reimplemented | `src/components/` | TS components |

### Monetization / Purchases

| Legacy File | Status | RN Home | Notes |
|---|---|---|---|
| `Purchases/StoreKitManager.swift` | Replaced | `src/monetization/purchaseService.ts` | RevenueCat wraps StoreKit on iOS and Play Billing on Android |
| `Purchases/PurchaseState.swift` | Replaced | `src/state/useProStore.ts` | Zustand store |
| `Purchases/AdMobManager.swift` | Replaced | `src/monetization/adService.ts` | react-native-google-mobile-ads |
| `Purchases/BannerAdView.swift` | Replaced | `src/components/BannerAd.tsx` | Wraps `BannerAd` from react-native-google-mobile-ads |
| `Purchases/ProUnlockView.swift` | Reimplemented | `src/components/ProUnlockView.tsx` | |
| `Purchases/ProFeatureGate.swift` | Reimplemented | `src/monetization/proGate.ts` | `useProStatus` hook + HOC |
| `Purchases/WatermarkRenderer.swift` | Replaced | `src/monetization/watermark.ts` | expo-image-manipulator |
| `Purchases/ResolutionLimiter.swift` | Replaced | Logic in `src/monetization/proGate.ts` | Quality parameter passed to native export step |
| `Purchases/ProductIdentifiers.swift` | Replaced | RevenueCat product IDs in `src/monetization/purchaseService.ts` | |

### App Lifecycle / State Machine

| Legacy File | Status | RN Home | Notes |
|---|---|---|---|
| `App/ScanWorkflowManager.swift` | Reimplemented | `src/state/useCameraStore.ts` + camera hook | Batch scan state machine ported to zustand |
| `App/ScanStateMachine.swift` | Reimplemented | `src/state/useCameraStore.ts` | States: idle→calibrating→ready→capturing→processing→reviewing→exporting |
| `App/ScanState.swift` + `ScanEvent.swift` | Reimplemented | `src/state/useCameraStore.ts` | Enums become TS literal union types |
| `AnalogIntelligenceApp.swift` | Replaced | `src/app/_layout.tsx` | Root layout handles app initialisation |

### Hardware (Future)

| Legacy File | Status | RN Home | Notes |
|---|---|---|---|
| `Hardware/DockManager.swift` | Future (Milestone 4) | `src/camera/DockService.ts` + native BLE module | Phase 3 only |

---

## What Is Reused: Core Image Algorithms

The following algorithms from `legacy-ios/Processing/` are lifted verbatim (or near-verbatim) into the iOS side of `modules/ai-image-processing/`. The math does not change; only the Swift class wrappers and Combine plumbing are stripped.

1. **Orange mask dark-region sampling** (`OrangeMaskEstimator.swift`): downscale to 10%, sample up to 100 dark pixels (luminance < 20%), compute average colour, derive compensation gains, apply via `CIColorMatrix`. The `OrangeMaskColor` struct constants (Kodak defaults: `redDensity 1.0, greenDensity 0.65, blueDensity 0.4`) are preserved.

2. **Histogram-based auto-tone** (`ColorCorrector.swift`): `CIAreaHistogram` → render to Float array → CDF → find 1%/99% percentile points → apply `CIExposureAdjust` + `CIColorControls` + `CIGammaAdjust`.

3. **Gray-world colour normalization** (`ColorCorrector.swift`): `CIAreaAverage` → single-pixel render → per-channel gain calculation → apply via `CIColorMatrix`.

4. **Per-channel user adjustments** (`UserAdjustments.swift`): the 6-filter chain (`CIExposureAdjust`, `CIHighlightShadowAdjust`, `CIColorControls` ×2, `CITemperatureAndTint`, `CIVibrance`) and warmth-to-Kelvin mapping (neutral 6500 K, warm 4500 K, cool 8500 K) are reused.

5. **Accelerate SIMD paths** (`NegativeInverter.swift`, `OrangeMaskEstimator.swift`): `vImageMatrixMultiply_ARGB8888` and related vImage functions remain on the iOS path. The Kotlin path does not have an equivalent and uses `ColorMatrix` / `RenderEffect` instead.

---

## What Is Reimplemented

| Area | Reason |
|---|---|
| Camera session management | AVFoundation → react-native-vision-camera (VisionCamera abstracts AVCaptureSession on iOS and Camera2 on Android) |
| UI layer (all SwiftUI views) | SwiftUI has no cross-platform equivalent; reimplemented in React Native / TypeScript |
| Combine reactive plumbing | Replaced by zustand stores + React hooks |
| StoreKit manager | RevenueCat (react-native-purchases) handles both StoreKit and Play Billing from one TS API |
| AdMob UIKit wrappers | react-native-google-mobile-ads ships its own RN component |
| File-based JSON metadata index | expo-sqlite relational store is more robust for gallery queries |
| WatermarkRenderer (Core Image) | expo-image-manipulator + Skia canvas handles watermarking without a native Swift call |

---

## Migration Risks

| Risk | Severity | Mitigation |
|---|---|---|
| VisionCamera frame processor throughput differs from AVFoundation VideoDataOutput | Medium | Benchmark focus peaking at 30 FPS on target devices; fall back to software edge detection if needed |
| Android Camera2 manual controls API is device-fragmented | High | Gate RAW capture and manual controls on Camera2 feature availability check at runtime; show informative UI on unsupported devices |
| Core Image GPU performance on iOS vs. Android GPU Image equivalent | High | The iOS path reuses Core Image directly; the Android path must be benchmarked and may need to limit pipeline resolution on low-end hardware |
| Accelerate framework SIMD has no Android equivalent | Medium | Kotlin path uses `ColorMatrix` — slower but correct; profile and optimise if > 1 s on mid-range Android |
| expo-sqlite query performance with large galleries (100+ rolls) | Low | Add indexes on `scanDate` and `sessionId`; paginate gallery queries |
| RevenueCat entitlement sync latency on first launch | Low | Cache last-known Pro status in MMKV; restore from cache while remote check is in flight |
| DNG export file size (12 MP DNG ~15–20 MB) | Low | Document expected size in UI; do not apply lossy compression to the raw bytes passthrough |
| react-native-mmkv New Architecture compatibility | Low | Confirmed New Architecture support in the chosen version; re-verify after any `expo install` update |
