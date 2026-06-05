# iOS ⇄ Android engine parity

`ai-image-processing` ships the negative→positive engine **natively on each
platform** — `ios/AiImageProcessingModule.swift` (Core Image) and
`android/.../AiImageProcessingModule.kt` (framework `Bitmap` + per-pixel math).
The app layer is one shared TypeScript codebase; only this engine is per-platform,
which is the idiomatic React Native pattern for performance-critical pixel work.

iOS is the **authoritative reference** (it is a 1:1 port of the proven legacy
SwiftUI pipeline under `legacy-ios/`). Android reproduces the same algorithm with
the same constants and thresholds. Where Core Image provides a filter that has no
exact framework equivalent on Android, the Kotlin uses a documented approximation
chosen to match the iOS *semantics*; pixel-exact equality across platforms is **not**
a goal and not expected.

This file is the result of a static, function-by-function audit (no device build).
Anything marked **⚠ verify on device** needs a visual A/B check on real hardware.

## API surface — exact parity ✅

Both register `Name("AiImageProcessing")` and expose the same four async methods
with identical record shapes (`ProcessParams`, `UserAdjustParams`) and return
shapes (`{uri,width,height}`, `Histogram`, `FrameDetectionResult`), matching
`src/AiImageProcessing.types.ts`:

| Method | iOS | Android |
|---|---|---|
| `processNegative(uri, params)` | ✅ | ✅ |
| `analyzeHistogram(uri)` | ✅ | ✅ |
| `applyUserAdjustments(baseUri, params)` | ✅ | ✅ |
| `detectFilmFrame(uri)` | ✅ | ✅ |

## Pipeline stage parity (`processNegative`)

| Stage | iOS (Core Image) | Android (per-pixel) | Parity |
|---|---|---|---|
| 2. Linearize | `CILinearToSRGBToneCurve` in a linear working-space context | `srgbToLinear` (IEC 61966-2-1) | ✅ equivalent |
| 3. Invert | `CIColorInvert` | `1 - c` in linear | ✅ exact |
| 4. Orange mask | downsample 10%, dark px (BT.601 luma<51), avg 100 darkest, densities rel. red; `CIColorMatrix` gains + `−0.05·strength` bias on R,G | same thresholds/constants; nearest-neighbour stride downsample | ✅ same math; **approx** downsampler |
| 5. Gray-world normalize | `CIAreaAverage` mean, gains clamped [0.5, 2.0] | same formula/clamp; mean computed over linear pixels | ✅ same; tiny mean-domain diff |
| 6. Auto tone curve | luminance CDF (BT.601), 1%/99% black/white, `brightness=log2(1/range)`, `contrast=1.1`, `gamma=2.0` | identical thresholds/constants | ✅ same; see tone-space note |
| 7. User adjustments | shared Core Image graph (see below) | shared `applyAdjustmentChannels` (see below) | ✅ shared per platform |
| B&W | `CIColorControls` saturation 0 | collapse to BT.709 luma | ✅ both grayscale |
| 8. Sharpen | `CISharpenLuminance` | 3×3 luminance unsharp mask | **approx** |
| encode | linear→sRGB output color space | `linearToSrgb` | ✅ equivalent |

`analyzeHistogram` is an exact match: 256 bins/channel, BT.709 luma, bottom/top-5%
clip percentages, normalized to sum ≈ 1.

## Fixed in this audit

1. **Adjust-screen preview now uses the same color space as commit on Android.**
   Previously the full pipeline applied the seven sliders in **linear** light
   while the fast path (`runAdjustmentsOnly`) applied them in **display sRGB**, so
   an Android preview drifted from the committed `processNegative` render — whereas
   on iOS both paths share one linear Core Image graph and stay in lockstep. The
   Kotlin now extracts a single `applyAdjustmentChannels` (linear) used by **both**
   the full pipeline and the fast path, and `runAdjustmentsOnly` linearizes its
   input first. The authoritative committed output is unchanged; only the live
   preview becomes a faithful approximation of it, matching iOS. **⚠ verify on device.**

2. **EXIF orientation honoured on Android.** iOS loads images with
   `.applyOrientationProperty: true`; Android's `BitmapFactory.decode*` ignored
   EXIF, so captures whose orientation lives in EXIF (VisionCamera does not bake
   rotation into pixels) could process/export **sideways on Android only**.
   `decodeBitmap` now applies the EXIF orientation via framework `ExifInterface`
   (rotate/flip via `Matrix`), with graceful fallback to the un-rotated bitmap on
   any failure. No new dependency. **⚠ verify on device** (rotation direction and
   the mirrored TRANSPOSE/TRANSVERSE cases warrant a visual check).

3. **Corrected the `confidence` contract doc.** `AiImageProcessing.types.ts`
   claimed Android `detectFilmFrame` confidence is "always 0"; the heuristic
   actually returns a normalized score in (0, 1] when a frame is found (0 only when
   none is). Doc updated to match the implementation.

## Intentional / accepted differences (do **not** "fix" blindly)

- **`detectFilmFrame`** — iOS uses `VNDetectRectanglesRequest` (true perspective
  quad, Vision confidence). Android uses a luminance-edge (Sobel border-vs-interior)
  heuristic returning an axis-aligned quad and a relative score. Same tuning intent
  (≥30% min size). Android is explicitly best-effort and returns `found:false`
  below threshold so the UI can fall back to manual crop. A future ML Kit / Canny+
  Hough implementation is the tracked upgrade (TODO in the Kotlin).
- **`dng` export** — iOS-only (RAW comes from VisionCamera capture, not this
  module). Both platforms define `UnsupportedFormatException`; the Android engine
  signals `UNSUPPORTED_FORMAT` and the Pipeline layer falls back to HEIC/JPEG.
- **HEIC writer** — implemented on both (`writeHEIC` / `writeHeic`) but not yet
  wired (an additive `exportFormat` param is pending); `processNegative` emits JPEG
  q95 on both today.
- **Filter approximations** — highlights/shadows, warmth (temperature→per-channel
  scale), vibrance, and sharpen have no exact framework twin on Android and use the
  documented approximations above. Expect small tonal differences, not structural ones.

## Tone / color-space notes worth a device A/B (not bugs)

- iOS runs `CIColorControls`/`CIGammaAdjust` (tone curve, contrast) in its **linear**
  working space; the Kotlin applies the tone curve in **sRGB-encoded** space (it
  round-trips per pixel). Both follow the legacy intent but can differ slightly in
  midtone roll-off. If a visible mismatch appears, align the Kotlin `toneMap` domain
  to whichever the legacy app actually produced — iOS is authoritative.
- Gray-world mean is taken over linear pixels on Android vs the CIAreaAverage value
  rendered to sRGB on iOS; this can nudge white balance a hair.

## Build / environment

This audit is static. To complete verification:

```bash
# Repair the vision-camera config plugin first (see repo README follow-ups), then:
npx expo prebuild            # generates ios/ + android/
npm run ios                  # Mac + CocoaPods/watchman
npm run android              # Android SDK + emulator/device
```

Then run the same negative through both platforms with identical sliders and compare
`processNegative` output, the Adjust-screen live preview vs the committed result, and
`detectFilmFrame` on a few portrait/landscape captures (orientation check).
