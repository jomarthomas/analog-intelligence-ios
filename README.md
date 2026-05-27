# Analog Intelligence

Cross-platform (iOS + Android) **film-negative scanner**, built with React Native +
Expo. Photograph a film negative on a light source; the app converts it to a
positive, removes the orange mask, applies tone/color correction and live
adjustments, stores the result locally, and exports it. Free tier has ads + a
watermark; **Pro** unlocks full-resolution export, AI processing, and Insights.

> Ported from the original native iOS (SwiftUI) app, which is preserved under
> [`legacy-ios/`](./legacy-ios) as the reference for the image-processing
> algorithms and UX.

## Status

| Area | State |
|---|---|
| MVP — capture → adjust → gallery → export | ✅ |
| Negative→positive engine (orange-mask, tone, sharpen) | ✅ native module (Swift + Kotlin) |
| Manual camera controls + calibration lock | ✅ |
| Live adjust preview (fast path) + AI toggles (Pro) | ✅ |
| Monetization (RevenueCat IAP, AdMob, watermark, res limit) | ✅ |
| Insights (RGB/luma histogram, roll metrics) | ✅ |
| Auto frame-detection, live histogram, dock control UI | ✅ wired |
| Phase 2 — on-device AI (color reconstruction, dust removal) | 🧪 scaffold (placeholder models) |
| Phase 3 — BLE dock auto-roll-scan | 🧪 interfaces + simulation |
| Focus peaking, file-level watermark/contact-sheet (Skia) | ⏳ documented follow-ups (need device build) |

## Stack

Expo SDK 56 · React Native 0.85 · React 19 · expo-router (New Architecture) ·
TypeScript (strict) · react-native-vision-camera v5 · @shopify/react-native-skia ·
expo-sqlite + expo-file-system + react-native-mmkv · zustand ·
react-native-purchases (RevenueCat) · react-native-google-mobile-ads · react-native-svg.

The negative→positive engine is a **local Expo module** at
[`modules/ai-image-processing`](./modules/ai-image-processing) (Core Image on iOS,
Bitmap/pixel ops on Android). The Phase-3 dock is
[`modules/dock-ble`](./modules/dock-ble).

## Quick start

```bash
npm install
```

**iOS** (requires a Mac with Xcode + these tools):

```bash
brew install cocoapods watchman      # one-time, required for iOS native builds
npx expo prebuild                    # generates ios/ (+ android/) and installs pods
npm run ios                          # build + run on a simulator/device
```

**Android** (JDK 17+ and the Android SDK):

```bash
npx expo prebuild
npm run android
```

**Type-check** (the primary CI gate):

```bash
npm run typecheck
```

> This app uses native modules (vision-camera, skia, the local processing module),
> so it runs in a **custom dev client**, not Expo Go. `npx expo prebuild` generates
> the native projects; `ios/` and `android/` are git-ignored and regenerated.

## Configuration

RevenueCat and AdMob IDs are read from `app.json` → `expo.extra` via `expo-constants`.
The committed values are **placeholders / Google test IDs** — replace them with real
keys (ideally via a git-ignored `.env` feeding the Expo config) before a store build.
See [`docs/DECISIONS.md`](./docs/DECISIONS.md).

## Project structure

```
src/
  app/            expo-router routes (tabs: scan / gallery / insights / settings; adjust + gallery detail)
  camera/         VisionCamera capture, manual controls, calibration
  processing/     pipeline orchestration + native bridge + types
  storage/        SQLite + filesystem repositories, models, MMKV prefs
  monetization/   RevenueCat, AdMob, Pro gating, watermark
  insights/       histogram + roll metrics + charts
  ai/             Phase-2 on-device AI scaffold
  features/       feature UI (scan / adjust / gallery / settings)
  state/          zustand stores
  theme/          design system (dark film/darkroom aesthetic)
modules/
  ai-image-processing/   negative→positive engine (Swift + Kotlin)
  dock-ble/              Phase-3 BLE dock interfaces + simulation
docs/             VISION · SCOPE · ARCHITECTURE · MIGRATION · NATIVE_MODULE_API · ROADMAP · DECISIONS
legacy-ios/       original SwiftUI app (reference)
```

## Documentation

Start with [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) and
[`docs/ROADMAP.md`](./docs/ROADMAP.md). Engineering conventions and the agent
directory-ownership contract are in [`AGENTS.md`](./AGENTS.md); cross-cutting
decisions in [`docs/DECISIONS.md`](./docs/DECISIONS.md).

## License

See [`LICENSE`](./LICENSE).
