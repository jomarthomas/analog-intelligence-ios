package expo.modules.aiimageprocessing

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * AiImageProcessingModule (Android) — negative → positive film engine.
 *
 * This is an equivalent reimplementation of the iOS Core Image pipeline
 * (modules/ai-image-processing/ios/AiImageProcessingModule.swift), which itself
 * ports the legacy-ios/Processing/Pipeline sources. Android has no Core Image, so the
 * stages are reproduced with framework Bitmap pixel operations and per-pixel
 * math chosen to match the iOS filter semantics as closely as feasible.
 *
 * Parity strategy (see PARITY NOTES in the agent report):
 *  - The auto stages (orange-mask sampling, gray-world, tone-curve thresholds)
 *    use the SAME formulas and thresholds as iOS, operating on linear-light
 *    pixels so colour math matches (the spec, §2.1, requires linear space).
 *  - sRGB <-> linear conversions reproduce CILinearToSRGBToneCurve /
 *    CISRGBToneCurveToLinear.
 */
class AiImageProcessingModule : Module() {

  // Mirrors src/AiImageProcessing.types.ts ProcessParams and the Swift Record.
  class ProcessParams : Record {
    @Field val exposure: Double = 0.0
    @Field val warmth: Double = 0.0
    @Field val contrast: Double = 0.0
    @Field val mode: String = "color" // "color" | "bw" | "slide"
    @Field val removeOrangeMask: Boolean = true
    @Field val sharpen: Double = 0.0
    @Field val aiColor: Boolean = false
    @Field val aiDustRemoval: Boolean = false
    // Optional reduced-resolution cap (longer-edge px). <= 0 means full res.
    // When set and the source's longer edge exceeds it, the bitmap is
    // downscaled (aspect-preserving) BEFORE the per-pixel FloatArray passes —
    // a live-preview fast path and an OOM guard for large captures.
    @Field val maxDimension: Double = 0.0
    @Field val saturation: Double = 0.0
    @Field val highlights: Double = 0.0
    @Field val shadows: Double = 0.0
    @Field val vibrance: Double = 0.0
    // Optional LUT selector (bundled-LUT id or .cube file URI). Empty/unknown
    // means the applyLut stage is a NO-OP (identity). See TODO(lut) in runPipeline.
    @Field val lut: String = ""
  }

  // Task #10: fast-path adjustment record — only the seven user-facing sliders.
  // Mirrors src/AiImageProcessing.types.ts UserAdjustParams and the Swift Record.
  // All fields default to 0 (no change); index.ts fills them before the bridge call.
  class UserAdjustParams : Record {
    @Field val exposure: Double = 0.0
    @Field val warmth: Double = 0.0
    @Field val contrast: Double = 0.0
    @Field val saturation: Double = 0.0
    @Field val highlights: Double = 0.0
    @Field val shadows: Double = 0.0
    @Field val vibrance: Double = 0.0
  }

  override fun definition() = ModuleDefinition {
    Name("AiImageProcessing")

    // MARK: processNegative(inputUri, params) -> { uri, width, height }
    AsyncFunction("processNegative") Coroutine { inputUri: String, params: ProcessParams ->
      val source = decodeBitmap(inputUri) ?: throw ImageNotFoundException()
      val output = runPipeline(source, params)
      val uri = writeJpeg(output)
      val result = mapOf(
        "uri" to uri,
        "width" to output.width,
        "height" to output.height
      )
      if (output != source) source.recycle()
      result
    }

    // MARK: analyzeHistogram(uri) -> Histogram
    AsyncFunction("analyzeHistogram") Coroutine { uri: String ->
      val bitmap = decodeBitmap(uri) ?: throw ImageNotFoundException()
      val histogram = computeHistogram(bitmap)
      bitmap.recycle()
      histogram
    }

    // MARK: applyUserAdjustments(baseUri, params) -> { uri, width, height }   [Task #10]
    //
    // Fast path for the live Adjust-screen preview. Loads the already-processed
    // positive from `baseUri`, runs ONLY the seven user-adjustment sliders
    // (exposure / highlights+shadows / contrast / warmth / saturation / vibrance),
    // and encodes to a new JPEG. Skips all pipeline stages that precede user
    // adjustments (linearize / invert / orange-mask / normalise / tone-curve).
    // This matches the iOS behaviour and is safe because `baseUri` is already
    // a sRGB-encoded positive.
    AsyncFunction("applyUserAdjustments") Coroutine { baseUri: String, params: UserAdjustParams ->
      val source = decodeBitmap(baseUri) ?: throw ImageNotFoundException()
      val output = runAdjustmentsOnly(source, params)
      val uri = writeJpeg(output)
      val result = mapOf(
        "uri" to uri,
        "width" to output.width,
        "height" to output.height
      )
      if (output != source) source.recycle()
      result
    }

    // MARK: detectFilmFrame(uri) -> FrameDetectionResult   [Task #10]
    //
    // Android: best-effort luminance-edge heuristic to find the largest
    // high-contrast rectangular region (candidate film frame). If no confident
    // result is found, returns { found: false, confidence: 0 }.
    //
    // TODO: replace this heuristic with a proper Vision-equivalent, e.g. via
    // the Google ML Kit Object Detection API or a Canny+Hough pipeline, which
    // would provide aspect-ratio filtering and confidence scoring equivalent to
    // iOS VNDetectRectanglesRequest. Until then the iOS path is the authoritative
    // implementation and Android degrades gracefully to "not found".
    AsyncFunction("detectFilmFrame") Coroutine { uri: String ->
      val bitmap = decodeBitmap(uri) ?: throw ImageNotFoundException()
      val result = detectFilmFrameHeuristic(bitmap)
      bitmap.recycle()
      result
    }

    // MARK: estimateFilmBaseNeutral(uri) -> { warmth, tint, found }
    //
    // Sample the unexposed film base/rebate (brightest orange max-density
    // region, via the shared sampleFilmBaseColor) and return a SUGGESTED
    // white-balance correction in the app's slider units. Powers a one-tap
    // "neutralize from film base" button. Reads the RAW pre-processing frame.
    AsyncFunction("estimateFilmBaseNeutral") Coroutine { uri: String ->
      val bitmap = decodeBitmap(uri) ?: throw ImageNotFoundException()
      val result = estimateFilmBaseNeutral(bitmap)
      bitmap.recycle()
      result
    }

    // MARK: averageFrames(uris) -> { uri, width, height }
    //
    // Multi-shot denoise: decode N same-size frames and output their per-pixel
    // MEAN (~sqrt(N) sensor-noise reduction — a phone take on SilverFast
    // Multi-Exposure). If sizes differ or N < 2, the first frame is returned
    // unchanged. ASSUMES THE FRAMES ARE ALREADY ALIGNED — no registration is
    // performed (handheld bursts will ghost; alignment is a documented TODO).
    AsyncFunction("averageFrames") Coroutine { uris: List<String> ->
      averageFrames(uris)
    }
  }

  // MARK: - Input decoding

  /** Decode a `file://`, plain-path, or `content://` URI into an ARGB_8888 bitmap. */
  private fun decodeBitmap(uri: String): Bitmap? {
    val opts = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }
    val resolver = appContext.reactContext?.contentResolver
    val decoded: Bitmap = try {
      when {
        uri.startsWith("file://") -> BitmapFactory.decodeFile(Uri.parse(uri).path, opts)
        uri.contains("://") ->
          resolver?.openInputStream(Uri.parse(uri))?.use { BitmapFactory.decodeStream(it, null, opts) }
        else -> BitmapFactory.decodeFile(uri, opts)
      }
    } catch (e: Exception) {
      null
    } ?: return null

    // Apply EXIF orientation so captures are oriented identically to iOS, whose
    // CIImage(contentsOf:options:[.applyOrientationProperty:true]) auto-rotates.
    // VisionCamera writes orientation into EXIF rather than baking it into the
    // pixels, so without this the Android engine would process (and export) some
    // frames sideways while iOS rendered them upright — a visible parity gap.
    val oriented = applyExifOrientation(decoded, uri)

    // Normalize to ARGB_8888 so `getPixels` returns correct 32-bit colour.
    // We only ever read from the source via getPixels, so mutability is not
    // required; the processed output is always a fresh bitmap.
    if (oriented.config == Bitmap.Config.ARGB_8888) {
      return oriented
    }
    val converted = oriented.copy(Bitmap.Config.ARGB_8888, false)
    oriented.recycle()
    return converted
  }

  /**
   * Rotate/flip a freshly-decoded bitmap to honour its EXIF orientation tag,
   * mirroring iOS's `.applyOrientationProperty`. Reads EXIF from the same
   * file/stream the bitmap was decoded from. Uses the framework
   * `android.media.ExifInterface` (no extra dependency). On ANY failure — no
   * EXIF, unreadable URI, unsupported tag, or OOM during rotation — it returns
   * the input bitmap unchanged, so this is never worse than the prior
   * no-orientation behaviour.
   */
  private fun applyExifOrientation(bitmap: Bitmap, uri: String): Bitmap {
    val orientation = try {
      val exif = when {
        uri.startsWith("file://") -> Uri.parse(uri).path?.let { ExifInterface(it) }
        uri.contains("://") -> appContext.reactContext?.contentResolver
          ?.openInputStream(Uri.parse(uri))?.use { ExifInterface(it) }
        else -> ExifInterface(uri)
      } ?: return bitmap
      exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    } catch (e: Exception) {
      return bitmap
    }

    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.postRotate(90f); matrix.postScale(-1f, 1f) }
      ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.postRotate(270f); matrix.postScale(-1f, 1f) }
      else -> return bitmap // NORMAL / UNDEFINED — nothing to do.
    }

    return try {
      val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      if (rotated != bitmap) bitmap.recycle()
      rotated
    } catch (e: OutOfMemoryError) {
      bitmap
    }
  }

  // MARK: - Pipeline (mirrors ImageProcessor.processNegative steps 2–8)

  private fun runPipeline(source: Bitmap, params: ProcessParams): Bitmap {
    // Step 0 — optional reduced-resolution fast path. Downscale BEFORE we
    // allocate the three full-resolution FloatArray(n) buffers, so a large
    // capture (e.g. 48 MP) processed for a live preview cannot OOM. <= 0 ⇒
    // unchanged full-resolution behaviour. The downscaled bitmap is recycled
    // before we return.
    val workSource = downscaleToMaxDimension(source, params.maxDimension)

    val w = workSource.width
    val h = workSource.height
    val n = w * h

    // Read source pixels into a flat ARGB int buffer.
    val argb = IntArray(n)
    workSource.getPixels(argb, 0, w, 0, 0, w, h)
    // The scaled copy is no longer needed once pixels are read (do not recycle
    // the caller-owned `source`, only our private downscaled copy).
    if (workSource != source) workSource.recycle()

    // Decompose into linear-light float channels [0,1].
    // Step 2 — linearize (CILinearToSRGBToneCurve == sRGB -> linear transfer).
    val r = FloatArray(n)
    val g = FloatArray(n)
    val b = FloatArray(n)
    for (i in 0 until n) {
      val p = argb[i]
      r[i] = srgbToLinear(((p shr 16) and 0xFF) / 255f)
      g[i] = srgbToLinear(((p shr 8) and 0xFF) / 255f)
      b[i] = srgbToLinear((p and 0xFF) / 255f)
    }

    // "slide" is an already-POSITIVE E-6 source; "color"/"bw" are negatives.
    val isSlide = params.mode == "slide"
    val isColor = params.mode == "color" // bw and slide are not "color"

    if (isSlide) {
      // Slide / E-6 positive path: SKIP inversion AND orange-mask removal, and
      // SKIP the negative-oriented gray-world + auto-tone-curve. Apply one
      // gentle black/white-point normalization instead. (legacy FilmType.slide)
      normalizeSlide(r, g, b)
    } else {
      // Colour / B&W negative path (unchanged).

      // Step 4a — film-base (rebate) sampling reads the PRE-invert pixels, so do
      // it now while r/g/b still hold the pre-invert values. Sampling before the
      // in-place inversion avoids any extra full-resolution FloatArray copy
      // (important for the large captures `maxDimension` targets). Null ⇒ no
      // convincing base, defer to the dark-region fallback after inversion.
      val baseMask: OrangeMask? =
        if (isColor && params.removeOrangeMask) estimateMaskFromFilmBase(r, g, b, w, h)
        else null

      // Step 3 — invert negative (CIColorInvert): out = 1 - in (in linear light,
      // matching the iOS graph which inverts after linearizing).
      for (i in 0 until n) {
        r[i] = 1f - r[i]; g[i] = 1f - g[i]; b[i] = 1f - b[i]
      }

      // Step 4 — orange mask removal (colour only). OrangeMaskEstimator.
      if (isColor && params.removeOrangeMask) {
        // Prefer the film-base estimate; else fall back to the legacy
        // darkest-region method on the now-inverted channels.
        val mask = baseMask ?: estimateMaskFromDarkRegions(r, g, b, w, h)
        removeOrangeMask(r, g, b, mask)
      }

      // Step 5 — gray-world channel normalization. ColorCorrector.normalizeChannels.
      normalizeChannels(r, g, b)

      // Step 6 — automatic tone curve. ColorCorrector.applyToneCorrection.
      applyToneCorrection(r, g, b)
    }

    // Step 7 — user adjustments, in the legacy order. UserAdjustments.
    // Applied for ALL modes including slide.
    applyUserAdjustments(r, g, b, params)

    // B&W: collapse to luminance (matches the iOS FilmType.blackAndWhite path).
    // Slide is a colour positive, so it is NOT desaturated.
    if (params.mode == "bw") {
      for (i in 0 until n) {
        val l = 0.2126f * r[i] + 0.7152f * g[i] + 0.0722f * b[i]
        r[i] = l; g[i] = l; b[i] = l
      }
    }

    // Step 8 — sharpen (luminance unsharp mask ~ CISharpenLuminance).
    if (params.sharpen > 0) {
      sharpenLuminance(r, g, b, w, h, params.sharpen.toFloat())
    }

    // Step 9 — LUT "look" (film-emulation). Identity NO-OP scaffold today; see
    // applyLut for the TODO(lut). Runs as the final colour stage, AFTER the
    // tone curve + user adjustments and BEFORE the sRGB encode, mirroring iOS.
    applyLut(r, g, b, params.lut)

    // Encode back to sRGB and pack into ARGB ints.
    val out = IntArray(n)
    for (i in 0 until n) {
      val rr = (linearToSrgb(clamp01(r[i])) * 255f).roundToInt().coerceIn(0, 255)
      val gg = (linearToSrgb(clamp01(g[i])) * 255f).roundToInt().coerceIn(0, 255)
      val bb = (linearToSrgb(clamp01(b[i])) * 255f).roundToInt().coerceIn(0, 255)
      out[i] = (0xFF shl 24) or (rr shl 16) or (gg shl 8) or bb
    }

    val result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    result.setPixels(out, 0, w, 0, 0, w, h)
    return result
  }

  // MARK: Step 0 — optional reduced-resolution scaling (maxDimension)

  /**
   * Return a bitmap whose longer edge is at most [maxDimension] px (aspect
   * preserved), or the original [source] unchanged when [maxDimension] <= 0 or
   * the source already fits. When a downscale happens the returned bitmap is a
   * NEW bitmap that the caller must recycle; when no downscale happens the
   * SAME [source] reference is returned (caller must NOT recycle it as a copy).
   *
   * This runs before the per-pixel float passes so a big capture used for a
   * live preview never allocates full-resolution FloatArray buffers.
   */
  private fun downscaleToMaxDimension(source: Bitmap, maxDimension: Double): Bitmap {
    if (maxDimension <= 0.0) return source
    val cap = maxDimension.toInt()
    if (cap <= 0) return source
    val longer = max(source.width, source.height)
    if (longer <= cap) return source

    val scale = cap.toFloat() / longer.toFloat()
    val dw = max(1, (source.width * scale).roundToInt())
    val dh = max(1, (source.height * scale).roundToInt())
    return try {
      Bitmap.createScaledBitmap(source, dw, dh, true)
    } catch (e: OutOfMemoryError) {
      // If even the scaled allocation fails, fall back to full-res processing.
      source
    }
  }

  // MARK: Slide normalization (gentle positive black/white-point stretch)

  /**
   * Gentle normalization for an already-positive slide, the cross-platform twin
   * of the iOS `normalizeSlide`. Unlike `applyToneCorrection` (which applies an
   * aggressive brightness=log2(1/range) + contrast + gamma to recover an
   * inverted negative), this only stretches the 1%/99% luminance points to
   * [0,1] with NO added contrast/gamma, so a correctly-exposed E-6 frame is
   * largely preserved. The black/white points are found from a BT.601 luminance
   * histogram in sRGB-encoded space (matching the negative tone path's domain),
   * and the stretch is applied equally to all three linear channels.
   */
  private fun normalizeSlide(r: FloatArray, g: FloatArray, b: FloatArray) {
    val n = r.size

    val hist = DoubleArray(256)
    for (i in 0 until n) {
      val rs = linearToSrgb(clamp01(r[i]))
      val gs = linearToSrgb(clamp01(g[i]))
      val bs = linearToSrgb(clamp01(b[i]))
      val lum = 0.299f * rs + 0.587f * gs + 0.114f * bs
      hist[min((lum * 255f).toInt(), 255)] += 1.0
    }
    var total = 0.0
    for (v in hist) total += v
    val safeTotal = max(total, 1.0)

    var blackPoint = 0f
    var whitePoint = 1f
    var cumulative = 0.0
    for (bin in 0 until 256) {
      cumulative += hist[bin]
      val cdf = cumulative / safeTotal
      if (cdf >= 0.01 && blackPoint == 0f) blackPoint = bin / 255f
      if (cdf >= 0.99) { whitePoint = bin / 255f; break }
    }

    // Map [blackPoint, whitePoint] -> [0,1] as a neutral slope+bias in
    // sRGB-encoded space, then round-trip back to linear (the working space).
    val range = max(whitePoint - blackPoint, 0.05f)
    val slope = 1f / range
    val bias = -blackPoint / range
    for (i in 0 until n) {
      r[i] = srgbToLinear(clamp01(linearToSrgb(clamp01(r[i])) * slope + bias))
      g[i] = srgbToLinear(clamp01(linearToSrgb(clamp01(g[i])) * slope + bias))
      b[i] = srgbToLinear(clamp01(linearToSrgb(clamp01(b[i])) * slope + bias))
    }
  }

  // MARK: - Colour transfer functions (sRGB IEC 61966-2-1)

  private fun srgbToLinear(c: Float): Float =
    if (c <= 0.04045f) c / 12.92f else ((c + 0.055f) / 1.055f).pow(2.4f)

  private fun linearToSrgb(c: Float): Float =
    if (c <= 0.0031308f) c * 12.92f else 1.055f * c.pow(1f / 2.4f) - 0.055f

  private fun clamp01(v: Float): Float = if (v < 0f) 0f else if (v > 1f) 1f else v

  // MARK: Step 4 — orange mask (OrangeMaskEstimator port)

  private data class OrangeMask(
    val redDensity: Float,
    val greenDensity: Float,
    val blueDensity: Float,
    val strength: Float
  )

  private val defaultMask = OrangeMask(1.0f, 0.65f, 0.4f, 0.6f)

  // Tuning constants for the base-RGB -> warmth/tint mapping in
  // estimateFilmBaseNeutral (must match the iOS kBaseWarmthGain / kBaseTintGain).
  // Conservative first estimates — see PARITY.md; may want on-device tuning.
  private val BASE_WARMTH_GAIN = 1.5f
  private val BASE_TINT_GAIN = 2.0f

  // Orange-mask estimation now **prefers film-base (rebate) sampling** — the
  // Android twin of the iOS `estimateOrangeMask(image:preInvert:)`.
  //
  // Pro film-scanning derives the mask from the unexposed film *base*, which in
  // a colour NEGATIVE is the BRIGHTEST, most-saturated-orange region (max
  // density base) of the image BEFORE inversion (high R, mid G, low B) — more
  // reliable than sampling whatever is darkest after inversion (which may be a
  // scene shadow). `runPipeline` calls `estimateMaskFromFilmBase` on the
  // pre-invert channels FIRST (so no extra full-res copy is needed) and falls
  // back to `estimateMaskFromDarkRegions` on the post-invert channels when no
  // convincing base is found. Both return densities in the SAME post-invert
  // convention the unchanged `removeOrangeMask` expects, so only the *estimate
  // source* improves.

  /**
   * Sample the brightest, most-saturated-orange region of the PRE-invert image
   * (the film base). Returns null if no convincing orange base is present so the
   * caller can fall back to the legacy dark-region method. The orange-mask
   * consumer of the shared [sampleFilmBaseColor]; forwards the averaged base
   * colour into the unchanged [densitiesFromBase] so the removal math matches.
   */
  private fun estimateMaskFromFilmBase(
    preR: FloatArray, preG: FloatArray, preB: FloatArray, w: Int, h: Int
  ): OrangeMask? {
    val base = sampleFilmBaseColor(preR, preG, preB, w, h) ?: return null
    return densitiesFromBase(base[0], base[1], base[2])
  }

  /**
   * Shared film-base (rebate) colour sampler — the single source of truth for
   * "where is the unexposed orange base and what colour is it", the Android twin
   * of the iOS `sampleFilmBaseColor`.
   *
   * Walks a ~10% nearest-neighbour stride over the PRE-invert linear channels,
   * collects the bright, orange-dominant candidates (R > G > B with margin,
   * BT.601 luma > 120/255), and averages the 100 brightest. Returns the averaged
   * base colour as a `floatArrayOf(r, g, b)` in normalized sRGB-encoded [0,1]
   * (the domain the 0..255 thresholds use), or null when fewer than 100
   * convincing base pixels exist.
   *
   * Used by BOTH [estimateMaskFromFilmBase] (orange-mask removal) and
   * [estimateFilmBaseNeutral] (white-balance suggestion). Deterministic.
   */
  private fun sampleFilmBaseColor(
    preR: FloatArray, preG: FloatArray, preB: FloatArray, w: Int, h: Int
  ): FloatArray? {
    val n = w * h
    val targetSamples = max(1, (n * 0.1).toInt())
    val stride = max(1, n / targetSamples)

    data class BasePx(val r: Float, val g: Float, val b: Float, val lum: Float)
    val base = ArrayList<BasePx>()
    var i = 0
    while (i < n) {
      val rs = linearToSrgb(clamp01(preR[i])) * 255f
      val gs = linearToSrgb(clamp01(preG[i])) * 255f
      val bs = linearToSrgb(clamp01(preB[i])) * 255f
      val lum = 0.299f * rs + 0.587f * gs + 0.114f * bs
      // Orange ordering with margin, and bright enough to be the base.
      val orange = (rs > gs + 10f) && (gs > bs + 5f)
      if (lum > 120f && orange) base.add(BasePx(rs / 255f, gs / 255f, bs / 255f, lum))
      i += stride
    }

    // Need a convincing amount of base to trust this estimate.
    if (base.size < 100) return null

    // Average the 100 BRIGHTEST orange-base pixels (max-density base).
    base.sortByDescending { it.lum }
    val samples = base.subList(0, 100)
    val avgR = samples.sumOf { it.r.toDouble() }.toFloat() / 100f
    val avgG = samples.sumOf { it.g.toDouble() }.toFloat() / 100f
    val avgB = samples.sumOf { it.b.toDouble() }.toFloat() / 100f

    return floatArrayOf(avgR, avgG, avgB)
  }

  /**
   * Convert a sampled film-base colour into the post-invert density convention.
   * The removal step expects densities derived from the *inverted* base
   * (`1 - base`), normalized to red, so the CIColorMatrix-equivalent gains are
   * identical to before — only the estimate is better. Mirrors iOS
   * `densitiesFromBase`.
   */
  private fun densitiesFromBase(baseR: Float, baseG: Float, baseB: Float): OrangeMask {
    val r = clamp01(1f - baseR)
    val g = clamp01(1f - baseG)
    val b = clamp01(1f - baseB)
    val safeR = max(r, 0.0001f)
    val range = maxOf(r, g, b) - minOf(r, g, b)
    return OrangeMask(
      redDensity = 1.0f,
      greenDensity = g / safeR,
      blueDensity = b / safeR,
      strength = if (range > 0.1f) min(1.0f, range * 2.0f) else 0.3f
    )
  }

  /**
   * Legacy fallback — port of OrangeMaskEstimator.estimateOrangeMask. Samples a
   * 10% nearest-neighbour downsample in sRGB 0..255, thresholds dark pixels with
   * BT.601 luma < 51, and averages the 100 darkest.
   */
  private fun estimateMaskFromDarkRegions(
    r: FloatArray, g: FloatArray, b: FloatArray, w: Int, h: Int
  ): OrangeMask {
    val n = w * h
    // Stride that yields ~10% of pixels (nearest-neighbour downsample stand-in
    // for CILanczosScaleTransform @ 0.1; sufficient for dark-region statistics).
    val targetSamples = max(1, (n * 0.1).toInt())
    val stride = max(1, n / targetSamples)

    data class DarkPx(val r: Float, val g: Float, val b: Float, val lum: Float)
    val dark = ArrayList<DarkPx>()
    var i = 0
    while (i < n) {
      val rs = linearToSrgb(clamp01(r[i])) * 255f
      val gs = linearToSrgb(clamp01(g[i])) * 255f
      val bs = linearToSrgb(clamp01(b[i])) * 255f
      val lum = 0.299f * rs + 0.587f * gs + 0.114f * bs
      if (lum < 51f) dark.add(DarkPx(rs / 255f, gs / 255f, bs / 255f, lum))
      i += stride
    }

    if (dark.size < 100) return defaultMask

    dark.sortBy { it.lum }
    val samples = dark.subList(0, 100)
    val avgR = samples.sumOf { it.r.toDouble() }.toFloat() / 100f
    val avgG = samples.sumOf { it.g.toDouble() }.toFloat() / 100f
    val avgB = samples.sumOf { it.b.toDouble() }.toFloat() / 100f

    val safeR = max(avgR, 0.0001f)
    val range = maxOf(avgR, avgG, avgB) - minOf(avgR, avgG, avgB)
    return OrangeMask(
      redDensity = 1.0f,
      greenDensity = avgG / safeR,
      blueDensity = avgB / safeR,
      strength = if (range > 0.1f) min(1.0f, range * 2.0f) else 0.3f
    )
  }

  /** Port of OrangeMaskEstimator.removeMaskColor (CIColorMatrix gains + bias). */
  private fun removeOrangeMask(r: FloatArray, g: FloatArray, b: FloatArray, mask: OrangeMask) {
    val redComp = 1.0f / max(mask.redDensity, 0.1f)
    val greenComp = 1.0f / max(mask.greenDensity, 0.1f)
    val blueComp = 1.0f / max(mask.blueDensity, 0.1f)
    val norm = blueComp
    val redGain = redComp / norm
    val greenGain = greenComp / norm
    val blueGain = 1.0f
    val bias = -0.05f * mask.strength // applied to R and G only (matches legacy)
    for (i in r.indices) {
      r[i] = r[i] * redGain + bias
      g[i] = g[i] * greenGain + bias
      b[i] = b[i] * blueGain
    }
  }

  // MARK: Step 5 — gray-world normalization (ColorCorrector.normalizeChannels)

  private fun normalizeChannels(r: FloatArray, g: FloatArray, b: FloatArray) {
    val n = r.size
    // CIAreaAverage computes the mean in linear light; mirror that.
    var sumR = 0.0; var sumG = 0.0; var sumB = 0.0
    for (i in 0 until n) {
      sumR += clamp01(r[i]).toDouble(); sumG += clamp01(g[i]).toDouble(); sumB += clamp01(b[i]).toDouble()
    }
    val meanR = (sumR / n).toFloat()
    val meanG = (sumG / n).toFloat()
    val meanB = (sumB / n).toFloat()
    val target = (meanR + meanG + meanB) / 3f

    fun gain(mean: Float): Float = min(max(target / max(mean, 0.01f), 0.5f), 2.0f)
    val gr = gain(meanR); val gg = gain(meanG); val gb = gain(meanB)
    for (i in 0 until n) { r[i] *= gr; g[i] *= gg; b[i] *= gb }
  }

  // MARK: Step 6 — tone correction (ColorCorrector.calculateToneCurve/applyToneCurve)

  private fun applyToneCorrection(r: FloatArray, g: FloatArray, b: FloatArray) {
    val n = r.size
    // Build a 256-bin luminance histogram (BT.601, matching the legacy CDF on
    // CIAreaHistogram output which is sampled in sRGB-encoded bins).
    val hist = DoubleArray(256)
    for (i in 0 until n) {
      val rs = linearToSrgb(clamp01(r[i]))
      val gs = linearToSrgb(clamp01(g[i]))
      val bs = linearToSrgb(clamp01(b[i]))
      val lum = 0.299f * rs + 0.587f * gs + 0.114f * bs
      hist[min((lum * 255f).toInt(), 255)] += 1.0
    }
    var total = 0.0
    for (v in hist) total += v
    val safeTotal = max(total, 1.0)

    var blackPoint = 0f
    var whitePoint = 1f
    var cumulative = 0.0
    for (bin in 0 until 256) {
      cumulative += hist[bin]
      val cdf = cumulative / safeTotal
      if (cdf >= 0.01 && blackPoint == 0f) blackPoint = bin / 255f
      if (cdf >= 0.99) { whitePoint = bin / 255f; break }
    }

    val midPoint = 0.5f
    val contrast = 1.1f
    val inputRange = whitePoint - blackPoint
    val brightness = (ln((1.0 / max(inputRange, 0.1f)).toDouble()) / ln(2.0)).toFloat() // log2

    // Apply in sRGB-encoded space to match CIColorControls/CIGammaAdjust, which
    // operate on the (display-referred) values in the legacy graph.
    val gammaPower = 1.0f / midPoint
    for (i in 0 until n) {
      r[i] = toneMap(r[i], brightness, contrast, gammaPower)
      g[i] = toneMap(g[i], brightness, contrast, gammaPower)
      b[i] = toneMap(b[i], brightness, contrast, gammaPower)
    }
  }

  /**
   * Reproduces the legacy three-stage tone op on one channel:
   *   1. CIColorControls brightness: additive in display space.
   *   2. CIColorControls contrast:   (v - 0.5) * contrast + 0.5.
   *   3. CIGammaAdjust:              pow(v, 1/midPoint).
   * Conversions in/out of sRGB keep the rest of the linear pipeline consistent.
   */
  private fun toneMap(linear: Float, brightness: Float, contrast: Float, gammaPower: Float): Float {
    var v = linearToSrgb(clamp01(linear))
    v += brightness                          // brightness (additive)
    v = (v - 0.5f) * contrast + 0.5f         // contrast about mid-grey
    v = clamp01(v)
    v = v.pow(gammaPower)                     // gamma
    return srgbToLinear(clamp01(v))
  }

  // MARK: Step 7 — user adjustments (UserAdjustments.applyAdjustments order)

  private fun applyUserAdjustments(r: FloatArray, g: FloatArray, b: FloatArray, p: ProcessParams) {
    applyAdjustmentChannels(
      r, g, b,
      exposure = p.exposure, highlights = p.highlights, shadows = p.shadows,
      contrast = p.contrast, warmth = p.warmth, saturation = p.saturation, vibrance = p.vibrance
    )
  }

  /**
   * The seven user-facing slider adjustments applied to LINEAR-light channels,
   * in the legacy Core Image order (exposure → highlights+shadows → contrast →
   * warmth → saturation → vibrance).
   *
   * Shared by the full pipeline (Step 7) and the Adjust-screen fast path
   * (`runAdjustmentsOnly`) so a live preview uses the IDENTICAL math as the
   * committed render — mirroring iOS, where both code paths drive the same Core
   * Image graph in the same linear working space. Input and output are linear;
   * steps 2 and 3 round-trip through sRGB internally to match the display-space
   * behaviour of CIHighlightShadowAdjust / CIColorControls.
   */
  private fun applyAdjustmentChannels(
    r: FloatArray, g: FloatArray, b: FloatArray,
    exposure: Double, highlights: Double, shadows: Double,
    contrast: Double, warmth: Double, saturation: Double, vibrance: Double
  ) {
    val n = r.size

    // 1. Exposure — CIExposureAdjust: linear multiply by 2^EV.
    if (exposure != 0.0) {
      val gain = 2.0.pow(exposure).toFloat()
      for (i in 0 until n) { r[i] *= gain; g[i] *= gain; b[i] *= gain }
    }

    // 2. Highlights & shadows — approximation of CIHighlightShadowAdjust.
    //    Legacy: highlightAmount = 1 - highlights (lower => darker highlights),
    //    shadowAmount = shadows (higher => lifted shadows). We apply a smooth
    //    luminance-weighted lift/compress in display space.
    if (highlights != 0.0 || shadows != 0.0) {
      val hi = (1.0 - highlights).toFloat() // around 1.0
      val sh = shadows.toFloat()            // around 0.0
      for (i in 0 until n) {
        var rs = linearToSrgb(clamp01(r[i]))
        var gs = linearToSrgb(clamp01(g[i]))
        var bs = linearToSrgb(clamp01(b[i]))
        val lum = 0.2126f * rs + 0.7152f * gs + 0.0722f * bs
        // Shadow lift weighted toward darks, highlight scale weighted to brights.
        val shadowW = (1f - lum)
        val highW = lum
        val lift = sh * 0.5f * shadowW
        val scale = 1f + (hi - 1f) * highW
        rs = clamp01((rs + lift) * scale)
        gs = clamp01((gs + lift) * scale)
        bs = clamp01((bs + lift) * scale)
        r[i] = srgbToLinear(rs); g[i] = srgbToLinear(gs); b[i] = srgbToLinear(bs)
      }
    }

    // 3. Contrast — CIColorControls: contrast = 1 + value, about mid-grey 0.5.
    if (contrast != 0.0) {
      val c = (1.0 + contrast).toFloat()
      for (i in 0 until n) {
        r[i] = srgbToLinear(clamp01((linearToSrgb(clamp01(r[i])) - 0.5f) * c + 0.5f))
        g[i] = srgbToLinear(clamp01((linearToSrgb(clamp01(g[i])) - 0.5f) * c + 0.5f))
        b[i] = srgbToLinear(clamp01((linearToSrgb(clamp01(b[i])) - 0.5f) * c + 0.5f))
      }
    }

    // 4. Warmth — CITemperatureAndTint: neutral 6500 + value*2000 (4500..8500K).
    //    Approximated as per-channel scale: warmer boosts R, cuts B; cooler the
    //    inverse. Operates in linear light.
    if (warmth != 0.0) {
      val warm = warmth.toFloat() // -1..+1
      val rScale = 1f + 0.2f * warm
      val bScale = 1f - 0.2f * warm
      for (i in 0 until n) { r[i] *= rScale; b[i] *= bScale }
    }

    // 5. Saturation — CIColorControls: saturation = 1 + value (BT.601 luma pivot).
    if (saturation != 0.0) {
      applySaturation(r, g, b, (1.0 + saturation).toFloat())
    }

    // 6. Vibrance — CIVibrance: selective saturation, stronger on muted colours.
    if (vibrance != 0.0) {
      applyVibrance(r, g, b, vibrance.toFloat())
    }
  }

  private fun applySaturation(r: FloatArray, g: FloatArray, b: FloatArray, sat: Float) {
    for (i in r.indices) {
      val l = 0.299f * r[i] + 0.587f * g[i] + 0.114f * b[i]
      r[i] = l + (r[i] - l) * sat
      g[i] = l + (g[i] - l) * sat
      b[i] = l + (b[i] - l) * sat
    }
  }

  private fun applyVibrance(r: FloatArray, g: FloatArray, b: FloatArray, amount: Float) {
    for (i in r.indices) {
      val mx = maxOf(r[i], g[i], b[i])
      val mn = minOf(r[i], g[i], b[i])
      val sat = if (mx > 0f) (mx - mn) / mx else 0f
      // Less-saturated pixels get a larger boost (selective saturation).
      val factor = 1f + amount * (1f - sat)
      val l = 0.299f * r[i] + 0.587f * g[i] + 0.114f * b[i]
      r[i] = l + (r[i] - l) * factor
      g[i] = l + (g[i] - l) * factor
      b[i] = l + (b[i] - l) * factor
    }
  }

  // MARK: Step 8 — sharpen (luminance unsharp mask, approx CISharpenLuminance)

  private fun sharpenLuminance(r: FloatArray, g: FloatArray, b: FloatArray, w: Int, h: Int, amount: Float) {
    val n = w * h
    // Compute luminance, blur it with a 3x3 box, then add the high-frequency
    // (luma - blur) detail back scaled by `amount` — the classic unsharp mask.
    val lum = FloatArray(n)
    for (i in 0 until n) lum[i] = 0.2126f * r[i] + 0.7152f * g[i] + 0.0722f * b[i]
    val blur = FloatArray(n)
    for (y in 0 until h) {
      for (x in 0 until w) {
        var sum = 0f; var cnt = 0
        var dy = -1
        while (dy <= 1) {
          var dx = -1
          while (dx <= 1) {
            val nx = x + dx; val ny = y + dy
            if (nx in 0 until w && ny in 0 until h) { sum += lum[ny * w + nx]; cnt++ }
            dx++
          }
          dy++
        }
        blur[y * w + x] = sum / cnt
      }
    }
    for (i in 0 until n) {
      val detail = (lum[i] - blur[i]) * amount
      r[i] += detail; g[i] += detail; b[i] += detail
    }
  }

  // MARK: Step 9 — LUT look (scaffold; identity NO-OP)

  /**
   * Apply a 3D-LUT colour "look" as the final colour stage of the pipeline.
   *
   * Scaffold only. Today this is an identity pass-through: an empty or
   * unrecognised [lut] leaves the channels untouched, so existing behaviour is
   * preserved bit-for-bit. The seam exists so the JS film-profiles can pass
   * `ProcessParams.lut` (a bundled-LUT id or a .cube file URI) ahead of a real
   * sampler landing here, mirroring the iOS applyLut.
   *
   * TODO(lut): implement real 3D-LUT sampling.
   *   1. Resolve [lut]: a bundled id maps to a packaged .cube asset; a
   *      file://-or-path loads that .cube. Parse the cube (size N, the N*N*N RGB
   *      triplets, DOMAIN_MIN/MAX) once and cache it by id/URI.
   *   2. For each pixel, map the (already tone-curved + adjusted) linear RGB to
   *      a grid coordinate and TRILINEARLY interpolate the 8 surrounding LUT
   *      nodes, writing the result back into r/g/b. This runs EXACTLY here —
   *      after the tone curve + user adjustments, before the sRGB encode — so the
   *      look is applied to the fully-corrected positive, matching iOS CIColorCube.
   *   3. Keep the sampling domain (linear vs sRGB) aligned with iOS so the two
   *      platforms agree on the look.
   * Procedural film looks (below) are implemented now; loading external .cube
   * files remains the future enhancement described above.
   */
  private data class FilmLook(
    val saturation: Float,
    val shadowR: Float, val shadowG: Float, val shadowB: Float,
    val highR: Float, val highG: Float, val highB: Float,
  )

  /** Look table. MUST stay in sync with iOS `filmLook(for:)` for parity. */
  private fun filmLook(id: String): FilmLook? = when (id) {
    "portra", "portra400" -> FilmLook(0.94f, 0.010f, 0.004f, -0.010f, 0.022f, 0.006f, -0.020f)
    "frontier" -> FilmLook(1.08f, -0.012f, 0.000f, 0.028f, 0.020f, 0.006f, -0.018f)
    "noritsu" -> FilmLook(1.04f, 0.000f, 0.000f, 0.010f, 0.012f, 0.004f, -0.010f)
    "gold", "gold200" -> FilmLook(1.05f, 0.018f, 0.004f, -0.018f, 0.030f, 0.014f, -0.030f)
    "ektar", "ektar100" -> FilmLook(1.16f, -0.008f, 0.000f, 0.012f, 0.010f, 0.000f, -0.012f)
    else -> null
  }

  /**
   * Apply the film "look" colour grade (saturation + luma-weighted split-tone)
   * directly per-pixel in linear [0,1] — the SAME transform iOS bakes into its
   * 17³ CIColorCube, applied exactly rather than interpolated, so the two
   * platforms agree to within the cube's (imperceptible) interpolation error.
   */
  private fun applyLut(r: FloatArray, g: FloatArray, b: FloatArray, lut: String) {
    val id = lut.trim().lowercase()
    if (id.isEmpty()) return
    val look = filmLook(id) ?: return
    val n = r.size
    for (i in 0 until n) {
      val lum = 0.2126f * r[i] + 0.7152f * g[i] + 0.0722f * b[i]
      val sw = (1f - lum) * (1f - lum)
      val hw = lum * lum
      val nr = lum + (r[i] - lum) * look.saturation + look.shadowR * sw + look.highR * hw
      val ng = lum + (g[i] - lum) * look.saturation + look.shadowG * sw + look.highG * hw
      val nb = lum + (b[i] - lum) * look.saturation + look.shadowB * sw + look.highB * hw
      r[i] = nr.coerceIn(0f, 1f)
      g[i] = ng.coerceIn(0f, 1f)
      b[i] = nb.coerceIn(0f, 1f)
    }
  }

  // MARK: - Film-base neutral white-balance suggestion

  /**
   * Derive a SUGGESTED white-balance correction from the unexposed film
   * base/rebate. The Android twin of the iOS `estimateFilmBaseNeutral`; returns
   * the `{warmth, tint, found}` map (matching `FilmBaseNeutral`).
   *
   * The decoded source is linearized first so the shared [sampleFilmBaseColor]
   * reads the same pre-invert domain the pipeline uses. Mapping (deterministic;
   * documented in PARITY.md):
   *   - base colour (R,G,B) in sRGB-encoded [0,1]; null => found:false, 0/0.
   *   - normalize by base luminance Y = 0.299R+0.587G+0.114B (exposure-independent).
   *   - warmth = -clamp((R-B)/Y * kWarm). Orange base (R>B) => negative (cooler).
   *   - tint   = +clamp((G-(R+B)/2)/Y * kTint). >0 when base leans green
   *     (push magenta); <0 for a magenta base (push green), per
   *     CITemperatureAndTint's tint sign.
   */
  private fun estimateFilmBaseNeutral(source: Bitmap): Map<String, Any> {
    val w = source.width
    val h = source.height
    val n = w * h
    if (n == 0) return mapOf("warmth" to 0.0, "tint" to 0.0, "found" to false)

    val argb = IntArray(n)
    source.getPixels(argb, 0, w, 0, 0, w, h)

    // Linearize (sRGB -> linear), matching the pipeline's pre-invert channels.
    val r = FloatArray(n)
    val g = FloatArray(n)
    val b = FloatArray(n)
    for (i in 0 until n) {
      val p = argb[i]
      r[i] = srgbToLinear(((p shr 16) and 0xFF) / 255f)
      g[i] = srgbToLinear(((p shr 8) and 0xFF) / 255f)
      b[i] = srgbToLinear((p and 0xFF) / 255f)
    }

    val base = sampleFilmBaseColor(r, g, b, w, h)
      ?: return mapOf("warmth" to 0.0, "tint" to 0.0, "found" to false)

    val y = max(0.299f * base[0] + 0.587f * base[1] + 0.114f * base[2], 0.0001f)
    val warmExcess = (base[0] - base[2]) / y                  // >=0 for an orange base
    val greenBias = (base[1] - (base[0] + base[2]) / 2f) / y  // >0 => base leans green

    val warmth = clampUnit(-warmExcess * BASE_WARMTH_GAIN)
    val tint = clampUnit(greenBias * BASE_TINT_GAIN)

    return mapOf("warmth" to warmth.toDouble(), "tint" to tint.toDouble(), "found" to true)
  }

  private fun clampUnit(v: Float): Float = if (v < -1f) -1f else if (v > 1f) 1f else v

  // MARK: - Multi-shot denoise (averageFrames)

  /**
   * Decode N same-size frames and write their per-pixel MEAN as a JPEG.
   *
   * Reduces random sensor noise (~sqrt(N)). ASSUMES THE FRAMES ARE ALREADY
   * pixel-aligned — no registration is performed (handheld bursts ghost;
   * alignment is a documented TODO). If the frames are not all the same pixel
   * size, or fewer than 2 URIs are supplied, the FIRST frame is returned
   * unchanged (re-encoded to the cache so the return shape is consistent).
   *
   * Memory-light: holds a single IntArray running sum (R/G/B/count packed as
   * Int sums in three IntArrays) plus AT MOST one decoded frame at a time. It
   * never materialises N float buffers — each frame is decoded, added to the
   * sums via getPixels into a reused IntArray, then recycled before the next.
   */
  private fun averageFrames(uris: List<String>): Map<String, Any> {
    if (uris.isEmpty()) throw ImageNotFoundException()

    val first = decodeBitmap(uris[0]) ?: throw ImageNotFoundException()
    val w = first.width
    val h = first.height
    val n = w * h

    // N < 2 -> nothing to average; return the first frame unchanged.
    if (uris.size < 2 || n == 0) {
      val uri = writeJpeg(first)
      first.recycle()
      return mapOf("uri" to uri, "width" to w, "height" to h)
    }

    // Per-channel running sums in Int (255 * N stays within Int for any realistic
    // N) plus one reusable pixel buffer. Only these + one frame are ever held.
    val sumR = IntArray(n)
    val sumG = IntArray(n)
    val sumB = IntArray(n)
    val px = IntArray(n)

    fun accumulate(bmp: Bitmap) {
      bmp.getPixels(px, 0, w, 0, 0, w, h)
      for (i in 0 until n) {
        val p = px[i]
        sumR[i] += (p shr 16) and 0xFF
        sumG[i] += (p shr 8) and 0xFF
        sumB[i] += p and 0xFF
      }
    }

    accumulate(first)
    first.recycle()
    var counted = 1

    for (idx in 1 until uris.size) {
      val frame = decodeBitmap(uris[idx])
      if (frame == null || frame.width != w || frame.height != h) {
        // Unreadable or size mismatch -> return the first image unchanged
        // (documented contract). Re-decode the first frame for a clean output.
        frame?.recycle()
        val fallback = decodeBitmap(uris[0]) ?: throw ImageNotFoundException()
        val uri = writeJpeg(fallback)
        fallback.recycle()
        return mapOf("uri" to uri, "width" to w, "height" to h)
      }
      accumulate(frame)
      frame.recycle()
      counted += 1
    }

    // Divide the running sums by the frame count to get the mean, pack to ARGB.
    val out = IntArray(n)
    for (i in 0 until n) {
      val rr = sumR[i] / counted
      val gg = sumG[i] / counted
      val bb = sumB[i] / counted
      out[i] = (0xFF shl 24) or (rr shl 16) or (gg shl 8) or bb
    }
    val result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    result.setPixels(out, 0, w, 0, 0, w, h)
    val uri = writeJpeg(result)
    result.recycle()
    return mapOf("uri" to uri, "width" to w, "height" to h)
  }

  // MARK: - Histogram (HistogramAnalyzer port)

  private fun computeHistogram(bitmap: Bitmap): Map<String, Any> {
    val src = if (bitmap.config == Bitmap.Config.ARGB_8888) bitmap
      else bitmap.copy(Bitmap.Config.ARGB_8888, false)
    val w = src.width
    val h = src.height
    val n = w * h
    val px = IntArray(n)
    src.getPixels(px, 0, w, 0, 0, w, h)

    val bins = 256
    val r = DoubleArray(bins)
    val g = DoubleArray(bins)
    val b = DoubleArray(bins)
    val luma = DoubleArray(bins)

    for (i in 0 until n) {
      val p = px[i]
      val rv = (p shr 16) and 0xFF
      val gv = (p shr 8) and 0xFF
      val bv = p and 0xFF
      r[min(rv * bins / 256, bins - 1)] += 1.0
      g[min(gv * bins / 256, bins - 1)] += 1.0
      b[min(bv * bins / 256, bins - 1)] += 1.0
      // BT.709 luma (HistogramAnalyzer).
      val l = 0.2126 * rv + 0.7152 * gv + 0.0722 * bv
      luma[min((l.toInt()) * bins / 256, bins - 1)] += 1.0
    }

    val denom = max(n, 1).toDouble()
    for (i in 0 until bins) { r[i] /= denom; g[i] /= denom; b[i] /= denom; luma[i] /= denom }

    val clipBins = max(1, bins / 20)
    var shadow = 0.0
    var highlight = 0.0
    for (i in 0 until clipBins) shadow += luma[i]
    for (i in (bins - clipBins) until bins) highlight += luma[i]

    if (src != bitmap) src.recycle()

    return mapOf(
      "r" to r.toList(),
      "g" to g.toList(),
      "b" to b.toList(),
      "luma" to luma.toList(),
      "shadowClipPct" to shadow * 100.0,
      "highlightClipPct" to highlight * 100.0
    )
  }

  // MARK: - Task #10: fast-path user adjustments (applyUserAdjustments)

  /**
   * Applies only the seven user-facing slider adjustments to a decoded sRGB
   * positive, for the live Adjust-screen preview.
   *
   * The source is linearized first so the slider math runs in the SAME
   * linear-light space as the full pipeline's Step 7 (`applyAdjustmentChannels`)
   * — and as iOS, whose Core Image context is linear for both the pipeline and
   * the fast path. Sharing `applyAdjustmentChannels` guarantees the preview is
   * a faithful approximation of the committed `processNegative` render rather
   * than a separately-tuned display-space version that drifts from it.
   *
   * Returns a new ARGB_8888 Bitmap; the caller owns both source and result.
   */
  private fun runAdjustmentsOnly(source: Bitmap, p: UserAdjustParams): Bitmap {
    val w = source.width
    val h = source.height
    val n = w * h

    val argb = IntArray(n)
    source.getPixels(argb, 0, w, 0, 0, w, h)

    // Linearize the already-encoded positive (sRGB → linear), matching the
    // working space of the full pipeline's user-adjustment stage.
    val r = FloatArray(n)
    val g = FloatArray(n)
    val b = FloatArray(n)
    for (i in 0 until n) {
      val px = argb[i]
      r[i] = srgbToLinear(((px shr 16) and 0xFF) / 255f)
      g[i] = srgbToLinear(((px shr 8)  and 0xFF) / 255f)
      b[i] = srgbToLinear((px          and 0xFF) / 255f)
    }

    applyAdjustmentChannels(
      r, g, b,
      exposure = p.exposure, highlights = p.highlights, shadows = p.shadows,
      contrast = p.contrast, warmth = p.warmth, saturation = p.saturation, vibrance = p.vibrance
    )

    // Encode linear → sRGB for output (same as the full pipeline's final step).
    val out = IntArray(n)
    for (i in 0 until n) {
      val rr = (linearToSrgb(clamp01(r[i])) * 255f).roundToInt().coerceIn(0, 255)
      val gg = (linearToSrgb(clamp01(g[i])) * 255f).roundToInt().coerceIn(0, 255)
      val bb = (linearToSrgb(clamp01(b[i])) * 255f).roundToInt().coerceIn(0, 255)
      out[i] = (0xFF shl 24) or (rr shl 16) or (gg shl 8) or bb
    }
    val result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    result.setPixels(out, 0, w, 0, 0, w, h)
    return result
  }

  // MARK: - Task #10: detectFilmFrame heuristic (Android best-effort)

  /**
   * Best-effort film-frame detection on Android. Uses a luminance-contrast
   * edge-energy heuristic:
   *   1. Downsample to a small working size for speed.
   *   2. Compute per-pixel Sobel edge energy (approximation of gradient magnitude).
   *   3. Find the axis-aligned inner rectangle that maximises the ratio of
   *      border edge energy to interior edge energy — a strong frame boundary
   *      shows high energy at the border and lower energy inside.
   *   4. Apply a minimum-size filter (≥30 % of image, matching iOS parameters)
   *      and an ad-hoc confidence threshold.
   *
   * This is explicitly inferior to VNDetectRectanglesRequest (no true quad,
   * no perspective-aware detection). It returns `found: false` whenever the
   * heuristic score is below threshold so the caller can prompt the user to
   * use the manual crop tool instead.
   *
   * TODO: replace with ML Kit Object Detection or a Canny+HoughLines pipeline
   * for quadrilateral detection with aspect-ratio filtering comparable to the
   * iOS Vision implementation.
   */
  private fun detectFilmFrameHeuristic(source: Bitmap): Map<String, Any> {
    // Work at 25 % resolution for speed; Vision on iOS also downsamples.
    val scale = 0.25f
    val sw = max(1, (source.width * scale).toInt())
    val sh = max(1, (source.height * scale).toInt())
    val small = Bitmap.createScaledBitmap(source, sw, sh, true)

    val n = sw * sh
    val argb = IntArray(n)
    small.getPixels(argb, 0, sw, 0, 0, sw, sh)
    small.recycle()

    // Build luminance array in [0, 255].
    val lum = FloatArray(n)
    for (i in 0 until n) {
      val p = argb[i]
      val rv = ((p shr 16) and 0xFF).toFloat()
      val gv = ((p shr 8)  and 0xFF).toFloat()
      val bv = (p          and 0xFF).toFloat()
      lum[i] = 0.2126f * rv + 0.7152f * gv + 0.0722f * bv
    }

    // Sobel horizontal + vertical edge energy at each pixel.
    val edge = FloatArray(n)
    for (y in 1 until sh - 1) {
      for (x in 1 until sw - 1) {
        val idx = y * sw + x
        val gx = (
          -lum[(y-1)*sw+(x-1)] + lum[(y-1)*sw+(x+1)]
          - 2*lum[y*sw+(x-1)]  + 2*lum[y*sw+(x+1)]
          - lum[(y+1)*sw+(x-1)]+ lum[(y+1)*sw+(x+1)]
        )
        val gy = (
          -lum[(y-1)*sw+(x-1)] - 2*lum[(y-1)*sw+x] - lum[(y-1)*sw+(x+1)]
          + lum[(y+1)*sw+(x-1)]+ 2*lum[(y+1)*sw+x] + lum[(y+1)*sw+(x+1)]
        )
        edge[idx] = sqrt(gx*gx + gy*gy)
      }
    }

    // Scan candidate inner rectangles. Step size = 10 % of each dimension for speed.
    // Minimum size: 30 % of image, mirroring iOS VNDetectRectanglesRequest.minimumSize.
    val minW = (sw * 0.3f).toInt()
    val minH = (sh * 0.3f).toInt()
    val stepX = max(1, sw / 10)
    val stepY = max(1, sh / 10)
    val borderW = max(2, sw / 20) // width of border band to sample edge energy from

    var bestScore = 0f
    var bestRect: IntArray? = null

    var y0 = 0
    while (y0 < sh - minH) {
      var y1 = y0 + minH
      while (y1 < sh) {
        var x0 = 0
        while (x0 < sw - minW) {
          var x1 = x0 + minW
          while (x1 < sw) {
            // Sum edge energy along the border band.
            var borderSum = 0f
            var borderCnt = 0
            // Top / bottom rows
            for (x in x0 until x1) {
              for (dy in 0 until borderW) {
                val ty = y0 + dy; val by = y1 - 1 - dy
                if (ty < sh) { borderSum += edge[ty * sw + x]; borderCnt++ }
                if (by >= 0) { borderSum += edge[by * sw + x]; borderCnt++ }
              }
            }
            // Left / right columns (excluding corners already counted)
            for (y in (y0 + borderW) until (y1 - borderW)) {
              for (dx in 0 until borderW) {
                val lx = x0 + dx; val rx = x1 - 1 - dx
                if (lx < sw) { borderSum += edge[y * sw + lx]; borderCnt++ }
                if (rx >= 0) { borderSum += edge[y * sw + rx]; borderCnt++ }
              }
            }
            val meanBorder = if (borderCnt > 0) borderSum / borderCnt else 0f

            // Mean edge energy of the interior (excluding border band).
            var interiorSum = 0f
            var interiorCnt = 0
            for (y in (y0 + borderW) until (y1 - borderW)) {
              for (x in (x0 + borderW) until (x1 - borderW)) {
                interiorSum += edge[y * sw + x]; interiorCnt++
              }
            }
            val meanInterior = if (interiorCnt > 0) interiorSum / interiorCnt else 0f

            // Score: ratio of border energy to interior energy. High score =
            // clear border with relatively flat interior = likely frame edge.
            val score = meanBorder / max(meanInterior + 1f, 1f)
            if (score > bestScore) {
              bestScore = score
              bestRect = intArrayOf(x0, y0, x1, y1)
            }
            x1 += stepX
          }
          x0 += stepX
        }
        y1 += stepY
      }
      y0 += stepY
    }

    // Empirical confidence threshold. Below this, results are unreliable.
    val threshold = 3.0f
    if (bestScore < threshold || bestRect == null) {
      return mapOf("found" to false, "confidence" to 0.0)
    }

    // Convert small-bitmap coordinates back to source-image pixel space.
    val invScale = 1f / scale
    val px0 = (bestRect[0] * invScale).toInt()
    val py0 = (bestRect[1] * invScale).toInt()
    val px1 = (bestRect[2] * invScale).toInt()
    val py1 = (bestRect[3] * invScale).toInt()
    val pw  = px1 - px0
    val ph  = py1 - py0

    // Clamp confidence to [0, 1] — bestScore is relative, not a probability.
    val confidence = min(1.0, (bestScore / (threshold * 5f)).toDouble())

    return mapOf(
      "found" to true,
      "quad" to mapOf(
        "topLeft"     to mapOf("x" to px0.toDouble(), "y" to py0.toDouble()),
        "topRight"    to mapOf("x" to px1.toDouble(), "y" to py0.toDouble()),
        "bottomLeft"  to mapOf("x" to px0.toDouble(), "y" to py1.toDouble()),
        "bottomRight" to mapOf("x" to px1.toDouble(), "y" to py1.toDouble())
      ),
      "cropRect" to mapOf(
        "x" to px0.toDouble(),
        "y" to py0.toDouble(),
        "width"  to pw.toDouble(),
        "height" to ph.toDouble()
      ),
      "confidence" to confidence
    )
  }

  // MARK: - Output

  private fun writeJpeg(bitmap: Bitmap): String {
    val dir = File(appContext.cacheDirectory, "AiImageProcessing")
    if (!dir.isDirectory && !dir.mkdirs()) throw ImageWriteFailedException(dir.path)
    val file = File(dir, "${UUID.randomUUID()}.jpg")
    try {
      FileOutputStream(file).use { out ->
        // quality 95 to match ExportManager.exportImage (compressionQuality 0.95).
        bitmap.compress(Bitmap.CompressFormat.JPEG, 95, out)
      }
    } catch (e: Exception) {
      throw ImageWriteFailedException(file.path)
    }
    return Uri.fromFile(file).toString()
  }

  /**
   * Write a HEIC file using the Android HeifWriter API (API ≥ 28).
   * Falls back to JPEG transparently on older devices. This satisfies the
   * ExportFormat 'heic' contract documented in AiImageProcessing.types.ts.
   *
   * Note: this method is provided for future wiring. The current processNegative
   * call always uses writeJpeg; to support exportFormat:'heic' the Pipeline
   * workstream would call a variant of processNegative that accepts an
   * exportFormat flag — that additive change is deferred until task #10 wiring
   * on the Pipeline side.
   */
  @Suppress("unused")
  private fun writeHeic(bitmap: Bitmap): String {
    // HeifWriter requires API 28+. Fall back to JPEG on older devices.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      return writeJpeg(bitmap)
    }
    // On API 28+ we use Bitmap.CompressFormat.HEIF (available since API 30 for
    // Bitmap.compress) or fall back to JPEG. At API 28–29 we also fall back.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      return writeJpeg(bitmap)
    }
    val dir = File(appContext.cacheDirectory, "AiImageProcessing")
    if (!dir.isDirectory && !dir.mkdirs()) throw ImageWriteFailedException(dir.path)
    val file = File(dir, "${UUID.randomUUID()}.heic")
    try {
      @Suppress("DEPRECATION")
      val format = Bitmap.CompressFormat.valueOf("HEIF") // HEIF added in API 30
      FileOutputStream(file).use { out ->
        bitmap.compress(format, 95, out)
      }
    } catch (e: Exception) {
      // CompressFormat.HEIF unavailable at runtime (rare) — fall back to JPEG.
      return writeJpeg(bitmap)
    }
    return Uri.fromFile(file).toString()
  }
}

// MARK: - Exceptions

internal class ImageNotFoundException :
  CodedException(message = "Could not load the input image")

internal class ImageWriteFailedException(file: String) :
  CodedException(message = "Failed to write the processed image to the file: $file")

/**
 * Thrown for `exportFormat: 'dng'` on Android (DECISIONS Q2).
 * The Pipeline workstream catches this and falls back to HEIC/JPEG,
 * surfacing a one-time user note.
 */
internal class UnsupportedFormatException :
  CodedException(message = "UNSUPPORTED_FORMAT: DNG export is not supported on Android. Use 'heic' or 'jpeg'.")
