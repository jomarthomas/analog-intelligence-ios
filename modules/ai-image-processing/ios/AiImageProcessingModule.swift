//
//  AiImageProcessingModule.swift
//  ai-image-processing (local Expo module)
//
//  Negative → positive film-scanning engine for Analog Intelligence.
//
//  This is a faithful Core Image port of the proven legacy iOS pipeline:
//    legacy-ios/Processing/Pipeline/ImageProcessor.swift       (orchestration)
//    legacy-ios/Processing/Pipeline/NegativeInverter.swift     (inversion)
//    legacy-ios/Processing/Pipeline/OrangeMaskEstimator.swift  (orange mask)
//    legacy-ios/Processing/Pipeline/ColorCorrector.swift       (normalize + tone)
//    legacy-ios/Processing/Pipeline/UserAdjustments.swift      (exposure/warmth/…)
//    legacy-ios/Processing/Pipeline/ExportManager.swift        (encode/export)
//    legacy-ios/Processing/Metrics/HistogramAnalyzer.swift     (analyzeHistogram)
//
//  The Core Image filter graph mirrors the legacy code 1:1; only the surface
//  (Expo Modules API + file in / file out) differs. Each step below is
//  annotated with the legacy file/function it was ported from.
//

import ExpoModulesCore
import CoreImage
import CoreImage.CIFilterBuiltins
import ImageIO
import UIKit
import Vision

// MARK: - Errors

internal final class ImageNotFoundException: Exception {
  override var reason: String { "Could not load the input image" }
}

internal final class ImageRenderFailedException: Exception {
  override var reason: String { "Failed to render the processed image" }
}

internal final class ImageWriteFailedException: Exception {
  override var reason: String { "Failed to write the processed image to disk" }
}

/// Thrown when `exportFormat: 'dng'` is requested on Android (DECISIONS Q2).
/// On iOS this is never thrown — DNG is handled by VisionCamera RAW capture,
/// not by this module's post-processing export path.
internal final class UnsupportedFormatException: Exception {
  override var reason: String {
    "DNG export is not supported on this platform. Use 'heic' or 'jpeg'."
  }
}

// MARK: - Parameters record (mirrors src/AiImageProcessing.types.ts ProcessParams)

internal struct ProcessParams: Record {
  @Field var exposure: Double = 0
  @Field var warmth: Double = 0
  @Field var contrast: Double = 0
  @Field var mode: String = "color"          // "color" | "bw" | "slide"
  @Field var removeOrangeMask: Bool = true
  @Field var sharpen: Double = 0
  @Field var aiColor: Bool = false
  @Field var aiDustRemoval: Bool = false
  // Optional reduced-resolution cap (longer-edge px). <= 0 ⇒ full resolution.
  // Live-preview fast path: Core Image is GPU-tiled so we honour this with a
  // Lanczos scale at pipeline entry. See AiImageProcessing.types.ts.
  @Field var maxDimension: Double = 0
  @Field var saturation: Double = 0
  @Field var highlights: Double = 0
  @Field var shadows: Double = 0
  @Field var vibrance: Double = 0
  // Optional LUT selector (bundled-LUT id or .cube file URI). Empty/unknown ⇒
  // the `applyLut` stage is a NO-OP (identity). See TODO(lut) in runPipeline.
  @Field var lut: String = ""
}

// MARK: - UserAdjustParams record (mirrors src/AiImageProcessing.types.ts UserAdjustParams)
// Task #10: fast-path adjustment record — only the seven user-facing sliders.
// All fields default to 0 (no change) so every field is optional from the JS
// side (index.ts fills them before crossing the bridge).

internal struct UserAdjustParams: Record {
  @Field var exposure: Double = 0
  @Field var warmth: Double = 0
  @Field var contrast: Double = 0
  @Field var saturation: Double = 0
  @Field var highlights: Double = 0
  @Field var shadows: Double = 0
  @Field var vibrance: Double = 0
}

// MARK: - Module

public class AiImageProcessingModule: Module {
  // Core Image context configured exactly as the legacy `ImageProcessor`:
  // work in LINEAR sRGB (so colour math — divide-out mask, channel gains — is
  // correct) and output sRGB. GPU renderer. See ImageProcessor.swift `ciContext`.
  private let ciContext: CIContext = {
    let options: [CIContextOption: Any] = [
      .workingColorSpace: CGColorSpace(name: CGColorSpace.linearSRGB)!,
      .outputColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
      .useSoftwareRenderer: false
    ]
    return CIContext(options: options)
  }()

  // A separate sRGB context for histogram pixel reads, matching
  // HistogramAnalyzer.swift which renders into an sRGB bitmap.
  private let srgbContext = CIContext(options: [
    .workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!
  ])

  public func definition() -> ModuleDefinition {
    Name("AiImageProcessing")

    // MARK: processNegative(inputUri, params) -> ProcessResult
    AsyncFunction("processNegative") { (inputUri: String, params: ProcessParams) -> [String: Any] in
      guard let input = self.loadCIImage(from: inputUri) else {
        throw ImageNotFoundException()
      }

      let output = try self.runPipeline(input: input, params: params)

      // Render to a CGImage and write a JPEG into the cache directory,
      // mirroring ExportManager.exportImage (JPEG @ quality 0.95).
      guard let cgImage = self.ciContext.createCGImage(output, from: output.extent) else {
        throw ImageRenderFailedException()
      }
      let uri = try self.writeJPEG(cgImage: cgImage, quality: 0.95)

      return [
        "uri": uri,
        "width": cgImage.width,
        "height": cgImage.height
      ]
    }

    // MARK: analyzeHistogram(uri) -> Histogram
    AsyncFunction("analyzeHistogram") { (uri: String) -> [String: Any] in
      guard let image = self.loadCIImage(from: uri),
            let cgImage = self.srgbContext.createCGImage(image, from: image.extent) else {
        throw ImageNotFoundException()
      }
      return self.computeHistogram(cgImage: cgImage)
    }

    // MARK: applyUserAdjustments(baseUri, params) -> ProcessResult   [Task #10]
    //
    // Fast path for the live Adjust-screen preview. Loads the already-processed
    // positive from `baseUri` and runs ONLY the user-adjustment stage (step 7
    // of the full pipeline), skipping linearize / invert / orange-mask /
    // normalise / tone-curve entirely. This mirrors the legacy behaviour where
    // the Adjust screen re-applies `UserAdjustments.applyAdjustments` on an
    // already-rendered positive without re-running the full pipeline.
    AsyncFunction("applyUserAdjustments") { (baseUri: String, params: UserAdjustParams) -> [String: Any] in
      guard let input = self.loadCIImage(from: baseUri) else {
        throw ImageNotFoundException()
      }
      let output = self.applyUserAdjustmentsOnly(image: input, params: params)
      guard let cgImage = self.ciContext.createCGImage(output, from: output.extent) else {
        throw ImageRenderFailedException()
      }
      let uri = try self.writeJPEG(cgImage: cgImage, quality: 0.92)
      return [
        "uri": uri,
        "width": cgImage.width,
        "height": cgImage.height
      ]
    }

    // MARK: detectFilmFrame(uri) -> FrameDetectionResult   [Task #10]
    //
    // Uses VNDetectRectanglesRequest (Vision framework) to locate the film-frame
    // boundary in a captured image. Parameters are tuned for 35 mm film:
    //   - aspect ratio 0.6 … 0.7  (~2:3 portrait frame)
    //   - minimum coverage 30 % of the image
    //   - minimum confidence 0.7
    // Ported from legacy-ios/Vision/FrameDetector.detectFilmFrame.
    //
    // NOTE: VNImageRequestHandler.perform(_:) is synchronous and blocks the
    // calling thread. Expo's AsyncFunction already dispatches the closure to a
    // background thread, so blocking here is safe and matches the existing
    // pattern used by processNegative (which also blocks on ciContext.render).
    AsyncFunction("detectFilmFrame") { (uri: String) -> [String: Any] in
      guard let image = self.loadCIImage(from: uri) else {
        throw ImageNotFoundException()
      }
      return try self.detectFilmFrameVision(image: image)
    }

    // MARK: estimateFilmBaseNeutral(uri) -> { warmth, tint, found }
    //
    // Sample the unexposed film base/rebate (the brightest orange max-density
    // region, via the shared `sampleFilmBaseColor`) and return a SUGGESTED
    // white-balance correction in the app's slider units. Powers a one-tap
    // "neutralize from film base" button. Reads the RAW pre-processing frame
    // (orientation applied), the same pixels the inversion would consume.
    AsyncFunction("estimateFilmBaseNeutral") { (uri: String) -> [String: Any] in
      guard let input = self.loadCIImage(from: uri) else {
        throw ImageNotFoundException()
      }
      // Match the pipeline's pre-invert domain: linearize, then sample. The
      // sampler renders to sRGB bytes internally for its 0–255 thresholds, so
      // this mirrors the pipeline's film-base read exactly.
      let linear = self.linearize(input)
      return self.estimateFilmBaseNeutral(preInvert: linear)
    }

    // MARK: averageFrames(uris) -> { uri, width, height }
    //
    // Multi-shot denoise: decode N same-size frames and output their per-pixel
    // MEAN (≈ √N sensor-noise reduction — a phone take on SilverFast
    // Multi-Exposure). If sizes differ or N < 2, the first frame is returned
    // unchanged. ASSUMES THE FRAMES ARE ALREADY ALIGNED — no registration is
    // performed here (handheld bursts will ghost; alignment is a documented TODO).
    AsyncFunction("averageFrames") { (uris: [String]) -> [String: Any] in
      return try self.averageFrames(uris: uris)
    }
  }

  // MARK: - Input loading

  /// Accepts `file://` URIs, plain file paths, and asset/ph URLs that
  /// `CIImage(contentsOf:)` understands. Orientation from EXIF is applied.
  private func loadCIImage(from uri: String) -> CIImage? {
    let url: URL
    if uri.hasPrefix("file://") || uri.contains("://") {
      guard let parsed = URL(string: uri) else { return nil }
      url = parsed
    } else {
      url = URL(fileURLWithPath: uri)
    }
    return CIImage(contentsOf: url, options: [.applyOrientationProperty: true])
  }

  // MARK: - Pipeline (ImageProcessor.processNegative, steps 2–8)

  private func runPipeline(input: CIImage, params: ProcessParams) throws -> CIImage {
    // "slide" is an already-POSITIVE E-6 source; "bw" and "color" are negatives.
    let isSlide = params.mode == "slide"
    let isColor = params.mode == "color"          // bw and slide are not "color"
    var image = input

    // Step 0 — optional reduced-resolution fast path (live preview / OOM guard).
    // Core Image is GPU-tiled, so a Lanczos downscale here is cheap and keeps
    // every subsequent auto-stage (mask sampling, gray-world, tone CDF) working
    // on the same smaller image — which is exactly the preview semantics we want.
    image = applyMaxDimension(image, maxDimension: params.maxDimension)

    // Step 2 — Convert to linear RGB.
    // ImageProcessor.convertToLinearRGB uses CILinearToSRGBToneCurve.
    image = linearize(image)

    if isSlide {
      // --- Slide / E-6 positive path ---------------------------------------
      // The source is already a positive: SKIP inversion AND orange-mask
      // removal, and SKIP the negative-oriented gray-world + auto-tone-curve
      // (those assume an inverted negative and would crush a correctly-exposed
      // slide). Instead apply one gentle black/white-point normalization, then
      // the user adjustments and sharpen. (legacy FilmType.slide intent.)
      image = normalizeSlide(image: image)
    } else {
      // --- Colour / B&W negative path (unchanged) --------------------------
      // Capture the linearized (and, if requested, downscaled) PRE-invert image
      // so the film-base sampler reads the same pixels the inversion consumes —
      // the brightest orange max-density base lives here.
      let preInvert = image

      // Step 3 — Invert negative.
      // NegativeInverter.invertColorNegative / invertBlackAndWhite → CIColorInvert.
      image = invert(image)

      // Step 4 — Estimate + remove orange mask (colour negatives only).
      // OrangeMaskEstimator.removeOrangeMask.
      if isColor && params.removeOrangeMask {
        // Film-base (rebate) sampling reads the PRE-INVERT image so the brightest
        // orange max-density base is available; the post-invert `image` is the
        // dark-region fallback source.
        let mask = estimateOrangeMask(image: image, preInvert: preInvert)
        image = removeOrangeMask(image: image, mask: mask)
      }

      // Step 5 — Normalize colour channels (gray-world).
      // ColorCorrector.normalizeChannels.
      image = normalizeChannels(image: image)

      // Step 6 — Automatic tone correction (histogram CDF → levels + gamma).
      // ColorCorrector.applyToneCorrection.
      image = applyToneCorrection(image: image)
    }

    // Step 7 — User adjustments (exposure/highlights+shadows/contrast/warmth/
    // saturation/vibrance), in the legacy order. UserAdjustments.applyAdjustments.
    // Applied for ALL modes including slide.
    image = applyUserAdjustments(image: image, params: params)

    // B&W: collapse to luminance after tone/colour work so any residual cast
    // is removed (legacy treats B&W as colourless; the dedicated desaturate
    // here is the cross-platform-equivalent of selecting FilmType.blackAndWhite).
    // Slide is a colour positive, so it is NOT desaturated.
    if params.mode == "bw" {
      image = desaturate(image)
    }

    // Step 8 — Sharpen. ImageProcessor.applySharpen → CISharpenLuminance.
    image = sharpen(image: image, amount: Float(params.sharpen))

    // Step 9 — LUT "look" (film-emulation). Identity NO-OP scaffold today; see
    // applyLut for the TODO(lut) wiring of a real 3D-LUT sampler. Runs as the
    // final colour stage, AFTER the tone curve + user adjustments and BEFORE
    // the sRGB encode, so a future `.cube` is sampled on the corrected positive.
    image = applyLut(image: image, lut: params.lut)

    // Convert back to sRGB for display/export.
    // NOTE: ImageProcessor names this `convertToSRGB` but applies
    // CISRGBToneCurveToLinear — we honour the *intent* (encode for sRGB output)
    // which is also what the sRGB output colour space of `ciContext` enforces
    // at render time. We mirror the legacy filter call for parity.
    image = encodeForSRGB(image)

    return image
  }

  // MARK: Step 9 — LUT look (scaffold; identity NO-OP)

  /// Apply a 3D-LUT colour "look" as the final colour stage of the pipeline.
  ///
  /// **Scaffold only.** Today this is an identity pass-through: an empty or
  /// unrecognised `lut` returns `image` unchanged, so existing behaviour is
  /// byte-for-byte preserved. The seam exists so the JS film-profiles can pass
  /// `ProcessParams.lut` (a bundled-LUT id or a `.cube` file URI) ahead of a
  /// real sampler landing here.
  ///
  /// TODO(lut): implement real 3D-LUT sampling.
  ///   1. Resolve `lut`: a bundled id → a packaged `.cube` in the app bundle; a
  ///      `file://`/path → load that `.cube`. Parse the cube (size N, the
  ///      N·N·N RGB triplets, plus DOMAIN_MIN/MAX) into a Data buffer laid out
  ///      as Core Image expects: BGRA Float32, R fastest-varying.
  ///   2. Feed it to `CIColorCube` (or `CIColorCubeWithColorSpace`, passing
  ///      `workingColorSpace` so the LUT is sampled in this pipeline's linear
  ///      space) with `inputCubeDimension = N` and `inputCubeData = buffer`.
  ///      That filter slots in EXACTLY here — after the tone curve + user
  ///      adjustments, before `encodeForSRGB` — so the look is applied to the
  ///      fully-corrected positive, matching how a desktop scanner applies a
  ///      film LUT last. Cache parsed cubes by id/URI to avoid re-parsing.
  ///   3. Mirror the same resolution + sampling on Android (see its applyLut).
  /// Until then, callers may set `lut` freely with no visual effect.
  private func applyLut(image: CIImage, lut: String) -> CIImage {
    let id = lut.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !id.isEmpty, let look = self.filmLook(for: id) else { return image }
    // Generate a 17³ colour cube from the look and apply it with CIColorCube,
    // which slots in exactly here (linear working space, post-tone, pre-encode).
    let dim = 17
    let data = self.generateCubeData(dimension: dim, look: look)
    guard let filter = CIFilter(name: "CIColorCube") else { return image }
    filter.setValue(image, forKey: kCIInputImageKey)
    filter.setValue(dim, forKey: "inputCubeDimension")
    filter.setValue(data, forKey: "inputCubeData")
    return filter.outputImage ?? image
  }

  /// A parametric film "look": COLOUR grading applied as a 3D LUT (the
  /// cross-channel science sliders can't express). Tone stays with the pipeline
  /// curve; this shapes colour only — saturation + luma-weighted split-tone.
  private struct FilmLook {
    let saturation: Float
    let shadowR: Float; let shadowG: Float; let shadowB: Float
    let highR: Float; let highG: Float; let highB: Float
  }

  /// Look table. MUST stay in sync with Android's `filmLook` for parity.
  private func filmLook(for id: String) -> FilmLook? {
    switch id {
    case "portra", "portra400":
      return FilmLook(saturation: 0.94, shadowR: 0.010, shadowG: 0.004, shadowB: -0.010, highR: 0.022, highG: 0.006, highB: -0.020)
    case "frontier":
      return FilmLook(saturation: 1.08, shadowR: -0.012, shadowG: 0.000, shadowB: 0.028, highR: 0.020, highG: 0.006, highB: -0.018)
    case "noritsu":
      return FilmLook(saturation: 1.04, shadowR: 0.000, shadowG: 0.000, shadowB: 0.010, highR: 0.012, highG: 0.004, highB: -0.010)
    case "gold", "gold200":
      return FilmLook(saturation: 1.05, shadowR: 0.018, shadowG: 0.004, shadowB: -0.018, highR: 0.030, highG: 0.014, highB: -0.030)
    case "ektar", "ektar100":
      return FilmLook(saturation: 1.16, shadowR: -0.008, shadowG: 0.000, shadowB: 0.012, highR: 0.010, highG: 0.000, highB: -0.012)
    default:
      return nil
    }
  }

  /// Build CIColorCube data: N·N·N RGBA Float32, red fastest-varying, each grid
  /// point passed through the look transform. Mirrors Android's cube generation.
  private func generateCubeData(dimension dim: Int, look: FilmLook) -> Data {
    var cube = [Float](repeating: 0, count: dim * dim * dim * 4)
    let denom = Float(dim - 1)
    var o = 0
    for bi in 0..<dim {
      let b = Float(bi) / denom
      for gi in 0..<dim {
        let g = Float(gi) / denom
        for ri in 0..<dim {
          let r = Float(ri) / denom
          let out = applyFilmLook(r: r, g: g, b: b, look: look)
          cube[o] = out.0; cube[o + 1] = out.1; cube[o + 2] = out.2; cube[o + 3] = 1.0
          o += 4
        }
      }
    }
    return cube.withUnsafeBufferPointer { Data(buffer: $0) }
  }

  /// Shared per-colour film-look transform (saturation + luma-weighted
  /// split-tone), clamped to [0,1]. MUST match Android's `applyFilmLook`.
  private func applyFilmLook(r: Float, g: Float, b: Float, look: FilmLook) -> (Float, Float, Float) {
    let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    var nr = lum + (r - lum) * look.saturation
    var ng = lum + (g - lum) * look.saturation
    var nb = lum + (b - lum) * look.saturation
    let sw = (1 - lum) * (1 - lum)
    let hw = lum * lum
    nr += look.shadowR * sw + look.highR * hw
    ng += look.shadowG * sw + look.highG * hw
    nb += look.shadowB * sw + look.highB * hw
    return (min(max(nr, 0), 1), min(max(ng, 0), 1), min(max(nb, 0), 1))
  }

  // MARK: Step 0 — optional reduced-resolution scaling (maxDimension)

  /// Downscale `image` so its longer edge is at most `maxDimension` px, using
  /// CILanczosScaleTransform (aspect-preserving). `maxDimension <= 0` or an
  /// image already within the cap is returned unchanged. Core Image is
  /// GPU-tiled, so this is the iOS analogue of the Android pre-pass bitmap
  /// downscale and powers the live-preview fast path.
  private func applyMaxDimension(_ image: CIImage, maxDimension: Double) -> CIImage {
    guard maxDimension > 0 else { return image }
    let extent = image.extent
    let longer = max(extent.width, extent.height)
    guard longer.isFinite, longer > CGFloat(maxDimension) else { return image }

    let scale = CGFloat(maxDimension) / longer
    let f = CIFilter(name: "CILanczosScaleTransform")!
    f.setValue(image, forKey: kCIInputImageKey)
    f.setValue(scale, forKey: kCIInputScaleKey)
    f.setValue(1.0, forKey: kCIInputAspectRatioKey)
    return f.outputImage ?? image
  }

  // MARK: Slide normalization (gentle positive black/white-point stretch)

  /// Gentle normalization for an already-positive slide. Unlike the negative
  /// `applyToneCorrection` (which applies an aggressive brightness=log2(1/range)
  /// + contrast + gamma to recover an inverted negative), this only stretches
  /// the 1%/99% luminance points to [0,1] with NO added contrast/gamma — a
  /// correctly-exposed E-6 frame should be largely preserved. Operates on the
  /// linear-light image; reads the histogram in sRGB-encoded bins to match the
  /// CIAreaHistogram conventions used elsewhere.
  private func normalizeSlide(image: CIImage) -> CIImage {
    let extent = image.extent
    let hist = CIFilter(name: "CIAreaHistogram")!
    hist.setValue(image, forKey: kCIInputImageKey)
    hist.setValue(CIVector(cgRect: extent), forKey: "inputExtent")
    hist.setValue(256, forKey: "inputCount")
    guard let histOut = hist.outputImage else { return image }

    var data = [UInt8](repeating: 0, count: 256 * 4)
    ciContext.render(
      histOut,
      toBitmap: &data,
      rowBytes: 256 * 4,
      bounds: histOut.extent,
      format: .RGBA8,
      colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
    )

    var total: Float = 0
    for bin in 0..<256 {
      let r = Float(data[bin * 4]); let g = Float(data[bin * 4 + 1]); let b = Float(data[bin * 4 + 2])
      total += 0.299 * r + 0.587 * g + 0.114 * b
    }
    var blackPoint: Float = 0
    var whitePoint: Float = 1.0
    var cumulative: Float = 0
    let safeTotal = max(total, 1.0)
    for bin in 0..<256 {
      let r = Float(data[bin * 4]); let g = Float(data[bin * 4 + 1]); let b = Float(data[bin * 4 + 2])
      cumulative += 0.299 * r + 0.587 * g + 0.114 * b
      let cdf = cumulative / safeTotal
      if cdf >= 0.01 && blackPoint == 0 { blackPoint = Float(bin) / 255.0 }
      if cdf >= 0.99 { whitePoint = Float(bin) / 255.0; break }
    }

    // Map [blackPoint, whitePoint] → [0, 1] as a linear slope+bias (no gamma,
    // no contrast boost). CIColorMatrix on RGB equally = a neutral level stretch.
    let range = max(whitePoint - blackPoint, 0.05)
    let slope = CGFloat(1.0 / range)
    let biasVal = CGFloat(-Double(blackPoint) / Double(range))

    let m = CIFilter(name: "CIColorMatrix")!
    m.setValue(image, forKey: kCIInputImageKey)
    m.setValue(CIVector(x: slope, y: 0, z: 0, w: 0), forKey: "inputRVector")
    m.setValue(CIVector(x: 0, y: slope, z: 0, w: 0), forKey: "inputGVector")
    m.setValue(CIVector(x: 0, y: 0, z: slope, w: 0), forKey: "inputBVector")
    m.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")
    m.setValue(CIVector(x: biasVal, y: biasVal, z: biasVal, w: 0), forKey: "inputBiasVector")
    return m.outputImage ?? image
  }

  // MARK: Step 2 — linearize

  private func linearize(_ image: CIImage) -> CIImage {
    let f = CIFilter(name: "CILinearToSRGBToneCurve")!
    f.setValue(image, forKey: kCIInputImageKey)
    return f.outputImage ?? image
  }

  private func encodeForSRGB(_ image: CIImage) -> CIImage {
    let f = CIFilter(name: "CISRGBToneCurveToLinear")!
    f.setValue(image, forKey: kCIInputImageKey)
    return f.outputImage ?? image
  }

  // MARK: Step 3 — invert (NegativeInverter)

  private func invert(_ image: CIImage) -> CIImage {
    let f = CIFilter(name: "CIColorInvert")!
    f.setValue(image, forKey: kCIInputImageKey)
    return f.outputImage ?? image
  }

  // MARK: Step 4 — orange mask (OrangeMaskEstimator)

  private struct OrangeMask {
    var redDensity: Float
    var greenDensity: Float
    var blueDensity: Float
    var strength: Float
    static let `default` = OrangeMask(redDensity: 1.0, greenDensity: 0.65, blueDensity: 0.4, strength: 0.6)
  }

  /// Estimate the orange mask, preferring **film-base (rebate) sampling**.
  ///
  /// Pro film-scanning derives the mask from the unexposed film *base* — in a
  /// colour NEGATIVE that is the BRIGHTEST, most-saturated-orange region (max
  /// density base) of the image *before* inversion (high R, mid G, low B). This
  /// is more reliable than sampling whatever is darkest after inversion, which
  /// can be a deep shadow in the scene rather than the base.
  ///
  /// Strategy (deterministic):
  ///   1. Sample the **pre-invert** linear image, find the brightest pixels that
  ///      are clearly orange (R > G > B). Average up to the 100 brightest such
  ///      pixels → the film-base colour, then convert to the post-invert density
  ///      convention (`1 - base`) the downstream removal step already expects.
  ///   2. If no clear orange base is found (e.g. B&W mis-tagged, or a borderless
  ///      crop with no rebate), FALL BACK to the legacy method: sample the
  ///      darkest pixels of the post-invert `image` (luma < 51/255), avg 100.
  ///
  /// The returned densities feed the unchanged `removeOrangeMask` (CIColorMatrix
  /// gains + bias), so only the *source of the estimate* improves, not the math.
  ///
  /// - Parameters:
  ///   - image:     the POST-invert linear image (used by the dark fallback).
  ///   - preInvert: the PRE-invert linear image (used for film-base sampling).
  private func estimateOrangeMask(image: CIImage, preInvert: CIImage) -> OrangeMask {
    // 1) Preferred: film-base (rebate) sampling on the pre-invert image.
    if let baseMask = estimateMaskFromFilmBase(preInvert: preInvert) {
      return baseMask
    }
    // 2) Fallback: legacy darkest-region sampling on the post-invert image.
    return estimateMaskFromDarkRegions(image: image)
  }

  /// Convert a sampled film-base colour into the post-invert density convention.
  /// The legacy removal expects densities derived from the *inverted* base
  /// (i.e. `1 - base`), normalized to red. We reproduce that exactly so the
  /// CIColorMatrix step is identical to before — only the estimate is better.
  private func densitiesFromBase(baseR: Float, baseG: Float, baseB: Float) -> OrangeMask {
    // Post-invert equivalent of the base = 1 - base (clamped).
    let r = max(0, min(1, 1 - baseR))
    let g = max(0, min(1, 1 - baseG))
    let b = max(0, min(1, 1 - baseB))
    let safeR = max(r, 0.0001)
    let range = max(r, g, b) - min(r, g, b)
    return OrangeMask(
      redDensity: 1.0,
      greenDensity: g / safeR,
      blueDensity: b / safeR,
      strength: range > 0.1 ? min(1.0, range * 2.0) : 0.3
    )
  }

  /// Sample the brightest, most-saturated-orange region of the PRE-invert image
  /// (the film base). Returns nil if no convincing orange base is present so the
  /// caller can fall back to the legacy dark-region method.
  ///
  /// This is the orange-mask consumer of the shared `sampleFilmBaseColor`
  /// sampler; it forwards the averaged base colour into the unchanged
  /// `densitiesFromBase` density derivation so the removal math is identical.
  private func estimateMaskFromFilmBase(preInvert: CIImage) -> OrangeMask? {
    guard let base = sampleFilmBaseColor(preInvert: preInvert) else { return nil }
    return densitiesFromBase(baseR: base.r, baseG: base.g, baseB: base.b)
  }

  /// Shared film-base (rebate) colour sampler — the single source of truth for
  /// "where is the unexposed orange base and what colour is it".
  ///
  /// Downsamples the PRE-invert image to 10% (Lanczos), collects the bright,
  /// orange-dominant candidates (R > G > B with margin, luminance > 120/255 —
  /// the base is the brightest part of a colour negative), and averages the
  /// **100 brightest** such pixels. Returns the averaged base colour in
  /// normalized sRGB-encoded [0,1] (the same domain the 0–255 thresholds use),
  /// or nil when fewer than 100 convincing base pixels exist (non-orange scene,
  /// B&W mis-tag, or a borderless crop with no rebate).
  ///
  /// Used by BOTH `estimateMaskFromFilmBase` (orange-mask removal) and
  /// `estimateFilmBaseNeutral` (white-balance suggestion) so the two features
  /// agree on the base region. Deterministic.
  private func sampleFilmBaseColor(preInvert: CIImage) -> (r: Float, g: Float, b: Float)? {
    let extent = preInvert.extent
    guard extent.width > 0, extent.height > 0 else { return nil }

    let scale: CGFloat = 0.1
    let w = max(1, Int(extent.width * scale))
    let h = max(1, Int(extent.height * scale))

    let lanczos = CIFilter(name: "CILanczosScaleTransform")!
    lanczos.setValue(preInvert, forKey: kCIInputImageKey)
    lanczos.setValue(scale, forKey: kCIInputScaleKey)
    lanczos.setValue(1.0, forKey: kCIInputAspectRatioKey)
    let small = lanczos.outputImage ?? preInvert

    let bytesPerRow = w * 4
    var pixels = [UInt8](repeating: 0, count: w * h * 4)
    ciContext.render(
      small,
      toBitmap: &pixels,
      rowBytes: bytesPerRow,
      bounds: CGRect(x: 0, y: 0, width: w, height: h),
      format: .RGBA8,
      colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
    )

    // Collect bright, orange-dominant candidates (the film base): R > G > B with
    // a real orange spread, and high luminance (the base is the brightest part
    // of a negative). Thresholds are deterministic and intentionally strict so
    // a non-orange scene does NOT trigger this path (it falls back instead).
    var base: [(r: Float, g: Float, b: Float, lum: Float)] = []
    for i in 0..<(w * h) {
      let o = i * 4
      let r = Float(pixels[o]); let g = Float(pixels[o + 1]); let b = Float(pixels[o + 2])
      let lum = 0.299 * r + 0.587 * g + 0.114 * b
      // Orange ordering with margin, and bright enough to be the base.
      let orange = (r > g + 10) && (g > b + 5)
      if lum > 120 && orange {
        base.append((r / 255, g / 255, b / 255, lum))
      }
    }

    // Need a convincing amount of base to trust this estimate.
    guard base.count >= 100 else { return nil }

    // Average the 100 BRIGHTEST orange-base pixels (max-density base).
    base.sort { $0.lum > $1.lum }
    let samples = base.prefix(100)
    let count = Float(samples.count)
    let avgR = samples.map { $0.r }.reduce(0, +) / count
    let avgG = samples.map { $0.g }.reduce(0, +) / count
    let avgB = samples.map { $0.b }.reduce(0, +) / count

    return (avgR, avgG, avgB)
  }

  /// Legacy fallback — port of OrangeMaskEstimator.estimateOrangeMask:
  /// downsample to 10%, collect dark pixels (BT.601 luma < 51), average up to
  /// the 100 darkest, derive per-channel densities normalized to red.
  private func estimateMaskFromDarkRegions(image: CIImage) -> OrangeMask {
    let extent = image.extent
    guard extent.width > 0, extent.height > 0 else { return .default }

    let scale: CGFloat = 0.1
    let w = max(1, Int(extent.width * scale))
    let h = max(1, Int(extent.height * scale))

    // CILanczosScaleTransform — matches OrangeMaskEstimator.resizeImage.
    let lanczos = CIFilter(name: "CILanczosScaleTransform")!
    lanczos.setValue(image, forKey: kCIInputImageKey)
    lanczos.setValue(scale, forKey: kCIInputScaleKey)
    lanczos.setValue(1.0, forKey: kCIInputAspectRatioKey)
    let small = lanczos.outputImage ?? image

    let bytesPerRow = w * 4
    var pixels = [UInt8](repeating: 0, count: w * h * 4)
    ciContext.render(
      small,
      toBitmap: &pixels,
      rowBytes: bytesPerRow,
      bounds: CGRect(x: 0, y: 0, width: w, height: h),
      format: .RGBA8,
      colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
    )

    // Collect dark pixels (BT.601 luma < 0.2 → < 51/255), as in the legacy
    // sampleDarkRegions threshold.
    var dark: [(r: Float, g: Float, b: Float, lum: Float)] = []
    for i in 0..<(w * h) {
      let o = i * 4
      let r = Float(pixels[o]); let g = Float(pixels[o + 1]); let b = Float(pixels[o + 2])
      let lum = 0.299 * r + 0.587 * g + 0.114 * b
      if lum < 51 {
        dark.append((r / 255, g / 255, b / 255, lum))
      }
    }

    guard dark.count >= 100 else { return .default }

    // Average the 100 darkest, normalize densities relative to red (TECH SPEC
    // §2.3 normalizes to red; redDensity = 1.0).
    dark.sort { $0.lum < $1.lum }
    let samples = dark.prefix(100)
    let count = Float(samples.count)
    let avgR = samples.map { $0.r }.reduce(0, +) / count
    let avgG = samples.map { $0.g }.reduce(0, +) / count
    let avgB = samples.map { $0.b }.reduce(0, +) / count

    let safeR = max(avgR, 0.0001)
    let range = max(avgR, avgG, avgB) - min(avgR, avgG, avgB)
    return OrangeMask(
      redDensity: 1.0,
      greenDensity: avgG / safeR,
      blueDensity: avgB / safeR,
      strength: range > 0.1 ? min(1.0, range * 2.0) : 0.3
    )
  }

  /// Port of OrangeMaskEstimator.removeMaskColor:
  /// compensation = 1/density, normalize relative to the most-compensated
  /// (blue) channel, apply via CIColorMatrix with a small negative bias.
  private func removeOrangeMask(image: CIImage, mask: OrangeMask) -> CIImage {
    let redComp = 1.0 / max(mask.redDensity, 0.1)
    let greenComp = 1.0 / max(mask.greenDensity, 0.1)
    let blueComp = 1.0 / max(mask.blueDensity, 0.1)

    let norm = blueComp
    let redGain = CGFloat(redComp / norm)
    let greenGain = CGFloat(greenComp / norm)
    let blueGain: CGFloat = 1.0

    let m = CIFilter(name: "CIColorMatrix")!
    m.setValue(image, forKey: kCIInputImageKey)
    m.setValue(CIVector(x: redGain, y: 0, z: 0, w: 0), forKey: "inputRVector")
    m.setValue(CIVector(x: 0, y: greenGain, z: 0, w: 0), forKey: "inputGVector")
    m.setValue(CIVector(x: 0, y: 0, z: blueGain, w: 0), forKey: "inputBVector")
    m.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")
    let bias = -0.05 * CGFloat(mask.strength)
    m.setValue(CIVector(x: bias, y: bias, z: 0, w: 0), forKey: "inputBiasVector")
    return m.outputImage ?? image
  }

  // MARK: Step 5 — normalize channels (ColorCorrector, gray-world)

  /// Port of ColorCorrector.normalizeChannels: CIAreaAverage to get the mean
  /// colour, gray-world gains clamped to [0.5, 2.0], applied via CIColorMatrix.
  private func normalizeChannels(image: CIImage) -> CIImage {
    let extent = image.extent
    let avg = CIFilter(name: "CIAreaAverage")!
    avg.setValue(image, forKey: kCIInputImageKey)
    avg.setValue(CIVector(cgRect: extent), forKey: kCIInputExtentKey)
    guard let avgImage = avg.outputImage else { return image }

    var bitmap = [UInt8](repeating: 0, count: 4)
    ciContext.render(
      avgImage,
      toBitmap: &bitmap,
      rowBytes: 4,
      bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
      format: .RGBA8,
      colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
    )

    let r = Float(bitmap[0]) / 255.0
    let g = Float(bitmap[1]) / 255.0
    let b = Float(bitmap[2]) / 255.0
    let target = (r + g + b) / 3.0

    func clampGain(_ mean: Float) -> CGFloat {
      let gain = target / max(mean, 0.01)
      return CGFloat(min(max(gain, 0.5), 2.0))
    }
    let redGain = clampGain(r)
    let greenGain = clampGain(g)
    let blueGain = clampGain(b)

    let m = CIFilter(name: "CIColorMatrix")!
    m.setValue(image, forKey: kCIInputImageKey)
    m.setValue(CIVector(x: redGain, y: 0, z: 0, w: 0), forKey: "inputRVector")
    m.setValue(CIVector(x: 0, y: greenGain, z: 0, w: 0), forKey: "inputGVector")
    m.setValue(CIVector(x: 0, y: 0, z: blueGain, w: 0), forKey: "inputBVector")
    m.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")
    m.setValue(CIVector(x: 0, y: 0, z: 0, w: 0), forKey: "inputBiasVector")
    return m.outputImage ?? image
  }

  // MARK: Step 6 — automatic tone correction (ColorCorrector)

  /// Port of ColorCorrector.calculateToneCurve + applyToneCurve:
  /// build a luminance CDF from CIAreaHistogram, find 1%/99% black/white
  /// points, then apply brightness=log2(1/range), contrast=1.1, gamma=1/0.5.
  private func applyToneCorrection(image: CIImage) -> CIImage {
    let extent = image.extent
    let hist = CIFilter(name: "CIAreaHistogram")!
    hist.setValue(image, forKey: kCIInputImageKey)
    hist.setValue(CIVector(cgRect: extent), forKey: "inputExtent")
    hist.setValue(256, forKey: "inputCount")
    guard let histOut = hist.outputImage else { return image }

    var data = [UInt8](repeating: 0, count: 256 * 4)
    ciContext.render(
      histOut,
      toBitmap: &data,
      rowBytes: 256 * 4,
      bounds: histOut.extent,
      format: .RGBA8,
      colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
    )

    // Luminance-weighted CDF over the histogram bins (BT.601, matching legacy).
    var total: Float = 0
    for bin in 0..<256 {
      let r = Float(data[bin * 4]); let g = Float(data[bin * 4 + 1]); let b = Float(data[bin * 4 + 2])
      total += 0.299 * r + 0.587 * g + 0.114 * b
    }
    var blackPoint: Float = 0
    var whitePoint: Float = 1.0
    var cumulative: Float = 0
    let safeTotal = max(total, 1.0)
    for bin in 0..<256 {
      let r = Float(data[bin * 4]); let g = Float(data[bin * 4 + 1]); let b = Float(data[bin * 4 + 2])
      cumulative += 0.299 * r + 0.587 * g + 0.114 * b
      let cdf = cumulative / safeTotal
      if cdf >= 0.01 && blackPoint == 0 { blackPoint = Float(bin) / 255.0 }
      if cdf >= 0.99 { whitePoint = Float(bin) / 255.0; break }
    }

    let midPoint: Float = 0.5
    let contrast: Float = 1.1
    let inputRange = whitePoint - blackPoint
    let exposure = log2(1.0 / max(inputRange, 0.1))

    // Stage 1: brightness + contrast (CIColorControls), as in applyToneCurve.
    let levels = CIFilter(name: "CIColorControls")!
    levels.setValue(image, forKey: kCIInputImageKey)
    levels.setValue(exposure, forKey: kCIInputBrightnessKey)
    levels.setValue(contrast, forKey: kCIInputContrastKey)
    guard let leveled = levels.outputImage else { return image }

    // Stage 2: gamma (CIGammaAdjust), power = 1/midPoint.
    let gammaF = CIFilter(name: "CIGammaAdjust")!
    gammaF.setValue(leveled, forKey: kCIInputImageKey)
    gammaF.setValue(1.0 / midPoint, forKey: "inputPower")
    return gammaF.outputImage ?? leveled
  }

  // MARK: Step 7 — user adjustments (UserAdjustments.applyAdjustments order)

  private func applyUserAdjustments(image: CIImage, params: ProcessParams) -> CIImage {
    var result = image

    // 1. Exposure — CIExposureAdjust, direct EV. (applyExposure)
    if params.exposure != 0 {
      let f = CIFilter(name: "CIExposureAdjust")!
      f.setValue(result, forKey: kCIInputImageKey)
      f.setValue(Float(params.exposure), forKey: kCIInputEVKey)
      result = f.outputImage ?? result
    }

    // 2. Highlights & shadows — CIHighlightShadowAdjust. (applyHighlightsShadows)
    //    Legacy maps highlight amount = 1 - highlights, shadow amount = shadows.
    if params.highlights != 0 || params.shadows != 0 {
      let f = CIFilter(name: "CIHighlightShadowAdjust")!
      f.setValue(result, forKey: kCIInputImageKey)
      f.setValue(1.0 - Float(params.highlights), forKey: "inputHighlightAmount")
      f.setValue(Float(params.shadows), forKey: "inputShadowAmount")
      result = f.outputImage ?? result
    }

    // 3. Contrast — CIColorControls, contrast = 1 + value. (applyContrast)
    if params.contrast != 0 {
      let f = CIFilter(name: "CIColorControls")!
      f.setValue(result, forKey: kCIInputImageKey)
      f.setValue(1.0 + Float(params.contrast), forKey: kCIInputContrastKey)
      result = f.outputImage ?? result
    }

    // 4. Warmth — CITemperatureAndTint, neutral 6500 + value*2000. (applyWarmth)
    if params.warmth != 0 {
      let f = CIFilter(name: "CITemperatureAndTint")!
      f.setValue(result, forKey: kCIInputImageKey)
      let temperature = 6500.0 + (params.warmth * 2000.0)
      f.setValue(CIVector(x: CGFloat(temperature), y: 0), forKey: "inputNeutral")
      f.setValue(CIVector(x: 6500, y: 0), forKey: "inputTargetNeutral")
      result = f.outputImage ?? result
    }

    // 5. Saturation — CIColorControls, saturation = 1 + value. (applySaturation)
    if params.saturation != 0 {
      let f = CIFilter(name: "CIColorControls")!
      f.setValue(result, forKey: kCIInputImageKey)
      f.setValue(1.0 + Float(params.saturation), forKey: kCIInputSaturationKey)
      result = f.outputImage ?? result
    }

    // 6. Vibrance — CIVibrance, direct amount. (applyVibrance)
    if params.vibrance != 0 {
      let f = CIFilter(name: "CIVibrance")!
      f.setValue(result, forKey: kCIInputImageKey)
      f.setValue(Float(params.vibrance), forKey: "inputAmount")
      result = f.outputImage ?? result
    }

    return result
  }

  // MARK: B&W desaturation

  private func desaturate(_ image: CIImage) -> CIImage {
    let f = CIFilter(name: "CIColorControls")!
    f.setValue(image, forKey: kCIInputImageKey)
    f.setValue(0.0, forKey: kCIInputSaturationKey)
    return f.outputImage ?? image
  }

  // MARK: Step 8 — sharpen (ImageProcessor.applySharpen)

  private func sharpen(image: CIImage, amount: Float) -> CIImage {
    guard amount > 0 else { return image }
    let f = CIFilter(name: "CISharpenLuminance")!
    f.setValue(image, forKey: kCIInputImageKey)
    f.setValue(amount, forKey: kCIInputSharpnessKey)
    return f.outputImage ?? image
  }

  // MARK: - Histogram (HistogramAnalyzer)

  /// Port of HistogramAnalyzer.generateHistogram + analyzeClipping.
  /// 256 normalized bins per channel; luma uses BT.709 weights; clip = fraction
  /// of luma in the bottom/top 5% of bins, returned as a percentage (0–100).
  private func computeHistogram(cgImage: CGImage) -> [String: Any] {
    let width = cgImage.width
    let height = cgImage.height
    let bins = 256

    var r = [Double](repeating: 0, count: bins)
    var g = [Double](repeating: 0, count: bins)
    var b = [Double](repeating: 0, count: bins)
    var luma = [Double](repeating: 0, count: bins)

    guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
          let ctx = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
          ) else {
      return emptyHistogram()
    }
    ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    guard let pixelData = ctx.data else { return emptyHistogram() }

    let total = width * height
    let pixels = pixelData.bindMemory(to: UInt8.self, capacity: total * 4)

    for i in 0..<total {
      let o = i * 4
      let rv = Int(pixels[o]); let gv = Int(pixels[o + 1]); let bv = Int(pixels[o + 2])
      r[min(rv * bins / 256, bins - 1)] += 1
      g[min(gv * bins / 256, bins - 1)] += 1
      b[min(bv * bins / 256, bins - 1)] += 1
      // BT.709 luma (HistogramAnalyzer).
      let l = 0.2126 * Double(rv) + 0.7152 * Double(gv) + 0.0722 * Double(bv)
      luma[min(Int(l) * bins / 256, bins - 1)] += 1
    }

    let denom = Double(max(total, 1))
    for i in 0..<bins {
      r[i] /= denom; g[i] /= denom; b[i] /= denom; luma[i] /= denom
    }

    // Clipping: bottom/top 5% of bins (analyzeClipping).
    let clipBins = max(1, bins / 20)
    var shadow = 0.0
    var highlight = 0.0
    for i in 0..<clipBins { shadow += luma[i] }
    for i in (bins - clipBins)..<bins { highlight += luma[i] }

    return [
      "r": r,
      "g": g,
      "b": b,
      "luma": luma,
      "shadowClipPct": shadow * 100.0,
      "highlightClipPct": highlight * 100.0
    ]
  }

  private func emptyHistogram() -> [String: Any] {
    let zeros = [Double](repeating: 0, count: 256)
    return [
      "r": zeros, "g": zeros, "b": zeros, "luma": zeros,
      "shadowClipPct": 0.0, "highlightClipPct": 0.0
    ]
  }

  // MARK: - Task #10: fast-path user adjustments

  /// Applies only the seven user-facing sliders to `image`, with no pipeline
  /// pre/post stages. The filter graph is identical to the adjustment section
  /// of `applyUserAdjustments(image:params:ProcessParams)` — same filter names,
  /// same coefficient mappings — but parameterised by `UserAdjustParams` so
  /// the call-site doesn't need to construct a full `ProcessParams`.
  private func applyUserAdjustmentsOnly(image: CIImage, params: UserAdjustParams) -> CIImage {
    var result = image

    // 1. Exposure — CIExposureAdjust (applyExposure). Direct EV value.
    if params.exposure != 0 {
      let f = CIFilter(name: "CIExposureAdjust")!
      f.setValue(result, forKey: kCIInputImageKey)
      f.setValue(Float(params.exposure), forKey: kCIInputEVKey)
      result = f.outputImage ?? result
    }

    // 2. Highlights & shadows — CIHighlightShadowAdjust (applyHighlightsShadows).
    //    highlightAmount = 1 - highlights; shadowAmount = shadows.
    if params.highlights != 0 || params.shadows != 0 {
      let f = CIFilter(name: "CIHighlightShadowAdjust")!
      f.setValue(result, forKey: kCIInputImageKey)
      f.setValue(1.0 - Float(params.highlights), forKey: "inputHighlightAmount")
      f.setValue(Float(params.shadows), forKey: "inputShadowAmount")
      result = f.outputImage ?? result
    }

    // 3. Contrast — CIColorControls (applyContrast). contrast = 1 + value.
    if params.contrast != 0 {
      let f = CIFilter(name: "CIColorControls")!
      f.setValue(result, forKey: kCIInputImageKey)
      f.setValue(1.0 + Float(params.contrast), forKey: kCIInputContrastKey)
      result = f.outputImage ?? result
    }

    // 4. Warmth — CITemperatureAndTint (applyWarmth). neutral = 6500 + value*2000.
    if params.warmth != 0 {
      let f = CIFilter(name: "CITemperatureAndTint")!
      f.setValue(result, forKey: kCIInputImageKey)
      let temperature = 6500.0 + (params.warmth * 2000.0)
      f.setValue(CIVector(x: CGFloat(temperature), y: 0), forKey: "inputNeutral")
      f.setValue(CIVector(x: 6500, y: 0), forKey: "inputTargetNeutral")
      result = f.outputImage ?? result
    }

    // 5. Saturation — CIColorControls (applySaturation). saturation = 1 + value.
    if params.saturation != 0 {
      let f = CIFilter(name: "CIColorControls")!
      f.setValue(result, forKey: kCIInputImageKey)
      f.setValue(1.0 + Float(params.saturation), forKey: kCIInputSaturationKey)
      result = f.outputImage ?? result
    }

    // 6. Vibrance — CIVibrance (applyVibrance). Direct amount.
    if params.vibrance != 0 {
      let f = CIFilter(name: "CIVibrance")!
      f.setValue(result, forKey: kCIInputImageKey)
      f.setValue(Float(params.vibrance), forKey: "inputAmount")
      result = f.outputImage ?? result
    }

    return result
  }

  // MARK: - Task #10: Vision frame detection

  /// Port of FrameDetector.detectFilmFrame + convertToImageCoordinates +
  /// getBoundingRect. Uses VNDetectRectanglesRequest with parameters tuned for
  /// 35 mm film (aspect ratio 0.6…0.7, minimum coverage 30 %, confidence 0.7).
  ///
  /// Vision uses normalized coordinates with the origin at *bottom-left*; the
  /// legacy code converts to image-pixel space with origin *top-left*. We
  /// faithfully reproduce that conversion here (see FrameDetector lines 68-91).
  ///
  /// `VNImageRequestHandler.perform(_:)` is synchronous. This method blocks
  /// the calling thread; callers must dispatch it off the main thread (Expo's
  /// AsyncFunction wrapper already does so).
  private func detectFilmFrameVision(image: CIImage) throws -> [String: Any] {
    let imageSize = image.extent.size

    let request = VNDetectRectanglesRequest()
    request.minimumAspectRatio = 0.6   // ~2:3 for 35 mm (FrameDetector.minimumAspectRatio)
    request.maximumAspectRatio = 0.7   // (FrameDetector.maximumAspectRatio)
    request.minimumSize = 0.3          // ≥30 % of image (FrameDetector.minimumSize)
    request.minimumConfidence = 0.7    // (FrameDetector.minimumConfidence)
    request.maximumObservations = 1    // Most prominent rectangle only

    let handler = VNImageRequestHandler(ciImage: image, options: [:])
    do {
      try handler.perform([request])
    } catch {
      // Return not-found rather than propagating Vision internals to JS.
      return notFoundResult()
    }

    guard let obs = (request.results as? [VNRectangleObservation])?.first else {
      return notFoundResult()
    }

    let w = imageSize.width
    let h = imageSize.height

    // FrameDetector.convertToImageCoordinates: Vision bottom-left → top-left.
    func toPixels(_ normalized: CGPoint) -> [String: Double] {
      return [
        "x": Double(normalized.x * w),
        "y": Double((1.0 - normalized.y) * h)
      ]
    }

    let topLeft     = toPixels(obs.topLeft)
    let topRight    = toPixels(obs.topRight)
    let bottomLeft  = toPixels(obs.bottomLeft)
    let bottomRight = toPixels(obs.bottomRight)

    // FrameDetector.getBoundingRect: axis-aligned bounding box from boundingBox.
    // Vision's boundingBox origin is bottom-left normalized; convert to pixel top-left.
    let bb = obs.boundingBox
    let cropRect: [String: Double] = [
      "x": Double(bb.origin.x * w),
      "y": Double((1.0 - bb.origin.y - bb.height) * h),
      "width": Double(bb.width * w),
      "height": Double(bb.height * h)
    ]

    return [
      "found": true,
      "quad": [
        "topLeft": topLeft,
        "topRight": topRight,
        "bottomLeft": bottomLeft,
        "bottomRight": bottomRight
      ],
      "cropRect": cropRect,
      "confidence": Double(obs.confidence)
    ]
  }

  private func notFoundResult() -> [String: Any] {
    return ["found": false, "confidence": 0.0]
  }

  // MARK: - Film-base neutral white-balance suggestion

  /// Tuning constants for the base-RGB → warmth/tint mapping. Conservative
  /// first estimates — see PARITY.md (the suggestion is intentionally gentle,
  /// and these gains may want tuning against real C-41 captures on device).
  private static let kBaseWarmthGain: Float = 1.5
  private static let kBaseTintGain: Float = 2.0

  /// Derive a SUGGESTED white-balance correction from the unexposed film
  /// base/rebate sampled on the PRE-invert linear image. Returns the result
  /// dictionary `{warmth, tint, found}` directly (matching `FilmBaseNeutral`).
  ///
  /// Mapping (deterministic; documented in PARITY.md):
  ///   - Sample the base colour `(R,G,B)` in sRGB-encoded [0,1] via the shared
  ///     `sampleFilmBaseColor`. nil ⇒ `found:false`, warmth/tint 0.
  ///   - Normalize by the base luminance `Y = 0.299R+0.587G+0.114B` so the
  ///     suggestion is exposure-independent.
  ///   - warmth = −clamp((R−B)/Y · kWarm, −1, +1). A colour-negative base is
  ///     warm/orange (R>B), so the correction is negative (cooler) to counter it.
  ///   - tint   = +clamp((G − (R+B)/2)/Y · kTint, −1, +1). Positive when the
  ///     base leans green (push toward magenta); negative for a magenta base
  ///     (push toward green) — matching CITemperatureAndTint's tint sign.
  private func estimateFilmBaseNeutral(preInvert: CIImage) -> [String: Any] {
    guard let base = sampleFilmBaseColor(preInvert: preInvert) else {
      return ["warmth": 0.0, "tint": 0.0, "found": false]
    }
    let y = max(0.299 * base.r + 0.587 * base.g + 0.114 * base.b, 0.0001)

    let warmExcess = (base.r - base.b) / y                 // ≥0 for an orange base
    let greenBias  = (base.g - (base.r + base.b) / 2) / y   // >0 ⇒ base leans green

    func clamp1(_ v: Float) -> Float { min(1, max(-1, v)) }
    let warmth = clamp1(-warmExcess * Self.kBaseWarmthGain)
    let tint   = clamp1(greenBias * Self.kBaseTintGain)

    return ["warmth": Double(warmth), "tint": Double(tint), "found": true]
  }

  // MARK: - Multi-shot denoise (averageFrames)

  /// Decode N same-size frames and write their per-pixel MEAN as a JPEG.
  ///
  /// Reduces random sensor noise (≈ √N). **Assumes the frames are already
  /// pixel-aligned** — no registration is performed (handheld bursts ghost;
  /// alignment is a documented TODO). If the frames are not all the same pixel
  /// size, or fewer than 2 URIs are given, the FIRST frame is returned
  /// unchanged (re-encoded to the cache so the return shape is consistent).
  ///
  /// Accumulates per-channel sums in a `[UInt32]` buffer (255·N stays well
  /// within UInt32 for any realistic N) and divides once at the end — only the
  /// running sum plus one frame's bitmap are held at a time.
  private func averageFrames(uris: [String]) throws -> [String: Any] {
    guard let firstUri = uris.first else { throw ImageNotFoundException() }

    // Render the first frame; it defines the target size and is the N<2 /
    // size-mismatch fallback.
    guard let firstImage = loadCIImage(from: firstUri),
          let firstCG = ciContext.createCGImage(firstImage, from: firstImage.extent) else {
      throw ImageNotFoundException()
    }
    let width = firstCG.width
    let height = firstCG.height
    let n = width * height

    // N < 2 → nothing to average; return the first frame unchanged.
    if uris.count < 2 || n == 0 {
      let uri = try writeJPEG(cgImage: firstCG, quality: 0.95)
      return ["uri": uri, "width": width, "height": height]
    }

    let rowBytes = width * 4
    var sum = [UInt32](repeating: 0, count: n * 4)
    var scratch = [UInt8](repeating: 0, count: n * 4)

    // Accumulate a single CGImage's pixels into `sum` (sRGB RGBA8). The bitmap
    // is drawn into `scratch` via a CGContext whose backing pointer must stay
    // valid for the whole draw, so we bind it with `withUnsafeMutableBytes`
    // (passing a transient `&scratch` would dangle after the initializer).
    func accumulate(_ cg: CGImage) {
      guard let cs = CGColorSpace(name: CGColorSpace.sRGB) else { return }
      scratch.withUnsafeMutableBytes { raw in
        guard let baseAddr = raw.baseAddress,
              let ctx = CGContext(
                data: baseAddr,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: rowBytes,
                space: cs,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              ) else { return }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
        let bytes = raw.bindMemory(to: UInt8.self)
        for i in 0..<(n * 4) { sum[i] += UInt32(bytes[i]) }
      }
    }

    accumulate(firstCG)
    var counted = 1

    for uri in uris.dropFirst() {
      guard let img = loadCIImage(from: uri),
            let cg = ciContext.createCGImage(img, from: img.extent) else {
        // Unreadable frame → size mismatch with the contract's "same-size"
        // requirement; bail out to the unchanged-first-frame fallback.
        let outUri = try writeJPEG(cgImage: firstCG, quality: 0.95)
        return ["uri": outUri, "width": width, "height": height]
      }
      if cg.width != width || cg.height != height {
        // Sizes differ → return the first image unchanged (documented contract).
        let outUri = try writeJPEG(cgImage: firstCG, quality: 0.95)
        return ["uri": outUri, "width": width, "height": height]
      }
      accumulate(cg)
      counted += 1
    }

    // Divide the running sum by the frame count to get the mean, pack to RGBA8.
    var mean = [UInt8](repeating: 0, count: n * 4)
    let divisor = UInt32(counted)
    for i in 0..<n {
      let o = i * 4
      mean[o]     = UInt8(sum[o]     / divisor)
      mean[o + 1] = UInt8(sum[o + 1] / divisor)
      mean[o + 2] = UInt8(sum[o + 2] / divisor)
      mean[o + 3] = 255
    }

    guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
          let provider = CGDataProvider(data: Data(mean) as CFData),
          let meanCG = CGImage(
            width: width,
            height: height,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: rowBytes,
            space: cs,
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
            provider: provider,
            decode: nil,
            shouldInterpolate: false,
            intent: .defaultIntent
          ) else {
      throw ImageRenderFailedException()
    }

    let uri = try writeJPEG(cgImage: meanCG, quality: 0.95)
    return ["uri": uri, "width": width, "height": height]
  }

  // MARK: - Output

  /// Write a JPEG into the Expo cache directory and return its file:// URI,
  /// mirroring how expo-image-manipulator emits saved files.
  private func writeJPEG(cgImage: CGImage, quality: CGFloat) throws -> String {
    let cacheURL = appContext?.config.cacheDirectory
      ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
    let dir = cacheURL.appendingPathComponent("AiImageProcessing", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let fileURL = dir.appendingPathComponent("\(UUID().uuidString).jpg")

    let uiImage = UIImage(cgImage: cgImage)
    guard let data = uiImage.jpegData(compressionQuality: quality) else {
      throw ImageWriteFailedException()
    }
    do {
      try data.write(to: fileURL, options: .atomic)
    } catch {
      throw ImageWriteFailedException()
    }
    return fileURL.absoluteString
  }

  /// Write a HEIC into the Expo cache directory and return its file:// URI.
  ///
  /// Uses `ImageIO`'s `CGImageDestinationCreateWithURL` with the `public.heic`
  /// UTI. Falls back to JPEG (via `writeJPEG`) if HEIC is unavailable (iOS <
  /// 11 or simulator with no HEIC encoder). The fallback is transparent to the
  /// caller — the returned URI will be a `.jpg` in that case.
  private func writeHEIC(cgImage: CGImage, quality: CGFloat) throws -> String {
    let cacheURL = appContext?.config.cacheDirectory
      ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
    let dir = cacheURL.appendingPathComponent("AiImageProcessing", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let fileURL = dir.appendingPathComponent("\(UUID().uuidString).heic")

    guard let destination = CGImageDestinationCreateWithURL(
      fileURL as CFURL,
      "public.heic" as CFString,
      1,
      nil
    ) else {
      // HEIC encoder unavailable — fall back to JPEG transparently.
      return try writeJPEG(cgImage: cgImage, quality: quality)
    }

    let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: quality]
    CGImageDestinationAddImage(destination, cgImage, options as CFDictionary)

    guard CGImageDestinationFinalize(destination) else {
      throw ImageWriteFailedException()
    }
    return fileURL.absoluteString
  }
}
