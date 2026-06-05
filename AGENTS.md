# Analog Intelligence — React Native (Expo) port

> **Expo SDK 56. Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing native or config code.**

## What this project is

Analog Intelligence is a **film-negative scanner**. The user photographs a film
negative on a light source; the app converts the negative to a positive, removes
the orange mask, applies tone/color correction and user adjustments, stores the
result locally, and exports it. Free tier has ads + watermark; Pro unlocks full
resolution, AI processing, and Insights.

This repo is a **port of a mature native iOS (SwiftUI) app to cross-platform
React Native + Expo**. The original Swift app is preserved under `legacy-ios/`
and is the **source of truth for the image-processing algorithms and UX**.
Read `legacy-ios/docs/` (SPEC.md, PRODUCT_UI_SPEC.md, TECHNICAL_SPECIFICATION.md,
CODEBASE_AUDIT.md, PHASE3_EXPANSION_ROADMAP.md) for the full vision.

## Stack (do not change versions without the orchestrator)

- Expo SDK **56**, React Native **0.85.3**, React **19.2.3**, New Architecture ON
- expo-router (file-based, `src/app`), typed routes
- TypeScript **strict** (`tsconfig` alias `@/*` → `src/*`, `@/assets/*` → `assets/*`)
- Camera: **react-native-vision-camera** (+ frame processors via worklets)
- GPU image work / preview: **@shopify/react-native-skia**
- Native processing: a **local Expo module** at `modules/ai-image-processing`
  (Swift on iOS, Kotlin on Android) — the hybrid per-platform native strategy
- State: **zustand**; Storage: **expo-sqlite** (metadata) + **expo-file-system**
  (image files) + **react-native-mmkv** (prefs)
- Monetization: **react-native-purchases** (RevenueCat, cross-platform IAP) +
  **react-native-google-mobile-ads** (AdMob)
- Export: **expo-media-library**, **expo-sharing**, **expo-image-manipulator**

## Architecture & directory ownership

Each workstream **owns one top-level area** and must not edit another's files.
Shared contracts (TypeScript types/interfaces) live in `src/processing/types.ts`,
`src/storage/models.ts`, and `modules/ai-image-processing/index.ts` — treat these
as APIs: additive changes only, coordinate via the orchestrator for breaking ones.

```
src/
  app/                 # expo-router routes. (Shell)
    (tabs)/            #   scan / gallery / insights / settings
    adjust/[id].tsx    #   adjust screen for a captured frame
    _layout.tsx
  components/          # shared, presentational UI + design system. (Shell)
  theme/               # design tokens, colors, typography. (Shell)  [currently src/constants/theme.ts]
  camera/              # VisionCamera setup, capture, frame-processor hooks. (Camera)
  processing/          # TS pipeline orchestration + native bridge wrappers + types. (Pipeline)
  storage/             # sqlite + filesystem + repositories + models. (Storage)
  monetization/        # RevenueCat, AdMob, Pro gating, watermark. (Monetization)
  insights/            # histogram + roll metrics + charts. (Insights)
  state/               # zustand stores (shared; coordinate). (any)
  lib/                 # small pure utils. (any)
modules/
  ai-image-processing/ # LOCAL EXPO MODULE: negative→positive engine. (Native)
docs/                  # RN vision, scope, architecture, migration plan. (Docs)
legacy-ios/            # original Swift app — REFERENCE ONLY, do not modify.
```

## Hard rules for agents

1. **Stay in your owned directory.** Do not edit files outside it. If you need a
   new shared type, add it to the relevant contract file and note it in your report.
2. **Do not run `npm install`, `expo install`, `expo prebuild`, or any git command.**
   The orchestrator owns dependencies, native generation, and commits. If you need a
   package, import it as if present and list it under "Dependencies needed" in your report.
3. **Do not edit `package.json`, `app.json`, `babel.config.js`, `tsconfig.json`, or
   this file.** Request changes via your report.
4. **TypeScript strict, no `any`** unless unavoidable (justify it). Prefer small,
   testable, pure functions for processing logic.
5. **Match Expo SDK 56 APIs.** When unsure of a native/Expo API, consult
   https://docs.expo.dev/versions/v56.0.0/ rather than guessing from older versions.
6. **Port behavior, not Swift idioms.** Reproduce the *algorithm/UX* from
   `legacy-ios/`, written idiomatically for RN/TS.

## Commands (orchestrator/integration)

```bash
npm install            # base deps
npx expo install <pkg> # add native deps at SDK-correct versions
npm run typecheck      # tsc --noEmit  (primary gate while native builds are unavailable here)
npm run lint           # expo lint
npx expo prebuild      # generate ios/ + android/ (needs CocoaPods on iOS)
```

> **Environment note:** CocoaPods + watchman are **not installed** in the build
> sandbox, so iOS device/simulator builds must be finished on a Mac with
> `brew install cocoapods watchman`. `npm run typecheck` is the main automated gate here.

## Milestones (the "full vision")

1. **MVP parity** — scan → adjust → gallery → export; negative→positive pipeline;
   storage; monetization scaffolding. (matches legacy MVP)
2. **P0 gaps** — manual camera controls UI, focus peaking, automatic frame
   detection, DNG/RAW capture where supported, live histogram.
3. **Phase 2 (AI)** — on-device model hooks for color reconstruction + dust/scratch
   removal (stub the model, wire the pipeline + Pro gating).
4. **Phase 3 (hardware)** — BLE dock integration interfaces + roll-scan state machine
   (interfaces + simulation; no physical device required).
