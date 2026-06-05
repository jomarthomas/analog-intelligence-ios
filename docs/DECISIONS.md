# Orchestrator Decisions Log

Cross-cutting decisions for the React Native port. **Authoritative** when in
conflict with a single workstream's local assumptions. Maintained by the
integrating orchestrator.

## Native module API (`modules/ai-image-processing`)

- **MVP-canonical contract (implemented)** = `modules/ai-image-processing/index.ts` as
  built by the Native agent: `processNegative(inputUri, params: ProcessParams)` →
  `ProcessResult { uri, width, height }`, and `analyzeHistogram(uri)` → `Histogram`.
  `ProcessParams` = `{ exposure, warmth, contrast, mode:'color'|'bw', removeOrangeMask,
  sharpen, aiColor?, aiDustRemoval? }` plus optional `saturation/highlights/shadows/
  vibrance` (default 0). This is the real, typechecked Swift+Kotlin surface — the
  **Pipeline workstream builds on THIS** (it supersedes the richer draft still in
  `docs/NATIVE_MODULE_API.md`, which is now aspirational).
- **Deferred to the P0-gaps milestone (native follow-up, task #10):** a separate fast
  `applyUserAdjustments(baseUri, params)` path for live Adjust-screen preview (avoid
  re-running the full pipeline per slider drag), `detectFilmFrame(uri)` for automatic
  frame detection, and explicit `exportFormat` handling (HEIC/DNG).
- **EXCLUDE camera-control functions** (`setFocusLocked`, `setExposureLocked`,
  `setWhiteBalanceLocked`, `unlockCalibration`, `getCalibrationState`,
  `getCameraCapabilities`) from this module. Calibration / manual controls live in
  the **Camera layer** via `react-native-vision-camera` (device formats + exposure/
  focus/white-balance APIs), not a custom native call.
- **(Q1)** For MVP, `processNegative` applies user adjustments inline. The live-preview
  `applyUserAdjustments` fast path is the P0 follow-up (task #10).
- **(Q2)** Android DNG: the native module throws `UNSUPPORTED_FORMAT` for
  `exportFormat: 'dng'` on Android; the Pipeline catches it and falls back to
  HEIC/JPEG, surfacing a one-time note. iOS DNG via VisionCamera RAW where supported.

## Modules layout

- **(Q3)** Phase-3 BLE dock = a **separate** module `modules/dock-ble` (do not bloat
  `ai-image-processing`).

## Monetization secrets

- **(Q4)** RevenueCat entitlement/offering IDs + AdMob app IDs are injected via
  `app.json` → `expo.extra` (read with `expo-constants`) plus a local gitignored
  `.env` for dev. **No secrets committed.** Use placeholder constants for now.

## Theme

- **(Q5)** Canonical design-system path = **`src/theme/`**. Keep
  `src/constants/theme.ts` as a thin re-export shim so scaffold components keep working.
