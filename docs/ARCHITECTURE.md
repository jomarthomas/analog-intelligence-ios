# Analog Intelligence RN Port — Architecture

## Stack

| Concern | Package / Technology | Notes |
|---|---|---|
| Runtime | React Native 0.85.3, React 19.2.3, New Architecture ON | Fabric renderer + JSI bridge |
| Framework | Expo SDK 56 | Managed workflow, `npx expo prebuild` generates ios/ and android/ |
| Routing | expo-router 56.2.x (file-based, typed routes) | Entry: `src/app/` |
| Camera | react-native-vision-camera + worklets | Frame processors for focus peaking, live histogram |
| GPU preview / Skia | @shopify/react-native-skia | Overlay rendering (frame guides, histogram chart) |
| Native processing | Local Expo module: `modules/ai-image-processing` | Swift on iOS, Kotlin on Android |
| State | zustand | One store per domain slice in `src/state/` |
| Metadata storage | expo-sqlite | Relational; image records, sessions |
| File storage | expo-file-system | Processed images, DNG files |
| Preferences | react-native-mmkv | Fast synchronous key-value; Pro status cache, UI prefs |
| Monetization — IAP | react-native-purchases (RevenueCat) | Cross-platform StoreKit / Play Billing abstraction |
| Monetization — ads | react-native-google-mobile-ads (AdMob) | Banner ads on Scan + Gallery (free tier) |
| Export | expo-media-library, expo-sharing, expo-image-manipulator | Camera roll save, share sheet, thumbnail generation |
| Language | TypeScript strict; `tsconfig` alias `@/*` → `src/*`, `@/assets/*` → `assets/*` | |

---

## Expo SDK 56 New Architecture Details

React Native 0.85.3 ships with the New Architecture enabled by default. Key implications:

- **Fabric** is the rendering engine. Components are created synchronously on the UI thread via JSI rather than through the async bridge. This matters for the camera preview path.
- **Turbo Modules** replace legacy Native Modules for `modules/ai-image-processing`. The module exposes a typed JSI surface; calls are synchronous where needed (e.g., checking a histogram value in a frame processor worklet).
- **react-native-worklets** runs JavaScript (actually hermes bytecode) on the camera background thread for frame processors, enabling focus peaking and live histogram without blocking the UI thread.
- **expo-router** uses React Server Components conventions for type-safe navigation; routes are inferred from the file system under `src/app/`.

---

## Directory Map

```
analog-intelligence-ios/
├── src/
│   ├── app/                        # expo-router routes — owned by Shell agent
│   │   ├── (tabs)/
│   │   │   ├── index.tsx           # Scan tab
│   │   │   ├── gallery.tsx         # Gallery tab
│   │   │   ├── insights.tsx        # Insights tab (Pro-gated)
│   │   │   └── settings.tsx        # Settings tab
│   │   ├── adjust/
│   │   │   └── [id].tsx            # Adjust screen for a captured frame
│   │   └── _layout.tsx             # Root layout (ThemeProvider, tab config)
│   │
│   ├── components/                 # Shared presentational UI — owned by Shell
│   │   ├── ui/                     # Design-system primitives (button, slider, etc.)
│   │   ├── app-tabs.tsx            # Tab bar component
│   │   └── …
│   │
│   ├── theme/                      # Design tokens — owned by Shell
│   │   └── (currently src/constants/theme.ts; canonical path is src/theme/)
│   │
│   ├── camera/                     # VisionCamera setup and hooks — owned by Camera agent
│   │   ├── useCameraSetup.ts       # Session config, permissions
│   │   ├── useFrameProcessors.ts   # Focus peaking, live histogram worklets
│   │   ├── CalibrationService.ts   # Lock focus / ISO / WB
│   │   └── types.ts
│   │
│   ├── processing/                 # Pipeline orchestration — owned by Pipeline agent
│   │   ├── pipeline.ts             # Orchestrates native module calls in sequence
│   │   ├── types.ts                # SHARED CONTRACT — additive changes only
│   │   └── adjustments.ts          # User-adjustment parameter helpers
│   │
│   ├── storage/                    # Data layer — owned by Storage agent
│   │   ├── models.ts               # SHARED CONTRACT — additive changes only
│   │   ├── imageRepository.ts      # CRUD for ScannedImage records (SQLite)
│   │   ├── sessionRepository.ts    # CRUD for ScanSession records (SQLite)
│   │   ├── fileStore.ts            # expo-file-system wrappers
│   │   └── prefsStore.ts           # react-native-mmkv wrappers
│   │
│   ├── monetization/               # IAP + ads + gating — owned by Monetization agent
│   │   ├── purchaseService.ts      # RevenueCat wrapper
│   │   ├── adService.ts            # AdMob wrapper
│   │   ├── proGate.ts              # useProStatus hook + feature-gate HOC
│   │   └── watermark.ts            # Watermark compositing via expo-image-manipulator
│   │
│   ├── insights/                   # Histogram + roll metrics — owned by Insights agent
│   │   ├── histogramService.ts     # Calls native module computeHistogram
│   │   ├── rollMetrics.ts          # Per-roll shadow/highlight/exposure stats
│   │   └── types.ts
│   │
│   ├── state/                      # Zustand stores — shared, coordinate via orchestrator
│   │   ├── useCameraStore.ts       # Active capture session, calibration state
│   │   ├── useGalleryStore.ts      # Image list, selection state
│   │   ├── useProcessingStore.ts   # Pipeline progress, current result
│   │   └── useProStore.ts          # Pro status, purchase state
│   │
│   └── lib/                        # Pure utility functions — open to any agent
│       ├── colorMath.ts            # Linear RGB helpers
│       ├── formatters.ts           # Shutter speed strings, ISO display
│       └── uuid.ts
│
├── modules/
│   └── ai-image-processing/        # LOCAL EXPO MODULE — owned by Native agent
│       ├── index.ts                # SHARED CONTRACT — TypeScript surface (see NATIVE_MODULE_API.md)
│       ├── ios/
│       │   ├── AiImageProcessingModule.swift
│       │   └── … (pipeline step implementations)
│       └── android/
│           ├── AiImageProcessingModule.kt
│           └── … (pipeline step implementations)
│
├── docs/                           # This directory — owned by Docs agent
├── assets/                         # Images, fonts
├── legacy-ios/                     # Original Swift app — REFERENCE ONLY, do not modify
├── app.json                        # Expo config
├── package.json
├── tsconfig.json
└── AGENTS.md
```

---

## expo-router Structure

expo-router uses the file system under `src/app/` to derive routes.

```
src/app/
├── _layout.tsx                  # Root layout — wraps everything in ThemeProvider
│                                  Initialises RevenueCat, AdMob on mount
│
├── (tabs)/                      # Tab group — renders the bottom tab bar
│   ├── _layout.tsx              # Tab bar config (icons, labels, Pro gate on insights)
│   ├── index.tsx                # /          → Scan tab
│   ├── gallery.tsx              # /gallery   → Gallery tab
│   ├── insights.tsx             # /insights  → Insights tab (Pro-gated; shows upgrade if free)
│   └── settings.tsx             # /settings  → Settings tab
│
└── adjust/
    └── [id].tsx                 # /adjust/:id  → Adjust screen, receives scanned image id
```

The `id` parameter in `adjust/[id].tsx` is the UUID of the `ScannedImage` record in SQLite. The Adjust screen loads the image from expo-file-system, passes it to the native module for user-adjustment steps, and saves the result back on "Done".

---

## Hybrid Per-Platform Native Module

`modules/ai-image-processing` is a **local Expo module** (not published to npm). It is the home of all heavy image processing that cannot run efficiently in JavaScript.

### Why a local module, not a worklet

react-native-vision-camera worklets (via react-native-worklets) run in a background JS context on the camera thread. They are appropriate for lightweight per-frame analysis (focus peaking edge detection, histogram sampling). They are **not** appropriate for the 8-step negative inversion pipeline on a 12 MP still, which requires:

- Core Image GPU filter chains (iOS)
- Android GPU Image / Renderscript equivalent (Android)
- Accelerate framework SIMD operations (iOS)
- 300–600 ms of compute on high-end hardware

The native module runs these on a dedicated background queue (Swift `DispatchQueue`, Kotlin `Dispatchers.Default`) and returns results to JavaScript as a file URI pointing to the processed image in `expo-file-system`.

### iOS implementation strategy

The Swift side mirrors the legacy `Processing/Pipeline/` files:
- `NegativeInverter.swift` → invert step
- `OrangeMaskEstimator.swift` → orange-mask step
- `ColorCorrector.swift` → normalize + tone steps
- `UserAdjustments.swift` → adjustment step
- `SharpenExport.swift` → sharpen + export step
- `HistogramAnalyzer.swift` → histogram computation

These are adapted (not copied wholesale) from `legacy-ios/`; Swift idioms stay, Core Image filter names and Accelerate calls are reused directly.

### Android implementation strategy

Kotlin implementations use Android's `RenderEffect` (API 31+) and `BitmapFactory` / `ColorMatrix` for equivalent operations. Where Core Image has no direct equivalent, the algorithm is reimplemented in Kotlin using the same mathematical approach documented in `legacy-ios/docs/TECHNICAL_SPECIFICATION.md`.

---

## Data Flow: Capture → Process → Store → Export

```
┌──────────────────────────────────────────────────────────┐
│  CAPTURE                                                 │
│  react-native-vision-camera                              │
│  ├── Frame processors (worklets)                         │
│  │   ├── focus peaking overlay → Skia canvas            │
│  │   └── live histogram → useCameraStore                │
│  └── takePhoto() → { path, width, height, isRaw }       │
└────────────────────────┬─────────────────────────────────┘
                         │ photo URI
                         ▼
┌──────────────────────────────────────────────────────────┐
│  PROCESS  (src/processing/pipeline.ts)                   │
│  Calls native module in sequence:                        │
│  1. processStep('crop', uri, config)                    │
│  2. processStep('linearize', uri)                       │
│  3. processStep('invert', uri, { filmType })            │
│  4. processStep('removeOrangeMask', uri)                │
│  5. processStep('normalize', uri)                       │
│  6. processStep('autoTone', uri)                        │
│  7. processStep('adjust', uri, userParams)              │
│  8. processStep('sharpenExport', uri, { quality })      │
│                                                          │
│  Each step returns a new URI; progress events emitted   │
│  via NativeEventEmitter → useProcessingStore            │
└────────────────────────┬─────────────────────────────────┘
                         │ processed image URI
                         ▼
┌──────────────────────────────────────────────────────────┐
│  STORE  (src/storage/)                                   │
│  imageRepository.save({                                  │
│    id: uuid,                                             │
│    processedUri,  // expo-file-system path              │
│    rawUri?,       // DNG if captured                    │
│    metadata: { filmType, iso, shutterSpeed, … }         │
│  })                                                      │
│  → SQLite row + files on disk                           │
└────────────────────────┬─────────────────────────────────┘
                         │ ScannedImage record
                         ▼
┌──────────────────────────────────────────────────────────┐
│  DISPLAY                                                 │
│  Gallery (useGalleryStore) ← imageRepository.list()     │
│  Adjust screen ← imageRepository.get(id)                │
└────────────────────────┬─────────────────────────────────┘
                         │ user taps Export
                         ▼
┌──────────────────────────────────────────────────────────┐
│  EXPORT                                                  │
│  proGate.check()                                         │
│  if Pro: expo-media-library.saveToLibrary(processedUri) │
│  if Free: watermark.apply(processedUri) → save          │
│  expo-sharing.shareAsync(uri)  ← share sheet            │
└──────────────────────────────────────────────────────────┘
```

---

## State Management (Zustand)

All stores live in `src/state/`. Each is a separate `create<T>()` call; no single god-store.

| Store | Key State | Consumers |
|---|---|---|
| `useCameraStore` | activeDevice, calibration (focus/ISO/WB), liveHistogram, isCapturing | Scan tab, frame processors |
| `useProcessingStore` | currentJobId, progress (0–1), result URI, error | Adjust screen, processing pipeline |
| `useGalleryStore` | images[], selectedIds, sortOrder | Gallery tab |
| `useProStore` | isPro, isLoading, purchaseError | proGate, Monetization |

Stores do **not** call expo-sqlite directly; they call repository functions from `src/storage/`. The repository layer owns all database access.

---

## Monetization Architecture

### IAP (RevenueCat)

react-native-purchases wraps StoreKit (iOS) and Google Play Billing (Android) behind a single API. The `purchaseService.ts` module in `src/monetization/` is the only place that calls the RevenueCat SDK.

```
purchaseService.configure()   // called in _layout.tsx on app mount
purchaseService.getOfferings() // loads Pro product from RevenueCat dashboard
purchaseService.purchase(pkg)  // triggers native payment sheet
purchaseService.restorePurchases()
purchaseService.checkEntitlement('pro') → boolean
```

Pro status is cached in react-native-mmkv and reflected in `useProStore`.

### AdMob

Banner ads are rendered on the Scan tab (bottom) and Gallery tab (bottom) for free-tier users only. `adService.ts` initialises AdMob on mount, requests ATT permission (iOS 14+), and provides a `BannerAd` component used by the Shell agent. When `useProStore.isPro` becomes `true`, the banner unmounts immediately.

### Free vs. Pro Matrix

| Feature | Free | Pro |
|---|---|---|
| Scan → JPEG/HEIC export | Yes (watermark, medium res) | Yes (no watermark, max res) |
| DNG / RAW export | No | Yes |
| AI Color Reconstruction | No | Yes |
| AI Dust Removal | No | Yes |
| Insights tab | No | Yes |
| Ads | Banner on Scan + Gallery | None |
| Contact sheet | No | Yes (future) |

---

## Build Caveats

- **iOS builds require CocoaPods + watchman on a Mac.**
  Run `brew install cocoapods watchman` before `npx expo prebuild`.
  The CI sandbox runs only `npm run typecheck` and `npm run lint` as automated gates.

- **Android builds** can run on Linux / macOS with the Android SDK; no Mac required.

- **`npx expo prebuild`** generates `ios/` and `android/` from `app.json` + the local module's `expo-module.config.json`. These generated directories are gitignored; do not hand-edit them.

- **New Architecture** (`newArchEnabled: true` in `app.json`) means all third-party native packages must support the New Architecture. The packages listed in AGENTS.md have been chosen with this constraint in mind.

- **TypeScript path aliases**: `@/*` resolves to `src/*`; `@/assets/*` resolves to `assets/*`. This is configured in `tsconfig.json` and `babel.config.js`; do not change either file without orchestrator approval.
