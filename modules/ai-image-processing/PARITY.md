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
`src/AiImageProcessing.types.ts`. The `ProcessParams` record gained one optional
field this round, `maxDimension: Double = 0` (≤ 0 ⇒ full res), present on both
the Swift and Kotlin records; `mode` now also accepts `"slide"`.

| Method | iOS | Android |
|---|---|---|
| `processNegative(uri, params)` | ✅ | ✅ |
| `analyzeHistogram(uri)` | ✅ | ✅ |
| `applyUserAdjustments(baseUri, params)` | ✅ | ✅ |
| `detectFilmFrame(uri)` | ✅ | ✅ |

## Pipeline stage parity (`processNegative`)

| Stage | iOS (Core Image) | Android (per-pixel) | Parity |
|---|---|---|---|
| 0. `maxDimension` (optional) | `CILanczosScaleTransform` to cap longer edge (GPU-tiled) | `Bitmap.createScaledBitmap` BEFORE the FloatArray passes (OOM guard) | ✅ same intent; **approx** scaler |
| 2. Linearize | `CILinearToSRGBToneCurve` in a linear working-space context | `srgbToLinear` (IEC 61966-2-1) | ✅ equivalent |
| 3. Invert | `CIColorInvert` *(skipped for `slide`)* | `1 - c` in linear *(skipped for `slide`)* | ✅ exact |
| 4. Orange mask | film-base sampling on pre-invert (brightest orange, R>G>B, luma>120), else dark-px fallback; `CIColorMatrix` gains + `−0.05·strength` bias *(skipped for `slide`)* | same thresholds/constants; pre-invert channel copy for the base; nearest-neighbour stride downsample *(skipped for `slide`)* | ✅ same math; **approx** downsampler |
| 5. Gray-world normalize | `CIAreaAverage` mean, gains clamped [0.5, 2.0] *(slide uses gentle stretch instead)* | same formula/clamp; mean over linear pixels *(slide uses gentle stretch instead)* | ✅ same; tiny mean-domain diff |
| 6. Auto tone curve | luminance CDF (BT.601), 1%/99% black/white, `brightness=log2(1/range)`, `contrast=1.1`, `gamma=2.0` *(slide uses gentle stretch instead)* | identical thresholds/constants *(slide uses gentle stretch instead)* | ✅ same; see tone-space note |
| 5–6′. Slide normalize (`slide` only) | `normalizeSlide`: 1%/99% luma points → `CIColorMatrix` slope+bias (NO contrast/gamma), applied to **linear** image | `normalizeSlide`: same 1%/99% points, slope+bias applied in **sRGB-encoded** space (round-trip) | ✅ same algorithm; same linear-vs-sRGB tone-domain split as the negative tone curve (below) |
| 7. User adjustments | shared Core Image graph (see below) | shared `applyAdjustmentChannels` (see below) | ✅ shared per platform |
| B&W | `CIColorControls` saturation 0 *(`bw` only; slide stays colour)* | collapse to BT.709 luma *(`bw` only; slide stays colour)* | ✅ both grayscale |
| 8. Sharpen | `CISharpenLuminance` | 3×3 luminance unsharp mask | **approx** |
| encode | linear→sRGB output color space | `linearToSrgb` | ✅ equivalent |

`analyzeHistogram` is an exact match: 256 bins/channel, BT.709 luma, bottom/top-5%
clip percentages, normalized to sum ≈ 1.

### Slide / E-6 positive mode (`mode === 'slide'`)

`FilmMode` now includes `'slide'` (`AiImageProcessing.types.ts`). A slide is an
**already-positive** reversal frame, so the pipeline differs from the negative
path on **both** platforms identically:

- **Inversion (step 3) and orange-mask removal (step 4) are SKIPPED.** A
  positive has no orange mask; `removeOrangeMask` is ignored.
- **The negative-oriented gray-world normalize (5) + aggressive auto tone curve
  (6) are replaced by one gentle normalization** (`normalizeSlide`): stretch the
  1%/99% luminance points to [0,1] with **no** added contrast or gamma, so a
  correctly-exposed E-6 frame is preserved rather than crushed.
- **User adjustments (7) and sharpen (8) run as normal.** Slide is colour, so it
  is **not** desaturated (only `bw` is).
- Flow: linearize → (no invert, no mask) → gentle normalize → user adjustments →
  sharpen → encode.

`color` / `bw` behaviour is byte-for-byte unchanged (the negative branch is the
original code path).

### Film-base (rebate) sampling for the orange mask

`estimateOrangeMask` now **prefers** sampling the unexposed film **base/rebate**
rather than the darkest post-invert pixels. In a colour negative the base is the
BRIGHTEST, most-saturated-orange region (max density base) **before** inversion
(R > G > B, high luminance):

1. Sample the **pre-invert** image at 10% (iOS: Lanczos render to sRGB bytes;
   Android: a pre-invert channel copy + 10% stride). Collect bright orange-base
   candidates: `R > G+10`, `G > B+5`, `luma > 120` (0–255). Average the **100
   brightest** such pixels → the film-base colour.
2. Convert the base to the existing **post-invert density convention**
   (`density = 1 − base`, normalized to red), so the downstream
   `CIColorMatrix`/gain-removal step (gains + `−0.05·strength` bias on R,G) is
   **unchanged** — only the *source of the estimate* improves colour neutrality.
3. If fewer than 100 convincing base pixels are found (e.g. borderless crop,
   B&W mis-tagged, no rebate visible), **fall back** to the legacy darkest-region
   method (post-invert, BT.601 luma < 51, avg 100 darkest). Deterministic.

Both platforms use identical thresholds and the identical density derivation.

## Added in this round (slide, film-base, maxDimension)

These three additive improvements were implemented on **both** platforms in
algorithmic parity (see the stage table + the two subsections above):

1. **Slide / E-6 positive mode** — `FilmMode` gains `'slide'`. Skips invert +
   orange-mask + negative auto-stages; uses a gentle `normalizeSlide` instead.
   **⚠ verify on device:** that a real E-6 frame comes out neutral and
   correctly-exposed (not crushed/clipped), and that the iOS (matrix on linear)
   vs Android (slope/bias in sRGB) tone-domain split — identical to the existing
   negative tone-curve split, see notes below — produces an acceptable A/B match.

2. **Film-base (rebate) orange-mask sampling** — `estimateOrangeMask` derives
   the mask from the brightest orange max-density base (pre-invert), falling back
   to the legacy darkest-region method. The removal math (gains + bias) is
   unchanged. **⚠ verify on device:** improved colour neutrality on real C-41
   scans **with** a visible orange rebate, and that the fallback still triggers
   for tightly-cropped frames with no rebate (no regression vs the old behaviour).
   The orange-detection thresholds (`R>G+10`, `G>B+5`, `luma>120`) are
   conservative first estimates and may want tuning against real captures.

3. **`maxDimension` reduced-resolution fast path** — optional longer-edge cap.
   Android downscales the bitmap before the FloatArray passes (OOM guard); iOS
   Lanczos-scales at pipeline entry. Default (unset/≤0) is unchanged full-res.
   **⚠ verify on device:** that a preview at e.g. `maxDimension: 1536` is visually
   consistent with the full-res commit (auto-stages run on the smaller image, so
   the mask/gray-world/tone statistics are computed at preview resolution — minor
   tonal drift between preview and commit is expected and acceptable, as with the
   existing Adjust-screen fast path).

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
- **Slide `normalizeSlide` inherits the same split:** iOS applies the slope+bias
  level stretch via `CIColorMatrix` on the **linear** image (and derives the
  1%/99% points from an sRGB-rendered histogram, exactly like the negative
  `applyToneCorrection`); Android applies the same slope+bias in **sRGB-encoded**
  space. The stretch is gentle, neutral and monotonic on both, so any difference
  is a slight midtone-roll-off nuance, not a structural one. iOS authoritative.
- Gray-world mean is taken over linear pixels on Android vs the CIAreaAverage value
  rendered to sRGB on iOS; this can nudge white balance a hair.
- **Film-base sampling** reads pre-invert pixels; iOS samples a Lanczos 10%
  render, Android a 10% nearest-neighbour stride over a pre-invert channel copy.
  Both use identical orange/luma thresholds and density math, but the downsampler
  difference means the chosen base pixels (and thus the mask) can differ slightly
  — the same **approx-downsampler** caveat already noted for the dark-region path.
- **`maxDimension` preview:** when set, the auto stages (mask, gray-world, tone)
  run on the downscaled image, so a preview's statistics differ marginally from
  the full-res commit. This is by design (the fast path), not a parity bug.

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
