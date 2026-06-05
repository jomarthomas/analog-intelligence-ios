# Analog Intelligence RN Port — Development Roadmap

This roadmap sequences the work across all four milestones. Each milestone section lists the features, the owning agent(s), acceptance criteria, and known dependencies.

The milestones map directly to the ones defined in `AGENTS.md` and elaborated in `SCOPE.md`. Priority classifications (P0, P1, P2) are inherited from `legacy-ios/docs/PHASE3_EXPANSION_ROADMAP.md` and `CODEBASE_AUDIT.md`.

---

## Milestone 1 — MVP Parity

**Goal**: both iOS and Android can scan a film negative, process it through the full 8-step pipeline, view the result in a gallery, and export it. Monetization scaffolding is wired but does not need production keys.

**Acceptance gate**: `npm run typecheck` passes; expo prebuild succeeds on iOS Mac machine; manual smoke test captures a frame and displays it in the gallery.

### M1.1 — Shell + Routing (Shell agent)

| Feature | Details |
|---|---|
| Tab navigation | Four tabs: Scan / Gallery / Insights / Settings via expo-router `(tabs)/` group |
| Adjust screen | `adjust/[id].tsx` route, receives `ScannedImage` id |
| Design tokens | `src/theme/` — orange accent (#FF9933), dark camera UI, typography scale |
| Root layout | `_layout.tsx` — ThemeProvider, RevenueCat init, AdMob init |

### M1.2 — Native Module Skeleton (Native agent)

| Feature | Details |
|---|---|
| Module scaffolding | `modules/ai-image-processing/` expo-module.config.json, iOS/Android stubs |
| TypeScript surface | `index.ts` matches the full API defined in `NATIVE_MODULE_API.md` |
| `processImage` iOS | All 8 steps implemented in Swift; Core Image algorithms from `legacy-ios/Processing/Pipeline/` |
| `processImage` Android | Kotlin equivalents; `ColorMatrix` / `RenderEffect` for GPU ops |
| `applyUserAdjustments` | Both platforms; used by Adjust screen live preview |
| `computeHistogram` | Both platforms; used by Insights |
| Progress events | `NativeEventEmitter` `onProcessingProgress` events firing correctly |

### M1.3 — Camera / Capture (Camera agent)

| Feature | Details |
|---|---|
| Camera permission flow | `src/camera/useCameraSetup.ts` — request permission, handle denied state |
| Preview screen | Scan tab; VisionCamera `<Camera>` component; torch toggle |
| HEIC + JPEG capture | `takePhoto()` → write to expo-file-system cache |
| Calibration lock | `CalibrationService.ts` calls native module `setFocusLocked`, `setExposureLocked`, `setWhiteBalanceLocked` |
| Film type selection | Dropdown on Scan screen; maps to `FilmType` passed to pipeline |

### M1.4 — Pipeline Orchestration (Pipeline agent)

| Feature | Details |
|---|---|
| `pipeline.ts` | Calls native module steps in sequence; subscribes to progress events; updates `useProcessingStore` |
| Adjust-screen integration | Re-runs `applyUserAdjustments` on every slider change; debounced 200 ms |
| Preset styles | None / Bright / Warm / Cool / Punchy / Vintage / Muted — parameter objects matching legacy values |
| Error handling | Maps `ProcessingError` codes to user-facing messages |

### M1.5 — Storage (Storage agent)

| Feature | Details |
|---|---|
| SQLite schema | `images` table, `sessions` table; migration runner |
| `imageRepository` | `save`, `get`, `list`, `delete`, `bulkDelete` |
| `fileStore` | Write / read / delete image files in `expo-file-system` documents directory |
| `prefsStore` | react-native-mmkv wrapper; `filmType`, `captureFormat`, `showGrid`, `autoLockCalibration` |
| Shared models | `ScannedImage`, `ScanSession`, `UserPreferences` interfaces in `src/storage/models.ts` |

### M1.6 — Gallery (Shell agent)

| Feature | Details |
|---|---|
| Grid view | `FlatList` or `FlashList`; uses `expo-image` for thumbnails |
| Full-screen preview | Modal or push route |
| Multi-select | Long-press to enter selection mode; delete batch |
| Export | `expo-media-library` save to camera roll; `expo-sharing` share sheet |

### M1.7 — Monetization Scaffolding (Monetization agent)

| Feature | Details |
|---|---|
| RevenueCat configure | Called in root `_layout.tsx`; product ID from RevenueCat dashboard |
| `useProStore` | Zustand store wrapping `purchaseService.checkEntitlement('pro')` |
| Pro gate hook | `useProStatus()` → `{ isPro: boolean, purchasePro: () => void }` |
| Watermark | `watermark.ts` — composites "Analog Intelligence" text via expo-image-manipulator on free-tier exports |
| AdMob banners | `BannerAd` component on Scan + Gallery tabs; hidden when `isPro` |
| Pro unlock screen | Shows product price from RevenueCat; purchase + restore flows |

---

## Milestone 2 — P0 Gaps

**Goal**: close the four critical gaps from `CODEBASE_AUDIT.md`. These are ship-blockers for the pro audience.

**Acceptance gate**: DNG export verified in Lightroom; focus peaking visible at ≥30 FPS on iPhone 13 Pro; manual controls panel collapses/expands; frame detection hits ≥90% on standard 35mm test set.

### M2.1 — DNG / RAW Export (Camera + Native + Monetization agents)

| Feature | Details |
|---|---|
| RAW capture | VisionCamera `{ photoCodec: 'raw' }` option; gated on `getCameraCapabilities().supportsRawCapture` |
| DNG storage | `fileStore.saveRaw(dngUri, id)` writes to `raw/` directory |
| DNG export in native module | `processImage` with `exportFormat: 'dng'` returns raw bytes passthrough with EXIF metadata embedded |
| Export options sheet | Gallery detail view — JPEG / HEIC / DNG picker; DNG Pro-gated |

### M2.2 — Manual Camera Controls UI (Camera + Shell agents)

| Feature | Details |
|---|---|
| Collapsible panel | `src/components/ManualControlsPanel.tsx`; toggle from Scan screen |
| Focus slider | Range 0.0–1.0; calls `setFocusLocked`; approximate distance label (matching legacy text) |
| ISO slider | Range from `getCameraCapabilities().minISO` to `maxISO`; calls `setExposureLocked` |
| Shutter speed slider | Log scale; formatted as fractional seconds; calls `setExposureLocked` |
| White balance picker | 6 presets (Auto / Daylight / Cloudy / Tungsten / Fluorescent / Flash) → Kelvin values → `setWhiteBalanceLocked` |
| Lock indicators | Per-control icon when locked (orange tint) |

### M2.3 — Focus Peaking (Camera + Native agents)

| Feature | Details |
|---|---|
| Frame processor worklet | `useFrameProcessors.ts` — Sobel edge detection on YUV luma channel |
| Colour overlay | Configurable (red / white / yellow); composited via Skia canvas |
| Threshold control | Sensitivity slider in Manual Controls panel |
| Performance target | 30 FPS on iPhone 13 Pro, 24 FPS on Pixel 6; degrade gracefully |

### M2.4 — Automatic Frame Detection (Native + Pipeline agents)

| Feature | Details |
|---|---|
| `detectFilmFrame` | Calls native module; Vision `VNDetectRectanglesRequest` (iOS) / ML Kit document scanner (Android) |
| Auto-crop in pipeline | `processImage` uses detected quad as `perspectiveQuad` when `FrameDetectionResult.confidence > 0.7` |
| Manual override | Adjust screen shows crop handles if auto-detection ran; user can drag corners |
| Fallback | If `found === false`, pipeline proceeds without crop (user aligns manually) |

### M2.5 — Live Histogram (Camera + Insights agents)

| Feature | Details |
|---|---|
| Frame processor sampling | Sample every 3rd frame (≈10 FPS at 30 FPS preview); call `computeHistogram` on downscaled buffer |
| Histogram overlay | Skia canvas in Scan screen corner; RGBA 4-channel bars |
| Clipping warnings | Shadow bar turns blue, highlight bar turns white/orange when > 2% clipping |
| `useCameraStore.liveHistogram` | Updated from frame processor; Skia reads directly |

---

## Milestone 3 — Phase 2 AI

**Goal**: wire the AI processing slots into the pipeline. Model stubs ship with the initial release; actual model files are dropped in without API changes.

**Acceptance gate**: Pro-gated AI options appear in Adjust screen; pipeline progress includes AI steps; stub returns identity transform; Insights tab shows per-roll analytics.

### M3.1 — AI Pipeline Slots (Native + Pipeline agents)

| Feature | Details |
|---|---|
| `aiColorReconstruct` native function | New function in `index.ts`; takes URI + film type; returns URI; iOS stub = identity; Pro-gated |
| `aiDustRemove` native function | New function; takes URI; returns URI; stub = identity; Pro-gated |
| Pipeline config flags | `useAIColorReconstruction: boolean` and `useAIDustRemoval: boolean` in `ProcessImageConfig` |
| Pipeline step insertion | Color reconstruction runs after Step 5 (normalize); dust removal runs after Step 8 (export) |

### M3.2 — AI Options UI (Shell + Monetization agents)

| Feature | Details |
|---|---|
| AI Options panel | In Adjust screen (Milestone 1 stub now made functional); toggle switches for each AI mode |
| Pro gate on AI options | Upgrade prompt if free user taps an AI toggle |
| Processing indicator | "AI processing…" state in `useProcessingStore` |

### M3.3 — Insights Tab (Insights agent)

| Feature | Details |
|---|---|
| Histogram chart | Skia canvas in `src/app/(tabs)/insights.tsx`; RGBA + luminance overlaid |
| Shadow clipping % | `HistogramStats.shadowClippingPercent` from `rollMetrics.ts` |
| Highlight clipping % | `HistogramStats.highlightClippingPercent` |
| Per-roll analysis | `rollMetrics.ts` aggregates across all images in a `ScanSession` |
| Template insights | "Well-exposed roll" / "Pushed highlights" / "Underexposed shadows" text strings from lookup table |
| Pro gate | Insights tab shows upgrade prompt if free; shows content if Pro |

### M3.4 — Film Type Presets (Pipeline agent)

| Feature | Details |
|---|---|
| Preset pipeline configs | `colorNegative` / `blackAndWhite` / `slide` default `ProcessImageConfig` objects |
| Film stock picker | Optional film stock name (Kodak Portra, Fuji 400H, etc.) → maps to film type + adjustment presets |

---

## Milestone 4 — Phase 3 Hardware

**Goal**: define the BLE dock integration interfaces and state machine. Simulation mode required for all testing; no hardware dependency.

**Acceptance gate**: simulation mode completes a full 36-frame roll scan without errors; BLE interface compiles on both platforms; dock UI shows frame count and progress.

### M4.1 — BLE Dock Interface (Native agent)

| Feature | Details |
|---|---|
| `DockService` native module | New module (separate from `ai-image-processing`); exposes scan, connect, disconnect |
| BLE discovery | Scan for dock service UUID; connect; monitor characteristic |
| Dock events | `frameAligned`, `jamDetected`, `lowBattery`, `disconnected` → JS via NativeEventEmitter |
| Simulation mode | Software simulation of dock events; activated in Settings |

### M4.2 — Roll-Scan State Machine (Camera + Pipeline agents)

| Feature | Details |
|---|---|
| States | `connectingToDock → waitingForDockAlignment → capturing → verifyingQuality → retryingCapture → completed` |
| `useDockStore` | Zustand store for dock state, frame count, roll progress |
| Quality verification | After each capture, call `computeHistogram`; check for blur / underexposure; trigger retry if below threshold |
| Error recovery | `jamDetected` → user prompt; `disconnected` → reconnect flow |

### M4.3 — Dock UI (Shell agent)

| Feature | Details |
|---|---|
| Dock status bar | Connection indicator on Scan screen; battery level |
| Roll progress | Frame counter (e.g. "12 / 36"); progress bar |
| Error modals | Jam recovery, low battery warning, disconnect reconnect |
| Simulation controls | Debug panel (Settings → Developer → Simulate Dock) |

---

## Sequencing and Dependencies

```
M1.2 (native module skeleton)
    └── M1.3 (camera) depends on native camera controls
    └── M1.4 (pipeline) depends on native processImage
    └── M1.5 (storage) can run in parallel
    └── M1.6 (gallery) depends on storage
    └── M1.7 (monetization) depends on shell + storage

M2.1 (DNG) depends on M1.3 (VisionCamera capture) + M1.2 (native export step)
M2.2 (manual controls UI) depends on M1.2 (native calibration API)
M2.3 (focus peaking) depends on M1.3 (frame processors)
M2.4 (frame detection) depends on M1.2 (native detectFilmFrame)
M2.5 (live histogram) depends on M1.2 (computeHistogram) + M2.3 (frame processor worklet)

M3.1 (AI slots) depends on M1.2 + M1.4
M3.3 (Insights) depends on M1.2 (computeHistogram) + M1.5 (session storage)

M4.1 depends on no prior milestone but is scoped to after M2 is complete
M4.2 depends on M4.1 + M1.4 (pipeline integration)
```

---

## P0 Gap Summary (from CODEBASE_AUDIT.md)

The following gaps were identified in the legacy iOS app and are carried forward as the primary deliverables of Milestone 2:

| Gap | Audit Severity | Milestone | Owner |
|---|---|---|---|
| DNG / RAW export not implemented | Critical (Pro differentiator) | M2.1 | Native + Camera |
| Manual camera controls — UI missing (backend exists) | Critical | M2.2 | Camera + Shell |
| Focus peaking — not implemented | Critical | M2.3 | Camera + Native |
| Automatic frame / crop detection — not implemented | Critical | M2.4 | Native + Pipeline |
| Live histogram — not implemented | High | M2.5 | Camera + Insights |
| EXIF metadata writing — partial | Medium | M2.1 (DNG) / future | Native |
| Lens selection UI — backend only | Low | Post-M2 | Camera |
| Grid overlays / composition guides | Low | Post-M2 | Shell |

---

## Success Metrics

| Milestone | Technical Gate | UX Gate |
|---|---|---|
| M1 | `typecheck` + `lint` pass; prebuild clean on Mac | Full scan cycle on physical iOS and Android device |
| M2 | DNG opens in Lightroom; focus peaking ≥30 FPS | Manual scan of 36-frame roll in < 10 minutes |
| M3 | AI stub pipeline completes without error; Insights metrics match hand-calculated values | Pro conversion rate target: 15–20% |
| M4 | Simulation completes 36-frame roll; BLE compiles both platforms | App Store rating target: 4.8+ |
