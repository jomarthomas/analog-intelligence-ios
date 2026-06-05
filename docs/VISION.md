# Analog Intelligence — Product Vision

## What the App Does

Analog Intelligence is a **film-negative scanner** that lives in a smartphone. The user holds their iPhone or Android device over a film negative on a light source; the app converts the negative to a positive image, removes the orange dye-mask inherent to color film, applies automatic and manual tone corrections, stores the result locally, and lets the user export to their camera roll or share to any target.

The value is direct: a dedicated film-scanner costs $200–$2,000 and ties the user to a desk. Analog Intelligence turns a device already in the photographer's pocket into a portable, capable scanner with no extra hardware required for software-only scanning.

---

## Target User

**Primary persona: the analog film photographer.**

- Shoots 35mm, 120 medium-format, or 4x5 large-format film on a regular basis
- Already owns a light source (backlit tablet, dedicated LED panel, or window)
- Wants to share scans quickly — on social media, in print, or for editing in Lightroom / Capture One
- Values image quality but also values speed over the flatbed-scanner workflow
- May range from weekend hobbyist to working photographer who uses film for personal projects

**Secondary persona: the casual experimenter.**

- Recently picked up a film camera out of nostalgia or aesthetic interest
- Needs a low-barrier way to see their negatives as positives without buying additional gear

The monetization model acknowledges both personas: free tier (ads + watermark + limited resolution) for casual use; Pro ($9.99 one-time) for full resolution, DNG export, AI processing, and Insights analytics.

---

## Value Proposition

| Job To Be Done | How Analog Intelligence Solves It |
|---|---|
| See my negatives as positives within seconds of pulling them from the developer | Capture → instant pipeline (< 1 second preview) → gallery |
| Correct the orange mask without buying a dedicated scanner | Automatic dark-region-sampling algorithm removes the C-41 dye base |
| Get a shareable image without opening a desktop app | Full pipeline on-device, export directly to Photos / share sheet |
| Maintain consistent exposure across a full roll | Calibration lock freezes focus, ISO, shutter, and white balance for the entire roll |
| Deliver professional-grade scans for client work | Pro: full resolution, DNG/RAW export, AI dust removal, no watermark |
| Understand how a roll was exposed | Insights tab: per-roll histogram, shadow/highlight clipping percentages |

---

## Why Cross-Platform React Native + Expo

### The original iOS app

The legacy codebase (preserved under `legacy-ios/`) is a mature, production-quality Swift/SwiftUI application. Its image-processing algorithms — orange-mask estimation via dark-region sampling, histogram-based auto-tone, per-channel color correction, Accelerate-framework SIMD optimizations — are the technical foundation of the product and are directly reused in the React Native port through a hybrid native module (`modules/ai-image-processing`).

### Why port at all

1. **Android market access.** A meaningful fraction of analog photographers use Android. Staying iOS-only permanently leaves that audience unreachable.
2. **Single codebase.** Expo SDK 56 with the New Architecture enables one TypeScript codebase to drive both platforms, sharing all business logic, UI, and state management.
3. **Faster product iteration.** React Native's JS/TS layer lets the Camera, Pipeline, Shell, Storage, and Monetization agents iterate independently without rebuilding the entire Xcode project.
4. **Future web/desktop.** expo-router's file-based routing and React Native Web create a path to a browser companion without a second rewrite.

### Why Expo SDK 56 specifically

- **New Architecture on by default** — Fabric renderer and the JSI bridge eliminate the old asynchronous bridge bottleneck, which matters for the real-time camera preview path.
- **expo-router** — file-based, type-safe routing that mirrors the tab structure (`scan / gallery / insights / settings`) from the SwiftUI app with minimal ceremony.
- **Local Expo Modules** — `modules/ai-image-processing` is a first-class Expo module with Swift (iOS) and Kotlin (Android) implementations. This lets the heavy Core Image / GPU processing algorithms run natively per platform while the TypeScript pipeline orchestrates them through a shared typed interface.
- **Managed dependency alignment** — `npx expo install` pins all native packages to SDK-correct versions, reducing CocoaPods/Gradle version drift.

### Trade-offs acknowledged

- iOS builds still require CocoaPods + watchman on a Mac (`brew install cocoapods watchman`). The build sandbox runs `npm run typecheck` as its automated gate; device builds are finished locally.
- The camera preview and frame-processor path (react-native-vision-camera worklets) has slightly more overhead than a raw AVFoundation CALayer. This is acceptable given the performance headroom on modern iPhones and Androids.
- GPU image rendering via @shopify/react-native-skia is not identical to Core Image filter chains; the native module bridges the gap for the computationally intensive steps.

---

## The Analog Intelligence Brand Promise

> *Scan with your phone. Develop with intelligence.*

The app is warm in tone (the orange of the darkroom safelight runs through the design system), precise in function, and honest about what it is: a tool that respects the craft of film photography and meets the photographer where they are.
