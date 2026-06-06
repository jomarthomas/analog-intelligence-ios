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

Both register `Name("AiImageProcessing")` and expose the same **six** async
methods with identical record shapes (`ProcessParams`, `UserAdjustParams`) and
return shapes (`{uri,width,height}`, `Histogram`, `FrameDetectionResult`,
`FilmBaseNeutral`), matching `src/AiImageProcessing.types.ts`. The
`ProcessParams` record gained one optional field this round, `lut: String = ""`
(empty/unknown ⇒ NO-OP), present on both the Swift and Kotlin records (it earlier
also gained `maxDimension: Double = 0`; `mode` accepts `"slide"`).

| Method | iOS | Android |
|---|---|---|
| `processNegative(uri, params)` | ✅ | ✅ |
| `analyzeHistogram(uri)` | ✅ | ✅ |
| `applyUserAdjustments(baseUri, params)` | ✅ | ✅ |
| `detectFilmFrame(uri)` | ✅ | ✅ |
| `estimateFilmBaseNeutral(uri)` → `{warmth, tint, found}` | ✅ | ✅ |
| `averageFrames(uris)` → `{uri, width, height}` | ✅ | ✅ |

## Pipeline stage parity (`processNegative`)

| Stage | iOS (Core Image) | Android (per-pixel) | Parity |
|---|---|---|---|
| 0. `maxDimension` (optional) | `CILanczosScaleTransform` to cap longer edge (GPU-tiled) | `Bitmap.createScaledBitmap` BEFORE the FloatArray passes (OOM guard) | ✅ same intent; **approx** scaler |
| 2. Linearize | `CILinearToSRGBToneCurve` in a linear working-space context | `srgbToLinear` (IEC 61966-2-1) | ✅ equivalent |
| 3. Invert | `CIColorInvert` *(skipped for `slide`)* | `1 - c` in linear *(skipped for `slide`)* | ✅ exact |
| 4. Orange mask | film-base sampling on pre-invert (most-orange `R−B`, R>G>B, 120<luma<250), else dark-px fallback; base densities `1−base` floored to `kMinBaseDensity` and used **directly** (cyan-cast fix), gains capped at `kMaxMaskGain`; `CIColorMatrix` gains + `−0.05·strength` bias *(skipped for `slide`)* | same thresholds/constants/floors/caps; pre-invert channel copy for the base; nearest-neighbour stride downsample *(skipped for `slide`)* | ✅ same math; **approx** downsampler |
| 5. Gray-world normalize | `CIAreaAverage` mean, gains clamped [0.5, 2.0] *(slide uses gentle stretch instead)* | same formula/clamp; mean over linear pixels *(slide uses gentle stretch instead)* | ✅ same; tiny mean-domain diff |
| 5b. Residual-cast auto WB (`color` only) | `neutralizeResidualCast`: `CIAreaAverage` mean → per-channel gains toward the **min**-channel mean (attenuation-only, floored at `kMinNeutralGain`) via `CIColorMatrix` *(skipped for `bw`/`slide`)* | same formula/floor; mean over linear pixels *(skipped for `bw`/`slide`)* | ✅ same; same tiny mean-domain diff as gray-world |
| 6. Auto tone curve | luminance CDF (BT.601), **robust 2%/98%** black/white, **bounded levels remap** (slope+bias, range floored at `kMinToneRange`), `contrast=1.1`, **midtone-lift `gamma=kToneGamma=0.8`** *(slide uses gentle stretch instead)* | identical thresholds/constants; remap+contrast+gamma applied in sRGB-encoded space *(slide uses gentle stretch instead)* | ✅ same; see white-out fix + tone-space note |
| 5–6′. Slide normalize (`slide` only) | `normalizeSlide`: 1%/99% luma points → `CIColorMatrix` slope+bias (NO contrast/gamma), applied to **linear** image | `normalizeSlide`: same 1%/99% points, slope+bias applied in **sRGB-encoded** space (round-trip) | ✅ same algorithm; same linear-vs-sRGB tone-domain split as the negative tone curve (below) |
| 7. User adjustments | shared Core Image graph (see below) | shared `applyAdjustmentChannels` (see below) | ✅ shared per platform |
| B&W | `CIColorControls` saturation 0 *(`bw` only; slide stays colour)* | collapse to BT.709 luma *(`bw` only; slide stays colour)* | ✅ both grayscale |
| 8. Sharpen | `CISharpenLuminance` | 3×3 luminance unsharp mask | **approx** |
| 9. LUT look (`lut`, optional) | `applyLut` — identity NO-OP scaffold (empty/unknown ⇒ unchanged); `TODO(lut)` documents the `CIColorCube` slot | `applyLut` — identity NO-OP scaffold (empty/unknown ⇒ unchanged); `TODO(lut)` documents the trilinear-sample slot | ✅ both NO-OP today; same seam, runs after tone curve + adjustments, before encode |
| encode | linear→sRGB output color space | `linearToSrgb` | ✅ equivalent |

`analyzeHistogram` is an exact match: 256 bins/channel, BT.709 luma, bottom/top-5%
clip percentages, normalized to sum ≈ 1.

## Residual CYAN-cast fix (this round)

After the white-out fix below, a correctly-framed C-41 colour negative converted
without blowing out but came out with a strong, whole-image **cyan / blue cast**
(neutrals and skin not neutral) — the classic "orange mask not fully
neutralized". Inverting the orange film base yields cyan, and the mask + gray-world
stages were *under*-correcting. Two coordinated fixes, applied **identically on
both platforms** (iOS `AiImageProcessingModule.swift`, Android
`AiImageProcessingModule.kt`), same constants and logic:

### 1. The bug — `densitiesFromBase` collapsed the mask to a NO-OP (PRIMARY)

The film-base path samples the unexposed **orange** rebate **pre-invert** (high R,
mid G, low B) and converts it to the post-invert density convention `1 − base`
(→ **low R, mid G, high B**). The previous port then returned **red-normalized
ratios** clamped to `[kMinBaseDensity, 1]`: `redDensity = 1`,
`greenDensity = clamp(g/r)`, `blueDensity = clamp(b/r)`. Because the post-invert
base has **R as the smallest channel**, `g/r` and `b/r` are **both > 1** and both
clamp to **1.0** → all three densities collapse to 1 → `removeOrangeMask`'s
`comp = 1/density` are all equal → all gains **1.0** → the mask removal became a
**NO-OP** (bar the tiny `−0.05·strength` bias). The cyan from inversion was left
in place; gray-world (gains clamped `[0.5, 2.0]`) couldn't finish the job alone.

**Fix:** use `(1−baseR, 1−baseG, 1−baseB)` **directly** as
`(redDensity, greenDensity, blueDensity)` — exactly the legacy
`OrangeMaskEstimator.extractMaskParameters` convention (it used its sampled
channel values directly, not red-normalized ratios). Now blue is the densest
channel, so after `removeOrangeMask` normalizes the `1/density` compensations to
blue, **red is boosted the most** (capped at `kMaxMaskGain = 3.0`), lifting the
crushed red channel and neutralizing the cyan. The `kMinBaseDensity = 0.05` floor
and the `kMaxMaskGain = 3.0` cap are unchanged, so the white-out guard still
holds (the boost is bounded; one channel can at worst saturate, never the whole
frame). The dark-region fallback is unchanged — it samples **post-invert** darks
where R is the max, so its red-normalized ratios are naturally ≤ 1 and were never
hit by the clamp bug.

### 2. New Step 5b — `neutralizeResidualCast` (self-correcting safety net)

Because the mask boost is capped at 3.0, a *strongly* masked frame can still leave
a faint residual cast. A new **attenuation-only auto-white-balance** stage runs on
`color` negatives **after** gray-world and **before** the tone curve: it measures
the three channel means (`CIAreaAverage` on iOS; linear-pixel mean on Android —
the same accepted mean-domain split already used for gray-world) and scales each
channel toward the **minimum** channel mean.

- The gain reference is the *dimmest* channel, so the dimmest channel keeps gain
  **1.0** and the brighter (cast) channels are scaled **down** — **no gain ever
  exceeds 1.0**, so no pixel value can increase and the frame **cannot** be pushed
  to white. This is a *structural* white-out guarantee (stronger than a numeric
  cap).
- Gains are floored at `kMinNeutralGain / MIN_NEUTRAL_GAIN = 0.5` (≤ 2× pull on
  the most over-represented channel), so a *legitimately*-coloured scene (sunset,
  foliage) is only **partially** neutralized, not flattened to grey.
- The slight overall darkening (bright channels pulled down) is re-expanded by the
  immediately-following tone curve (levels stretch + midtone-lift gamma), which
  re-pins white at exactly 1.0 — net effect **"neutral, then correctly exposed"**,
  the FilmBox/Kodak-lab look, with the cast removed and self-corrected to the
  *measured* cast rather than a fixed magic gain.

`bw` (desaturated anyway) and `slide` (already positive, no mask) **skip Step 5b**
and are byte-for-byte unchanged.

> **⚠ verify on device:** that a real C-41 frame now yields neutral greys /
> believable skin (cyan gone) without over-neutralizing a deliberately warm/cool
> scene, and that iOS and Android agree closely (the only divergence is the
> documented Lanczos-vs-stride base sampler + the linear-vs-sRGB mean domain).
> `kMaxMaskGain = 3.0` and `kMinNeutralGain = 0.5` are conservative; if a faint
> cast survives, raise the mask cap a little or lower `kMinNeutralGain` toward
> ~0.4 (both stay white-out-safe). iOS authoritative.

## White-out fix + tone/film-base robustness (this round)

A real C-41 colour negative could process to a **pure-white** image. Root cause
and the fixes (applied **identically on both platforms**, same constants):

### 1. The blow-out: auto tone curve (`applyToneCorrection`) — PRIMARY FIX

The legacy tone curve computed `brightness = log2(1/range)` and applied it as an
**additive** offset (iOS `CIColorControls.inputBrightness`; Android additive in
`toneMap`). When a capture wasn't a perfectly-filled, evenly-lit negative, the
1%/99% `range` was small, so that offset was large (up to ~3.3) and was *added*
to every pixel — pushing the whole frame past 1.0 and clipping it to solid white.

**Replaced** with a **bounded levels remap**: a slope+bias mapping the robust
black/white points to [0,1] (`out = (in − black)/range`). It is monotonic and
self-normalising — the white point maps to **exactly 1.0**, so the stage can
*never* drive values above white; the additive blow-out is structurally
impossible. Specifics (both platforms, shared constants):

- **Robust percentiles** — black/white now come from the **2nd / 98th** luminance
  percentiles (was 1%/99%), so the brightest/darkest ~2% of pixels (hot/dead
  pixels, specular glints, a black surround) are treated as outliers and never
  define the mapping. Helper: `robustBlackWhitePoints`.
- **Range floor** `kMinToneRange / MIN_TONE_RANGE = 0.10` — floors the slope
  (≤ 10×) so a flat/low-contrast capture can't be amplified to white; the worst
  case is a low-contrast but still-visible image, never blank. A degenerate
  (single-bin) histogram also gets a guaranteed minimum black↔white separation.
- **Midtone-lift gamma** `kToneGamma / TONE_GAMMA = 0.8` (was `1/midPoint = 2.0`).
  The legacy pow-2.0 was a midtone-*darkening* curve that only looked right
  because the old additive brightness over-brightened first; with that removed it
  would *crush* the levels-stretched midtones. A brightening power < 1 lifts
  midtones for the clean lab-scan look (FilmBox/Kodak) and stays white-out-safe
  (`pow(v,<1)` keeps [0,1] within [0,1]). Contrast `1.1` unchanged.
- **Stage order** is now: bounded levels remap → contrast(1.1) → gamma(0.8).
  iOS uses `CIColorMatrix` (slope+bias on the **linear** image) → `CIColorControls`
  → `CIGammaAdjust`; Android applies all three in **sRGB-encoded** space per pixel
  (`toneMap`). This is the SAME accepted linear-vs-sRGB tone-domain split already
  documented below for the negative curve and `normalizeSlide` — iOS authoritative.

### 2. Orange-mask division guard (`removeOrangeMask`, `densitiesFromBase`,
`estimateMaskFromDarkRegions`)

A contaminated or near-white film-base sample could drive a channel density → 0,
making the downstream `1/density` compensation gain → ∞ and blowing the frame to
white. Now:

- Every post-invert base channel is **floored to `kMinBaseDensity = 0.05`**
  *before* the red-normalized ratios are taken (shared `clampDensity`), and the
  derived green/blue densities are clamped into `[0.05, 1]`. (Replaces the old
  `max(r, 0.0001)` near-zero floor that still permitted runaway gains.)
- The final per-channel compensation gains are **capped at `kMaxMaskGain = 3.0`**
  in `removeOrangeMask`, so even a bounded-but-large ratio can't over-amplify.
- The blue-normaliser is guarded (`max(blueComp, 1e-4)`).

These bound the mask step end-to-end while still neutralising a real orange cast.

### 3. Better, contamination-resistant film-base sampling (`sampleFilmBaseColor`)

To "sample the orange max-density rebate reliably; resist a bright background":

- **Exclude near-clipped pixels** — candidates now require `120 < luma < 250`
  (`kBaseMaxLuma / BASE_MAX_LUMA = 250`). The unexposed C-41 base photographs as a
  *bright-but-not-blown* orange; a fully-clipped region is the light source or a
  bright surround bleeding around the frame, not the dense base. (Note pure-white
  surrounds were already rejected by the `R>G+10, G>B+5` orange test; this also
  drops bright *warm* backgrounds.)
- **Rank by orange strength `R−B`** (was raw luminance) — the 100 averaged base
  pixels are now the most-saturated-orange ones, so the dense rebate wins over a
  merely-bright, weakly-warm background that scraped past the ordering test.

`estimateFilmBaseNeutral` consumes the same improved sampler, so its `{warmth,
tint}` suggestion benefits too (mapping/gains unchanged).

> The pipeline is now **structurally incapable of an all-white output**: gray-world
> gains are clamped [0.5, 2.0]; the mask gains are capped at 3.0; the tone remap
> pins white at exactly 1.0; the lift gamma (`<1`) and contrast (`1.1`) both keep
> [0,1] within [0,1]. The worst case is a flat-but-usable frame.

**`slide` is byte-for-byte unchanged** (it uses `normalizeSlide`, still 1%/99%,
untouched, and never calls the orange-mask or negative tone path). **`bw` shares
the negative tone path**, so it gains the same white-out robustness + cleaner
tone — an intentional improvement (a B&W negative could blow out the same way),
not a regression; its grayscale collapse and all other stages are unchanged.

> **⚠ verify on device:** that a real C-41 frame now yields a natural, non-blown
> positive; that the lift gamma (0.8) and the 2%/98% points give a pleasing
> (not flat, not crushed) result on a range of exposures; and that the
> contamination guard still leaves the film-base estimate accurate on scans with
> a genuine visible rebate. The new constants (`kMinToneRange 0.10`,
> `kToneGamma 0.8`, `kMinBaseDensity 0.05`, `kMaxMaskGain 3.0`, `kBaseMaxLuma 250`)
> are conservative first choices and may want tuning against real captures.

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
   Android: a pre-invert channel copy + 10% stride). Collect orange-base
   candidates: `R > G+10`, `G > B+5`, and `120 < luma < 250` (0–255) — the upper
   bound (`kBaseMaxLuma`) **excludes near-clipped pixels** so a bright surround /
   light source bleeding around the frame can't contaminate the estimate.
   Average the **100 most-orange** such pixels, ranked by orange strength `R−B`
   (was raw luminance) → the film-base colour.
2. Convert the base to the existing **post-invert density convention**
   (`density = 1 − base`, normalized to red), now with every channel **floored to
   `kMinBaseDensity = 0.05`** and the ratios clamped into `[0.05, 1]` (white-out
   guard) before the downstream `CIColorMatrix`/gain-removal step (gains capped at
   `kMaxMaskGain = 3.0`, + `−0.05·strength` bias on R,G).
3. If fewer than 100 convincing base pixels are found (e.g. borderless crop,
   B&W mis-tagged, no rebate visible), **fall back** to the legacy darkest-region
   method (post-invert, BT.601 luma < 51, avg 100 darkest, same density floor).
   Deterministic.

Both platforms use identical thresholds, floors/caps, and the identical density
derivation. See "White-out fix + tone/film-base robustness" above for the
rationale.

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
   *(Updated this round: an upper luma bound of 250 and `R−B` orange-strength
   ranking were added, plus density floors/gain caps — see "White-out fix +
   tone/film-base robustness" above.)*

3. **`maxDimension` reduced-resolution fast path** — optional longer-edge cap.
   Android downscales the bitmap before the FloatArray passes (OOM guard); iOS
   Lanczos-scales at pipeline entry. Default (unset/≤0) is unchanged full-res.
   **⚠ verify on device:** that a preview at e.g. `maxDimension: 1536` is visually
   consistent with the full-res commit (auto-stages run on the smaller image, so
   the mask/gray-world/tone statistics are computed at preview resolution — minor
   tonal drift between preview and commit is expected and acceptable, as with the
   existing Adjust-screen fast path).

## Film-engine extensions (this round): film-base neutral, LUT seam, averageFrames

Three additive features, implemented on **both** platforms in algorithmic parity.
None changes any existing output: `processNegative` with no `lut` is byte-for-byte
unchanged, and the two new methods are independent entry points.

### 1. `estimateFilmBaseNeutral(uri) → { warmth, tint, found }`

A one-tap **"neutralize from film base"** suggestion. Both platforms refactored the
existing brightest-orange film-base logic into a shared sampler
(`sampleFilmBaseColor`) used by **both** the orange-mask estimator and this new
method, so the two features agree on the base region:

- **iOS** linearizes the input, renders a 10% Lanczos downsample to sRGB bytes,
  and averages the **100 most-orange** base pixels (`R>G+10`, `G>B+5`,
  `120<luma<250` on 0–255), ranked by orange strength `R−B`.
- **Android** linearizes the decoded bitmap and walks a ~10% nearest-neighbour
  stride over the pre-invert channels with the **same** thresholds and `R−B`
  ranking, averaging the same 100.

(The upper luma bound and `R−B` ranking were added this round — see "White-out
fix + tone/film-base robustness" — to resist a bright surround contaminating the
base. The mapping/gains below are unchanged.)

Both return the averaged base colour `(R,G,B)` in sRGB-encoded [0,1]; if fewer than
100 convincing base pixels exist (B&W mis-tag, borderless crop, no rebate) they
return **`found: false`** with `warmth = tint = 0` and the UI leaves the sliders
untouched. **Deterministic** — same image ⇒ same suggestion.

**Base-RGB → warmth/tint mapping** (identical on both platforms, gains
`kBaseWarmthGain = 1.5`, `kBaseTintGain = 2.0`):

```
Y          = 0.299·R + 0.587·G + 0.114·B            (base luminance; clamped ≥ 1e-4)
warmExcess = (R − B) / Y                            (≥ 0 for a normal orange base)
greenBias  = (G − (R + B)/2) / Y                    (> 0 ⇒ base leans green)

warmth     = clamp(−warmExcess · 1.5,  −1, +1)      (NEGATIVE = cooler, counters the warm base)
tint       = clamp( greenBias  · 2.0,  −1, +1)      (sign per CITemperatureAndTint: + = magenta, − = green)
```

These are in the **same units the existing `warmth` slider uses** (it maps to a
4500–8500 K colour temperature via `CITemperatureAndTint`, neutral `6500 + warmth·2000`),
so the result can be fed straight into `ProcessParams.warmth` / a future tint slider
or used to seed `applyUserAdjustments`. The values describe the correction to
*apply* (to neutralise the base), not the base colour itself. A colour-negative
base is warm/orange, so `warmth` is normally negative.

> **⚠ verify on device:** that the suggested warmth/tint actually neutralise a real
> C-41 frame's cast when applied (the mapping is a deterministic heuristic, not a
> rigorous chromatic-adaptation transform). The two gains (1.5 / 2.0) and the
> normalize-by-Y choice are conservative first estimates and will likely want tuning
> against real captures. Also confirm iOS and Android suggest *close* values on the
> same negative — the only divergence source is the shared sampler's
> Lanczos-vs-nearest-neighbour downsample (same caveat as the orange mask).

### 2. LUT hook scaffold (`ProcessParams.lut?`, `applyLut` stage)

`ProcessParams` gains an optional `lut?: string` (bundled-LUT id or `.cube` file
URI). A new **Step 9 `applyLut`** stage runs as the final colour stage — after the
tone curve + user adjustments, **before** the sRGB encode — on **both** platforms.
It is an **identity NO-OP today**: an unset/empty/unrecognised `lut` returns the
image unchanged, so current behaviour is fully preserved. `index.ts` defaults the
field to `""`. Each platform carries a `TODO(lut)` describing exactly how a real
3-D LUT sampler slots in (iOS `CIColorCube` / `CIColorCubeWithColorSpace`; Android
trilinear interpolation over a parsed cube), sampled at this same point. **No real
`.cube` parsing is implemented** — this is only the seam so the JS film-profiles can
start passing a `lut` later.

> **⚠ verify on device** (only once a real sampler lands): that the chosen sampling
> domain (linear vs sRGB) matches between platforms. Today there is nothing to
> verify visually — the stage is provably a pass-through.

### 3. `averageFrames(uris) → ProcessResult` (multi-shot denoise)

Decodes N same-size frames and outputs their **per-pixel mean**, reducing random
sensor noise by ≈ √N — a phone take on SilverFast Multi-Exposure.

- **iOS** renders each frame to an sRGB RGBA8 bitmap and accumulates into a single
  `[UInt32]` running sum (via a `withUnsafeMutableBytes`-bound `CGContext`), then
  divides once and builds the output `CGImage`.
- **Android** is **memory-light**: it holds three `IntArray` running sums plus a
  single reused pixel buffer and **at most one decoded frame at a time** — each
  frame is `getPixels`-accumulated then recycled before the next, so it never
  materialises N float/bitmap buffers. (255·N fits in `Int`/`UInt32` for any
  realistic N.)

If the frames are **not all the same pixel size**, or **N < 2**, the **first** image
is returned unchanged (re-encoded to the cache, so the return shape is always a
fresh `ProcessResult`).

> **IMPORTANT — alignment limitation (documented TODO):** `averageFrames` performs
> **NO image alignment**. It assumes the frames are **already pixel-aligned** (tripod
> / copy-stand, or pre-registered upstream). **Handheld bursts will ghost/blur** —
> registering them (feature-matching / homography) is intentionally out of scope and
> is a tracked TODO in both sources and the JS doc.
>
> **⚠ verify on device:** noise reduction on a set of aligned tripod frames (expect a
> visibly cleaner result, ≈ √N), and confirm the size-mismatch / N<2 fallbacks return
> the first frame intact. A JPEG round-trip on each decode adds a little of its own
> noise on iOS (frames are re-rendered through Core Image); if maximum denoise quality
> matters, prefer feeding losslessly-decoded sources.

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
- **`lut` (LUT look)** — scaffold only; both platforms are an identity NO-OP until a
  real `.cube` sampler lands (`TODO(lut)` in both sources). Setting `lut` has no visual
  effect today by design.
- **`averageFrames` alignment** — neither platform aligns the input frames; both assume
  pre-aligned (tripod) frames. Handheld bursts ghost. Registration is a tracked TODO.
  iOS re-renders each frame through Core Image (a JPEG-decode → CIImage round-trip),
  Android accumulates decoded ARGB pixels directly; both compute the same per-pixel mean.

## Tone / color-space notes worth a device A/B (not bugs)

- The negative tone curve (post white-out fix) is a `CIColorMatrix` slope+bias
  **levels remap** → `CIColorControls` contrast → `CIGammaAdjust` lift gamma.
  iOS runs all three in its **linear** working space; the Kotlin applies the same
  three steps in **sRGB-encoded** space (it round-trips per pixel in `toneMap`).
  Both follow the same intent but can differ slightly in midtone roll-off. If a
  visible mismatch appears, align the Kotlin `toneMap` domain to whichever the
  reference produced — iOS is authoritative. (The black/white points are derived
  from an sRGB-encoded luminance histogram on both — see the white-out section.)
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
