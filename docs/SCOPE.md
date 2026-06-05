# Analog Intelligence RN Port — Feature Scope

## Platforms

- **iOS** (primary) — iPhone 12 Pro and newer (advanced camera hardware required for RAW capture)
- **Android** — devices with Camera2 API support and manual controls (RAW capture where Camera2 supports it)

Web (via React Native Web) is **not** in scope for any milestone in this document.

---

## Milestone 1: MVP Parity

Goal: ship an app on both platforms that matches the feature set of the legacy iOS MVP. The processing algorithms must produce results equivalent to the Swift implementation.

### In Scope

**Camera / Capture**
- Camera preview via react-native-vision-camera
- HEIC and JPEG capture
- Calibration workflow: lock focus, ISO, shutter speed, and white balance for a full roll
- Tap-to-focus (sets auto mode, not manual lock — parity with legacy)
- Torch/flash toggle

**Image Processing Pipeline**
All 8 steps implemented in the native module (`modules/ai-image-processing`):
1. Crop / perspective correction
2. Convert to linear RGB
3. Invert negative (color negative, B&W, slide stubs)
4. Estimate and remove orange mask (color film only)
5. Normalize color channels (gray-world assumption)
6. Auto tone curve (histogram CDF, 1%/99% black/white points)
7. User adjustments (exposure, warmth, contrast, saturation, highlights, shadows, vibrance)
8. Sharpen and export (luminance sharpen or unsharp mask)

**Adjust Screen** (`src/app/adjust/[id].tsx`)
- Exposure slider (−2.0 to +2.0 EV)
- Warmth slider (−1.0 cool to +1.0 warm, mapped to 4500 K–8500 K)
- Contrast slider (−1.0 to +1.0)
- Preset styles: None, Bright, Warm, Cool, Punchy, Vintage, Muted

**Gallery**
- Grid view of scanned images
- Tap to full-screen preview
- Multi-select
- Delete single / batch

**Export**
- JPEG, HEIC to device camera roll (expo-media-library)
- Share sheet (expo-sharing)
- Free tier: watermark + medium resolution (0.7 compression)
- Pro tier: no watermark, maximum resolution (1.0 compression)

**Storage**
- expo-sqlite for image metadata
- expo-file-system for image and RAW files
- react-native-mmkv for user preferences

**Monetization Scaffolding**
- react-native-purchases (RevenueCat) for cross-platform IAP
- Pro status gating on Pro features
- react-native-google-mobile-ads (AdMob) banner ads on Scan and Gallery tabs (free tier only)
- Pro unlock screen

### Out of Scope (Milestone 1)

- RAW / DNG capture and export (deferred to Milestone 2)
- Manual camera controls UI (backend calibration API exists in the native module; UI is Milestone 2)
- Focus peaking overlay (Milestone 2)
- Automatic frame / crop detection (Milestone 2)
- Live histogram overlay in camera preview (Milestone 2)
- AI color reconstruction (Milestone 3)
- AI dust/scratch removal (Milestone 3)
- BLE hardware dock (Milestone 4)
- Contact sheet generator (deferred)
- Lens selection UI (deferred)
- EXIF metadata writing to exported files (deferred)

---

## Milestone 2: P0 Gaps

Goal: close the gaps identified in `legacy-ios/docs/CODEBASE_AUDIT.md` and `PHASE3_EXPANSION_ROADMAP.md`. These are the features that separate a capable scanner from a professional tool.

### In Scope

**DNG / RAW Capture and Export (P0)**
- Enable RAW capture via react-native-vision-camera on devices that support it
- Store DNG alongside the processed image
- Export DNG directly (passthrough of raw bytes) with EXIF metadata embedded
- Pro-only gate

**Manual Camera Controls UI (P0)**
- Collapsible panel on the Scan screen
- Focus slider (lens position 0.0 ∞ to 1.0 macro) with approximate distance label
- ISO slider (device-reported min/max)
- Shutter speed slider (log scale, formatted as fractional seconds)
- White balance preset picker (Auto / Daylight / Cloudy / Tungsten / Fluorescent / Flash)
- Lock indicators per control

**Focus Peaking (P0)**
- Real-time edge detection on camera preview frames via vision-camera frame processor
- Color overlay (configurable: red, white, yellow) on high-contrast edges
- Adjustable sensitivity threshold
- Target: 30+ FPS on iPhone 13 Pro / equivalent Android

**Automatic Frame Detection (P0)**
- Rectangle detection on the captured image to find film frame boundaries
- Automatic crop to detected boundaries with manual override
- Works for standard 35mm aspect ratios; graceful fallback to manual alignment

**Live Histogram (P0)**
- Sampled from video frames (target 10 FPS sample rate)
- RGB + luminance overlay on the camera preview screen
- Clipping warning indicators (shadow / highlight)

### Out of Scope (Milestone 2)

- Waveform monitor / RGB parade
- Zebra-stripe clipping overlay
- Macro lens auto-detection
- AI features (Milestone 3)

---

## Milestone 3: Phase 2 AI

Goal: wire on-device AI model hooks into the processing pipeline with full Pro gating. The models themselves are stubs at first; the pipeline contracts and UI must be production-ready before the models ship.

### In Scope

- **AI Color Reconstruction**: slot in the Phase 2 ML model into the pipeline after orange-mask removal; TypeScript bridge in `src/processing/`; on-device inference via the native module; Pro-only
- **AI Dust and Scratch Removal**: post-pipeline pass; stub model with real pipeline wiring; Pro-only
- **Improved Histogram / Insights**: per-roll analytics improvements, histogram chart in Insights tab, shadow clipping %, highlight clipping %, template-based insights ("Well-exposed roll", "Pushed highlights")
- **Film type presets**: color negative, B&W, slide — each with tuned default pipeline parameters

### Out of Scope (Milestone 3)

- Cloud-based model inference
- Film stock identification from image (future)
- Hardware dock (Milestone 4)

---

## Milestone 4: Phase 3 Hardware

Goal: define and implement the BLE dock integration interfaces and the roll-scan state machine. No physical device is required; a simulation mode must be usable.

### In Scope

- BLE dock service discovery and connection management
- Roll-scan state machine: `connectingToDock → waitingForDockAlignment → capturing → verifyingQuality → retryingCapture → completed`
- Dock events: `frameAligned`, `jamDetected`, `lowBattery`, `disconnected`
- Simulation mode (software-only) for development and QA without hardware
- UI for dock status, roll progress, error recovery

### Out of Scope (Milestone 4)

- Specific dock manufacturer SDK integration (interface-only)
- Sprocket-hole detection
- Automatic roll-advance motor control (depends on dock firmware)

---

## Explicit Out-of-Scope Items (All Milestones)

- **Web browser target**: React Native Web is a possible future path but not committed
- **macOS / Catalyst**: not planned
- **Custom user accounts / backend auth**: StoreKit (iOS) and RevenueCat (both platforms) handle purchase state; no custom login required for any milestone
- **Cloud photo sync**: all data is local; no server-side storage
- **Video scanning**: still-capture only
- **Darkroom timer / reciprocity calculator**: separate app concern
