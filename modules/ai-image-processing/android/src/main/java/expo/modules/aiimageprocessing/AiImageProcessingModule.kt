package expo.modules.aiimageprocessing

import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
 * ports legacy-ios/Processing/Pipeline/*. Android has no Core Image, so the
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
    @Field val mode: String = "color" // "color" | "bw"
    @Field val removeOrangeMask: Boolean = true
    @Field val sharpen: Double = 0.0
    @Field val aiColor: Boolean = false
    @Field val aiDustRemoval: Boolean = false
    @Field val saturation: Double = 0.0
    @Field val highlights: Double = 0.0
    @Field val shadows: Double = 0.0
    @Field val vibrance: Double = 0.0
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
  }

  // MARK: - Input decoding

  /** Decode a `file://`, plain-path, or `content://` URI into an ARGB_8888 bitmap. */
  private fun decodeBitmap(uri: String): Bitmap? {
    val opts = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }
    val resolver get() = appContext.reactContext?.contentResolver
    val decoded: Bitmap? = try {
      when {
        uri.startsWith("file://") -> BitmapFactory.decodeFile(Uri.parse(uri).path, opts)
        uri.contains("://") ->
          resolver?.openInputStream(Uri.parse(uri))?.use { BitmapFactory.decodeStream(it, null, opts) }
        else -> BitmapFactory.decodeFile(uri, opts)
      }
    } catch (e: Exception) {
      null
    } ?: return null

    // Normalize to ARGB_8888 so `getPixels` returns correct 32-bit colour.
    // We only ever read from the source via getPixels, so mutability is not
    // required; the processed output is always a fresh bitmap.
    if (decoded.config == Bitmap.Config.ARGB_8888) {
      return decoded
    }
    val converted = decoded.copy(Bitmap.Config.ARGB_8888, false)
    decoded.recycle()
    return converted
  }

  // MARK: - Pipeline (mirrors ImageProcessor.processNegative steps 2–8)

  private fun runPipeline(source: Bitmap, params: ProcessParams): Bitmap {
    val w = source.width
    val h = source.height
    val n = w * h

    // Read source pixels into a flat ARGB int buffer.
    val argb = IntArray(n)
    source.getPixels(argb, 0, w, 0, 0, w, h)

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

    val isColor = params.mode != "bw"

    // Step 3 — invert negative (CIColorInvert): out = 1 - in (in linear light,
    // matching the iOS graph which inverts after linearizing).
    for (i in 0 until n) {
      r[i] = 1f - r[i]; g[i] = 1f - g[i]; b[i] = 1f - b[i]
    }

    // Step 4 — orange mask removal (colour only). OrangeMaskEstimator.
    if (isColor && params.removeOrangeMask) {
      val mask = estimateOrangeMask(r, g, b, w, h)
      removeOrangeMask(r, g, b, mask)
    }

    // Step 5 — gray-world channel normalization. ColorCorrector.normalizeChannels.
    normalizeChannels(r, g, b)

    // Step 6 — automatic tone curve. ColorCorrector.applyToneCorrection.
    applyToneCorrection(r, g, b)

    // Step 7 — user adjustments, in the legacy order. UserAdjustments.
    applyUserAdjustments(r, g, b, params)

    // B&W: collapse to luminance (matches the iOS FilmType.blackAndWhite path).
    if (!isColor) {
      for (i in 0 until n) {
        val l = 0.2126f * r[i] + 0.7152f * g[i] + 0.0722f * b[i]
        r[i] = l; g[i] = l; b[i] = l
      }
    }

    // Step 8 — sharpen (luminance unsharp mask ~ CISharpenLuminance).
    if (params.sharpen > 0) {
      sharpenLuminance(r, g, b, w, h, params.sharpen.toFloat())
    }

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

  /**
   * Port of OrangeMaskEstimator.estimateOrangeMask. The legacy code samples a
   * 10% downsample rendered to *sRGB* bytes and thresholds with BT.601 luma in
   * 0..255. We replicate that exactly: convert our linear channels back to
   * sRGB 0..255 for sampling, take every ~Nth pixel as the 10% downsample,
   * collect dark pixels (luma < 51), average the 100 darkest.
   */
  private fun estimateOrangeMask(r: FloatArray, g: FloatArray, b: FloatArray, w: Int, h: Int): OrangeMask {
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
    val n = r.size

    // 1. Exposure — CIExposureAdjust: linear multiply by 2^EV.
    if (p.exposure != 0.0) {
      val gain = 2.0.pow(p.exposure).toFloat()
      for (i in 0 until n) { r[i] *= gain; g[i] *= gain; b[i] *= gain }
    }

    // 2. Highlights & shadows — approximation of CIHighlightShadowAdjust.
    //    Legacy: highlightAmount = 1 - highlights (lower => darker highlights),
    //    shadowAmount = shadows (higher => lifted shadows). We apply a smooth
    //    luminance-weighted lift/compress in display space.
    if (p.highlights != 0.0 || p.shadows != 0.0) {
      val hi = (1.0 - p.highlights).toFloat() // around 1.0
      val sh = p.shadows.toFloat()            // around 0.0
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
    if (p.contrast != 0.0) {
      val c = (1.0 + p.contrast).toFloat()
      for (i in 0 until n) {
        r[i] = srgbToLinear(clamp01((linearToSrgb(clamp01(r[i])) - 0.5f) * c + 0.5f))
        g[i] = srgbToLinear(clamp01((linearToSrgb(clamp01(g[i])) - 0.5f) * c + 0.5f))
        b[i] = srgbToLinear(clamp01((linearToSrgb(clamp01(b[i])) - 0.5f) * c + 0.5f))
      }
    }

    // 4. Warmth — CITemperatureAndTint: neutral 6500 + value*2000 (4500..8500K).
    //    Approximated as per-channel scale: warmer boosts R, cuts B; cooler the
    //    inverse. Operates in linear light.
    if (p.warmth != 0.0) {
      val warm = p.warmth.toFloat() // -1..+1
      val rScale = 1f + 0.2f * warm
      val bScale = 1f - 0.2f * warm
      for (i in 0 until n) { r[i] *= rScale; b[i] *= bScale }
    }

    // 5. Saturation — CIColorControls: saturation = 1 + value (BT.601 luma pivot).
    if (p.saturation != 0.0) {
      applySaturation(r, g, b, (1.0 + p.saturation).toFloat())
    }

    // 6. Vibrance — CIVibrance: selective saturation, stronger on muted colours.
    if (p.vibrance != 0.0) {
      applyVibrance(r, g, b, p.vibrance.toFloat())
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
   * bitmap. Operates entirely in display-referred sRGB space (0..255 per
   * channel) because the source is already an encoded positive — no need for
   * linear-light round-trips here. The filter order mirrors iOS Core Image
   * (exposure → highlights+shadows → contrast → warmth → saturation → vibrance).
   *
   * Returns a new ARGB_8888 Bitmap; the caller owns both source and result.
   */
  private fun runAdjustmentsOnly(source: Bitmap, p: UserAdjustParams): Bitmap {
    val w = source.width
    val h = source.height
    val n = w * h

    val argb = IntArray(n)
    source.getPixels(argb, 0, w, 0, 0, w, h)

    // Work in float [0,1] display-space (no linearize — source is already sRGB positive).
    val r = FloatArray(n)
    val g = FloatArray(n)
    val b = FloatArray(n)
    for (i in 0 until n) {
      val px = argb[i]
      r[i] = ((px shr 16) and 0xFF) / 255f
      g[i] = ((px shr 8)  and 0xFF) / 255f
      b[i] = (px          and 0xFF) / 255f
    }

    // 1. Exposure — CIExposureAdjust: multiply by 2^EV in display space
    //    (sRGB-encoded values, matching how CIExposureAdjust behaves on a
    //    display-referred image that hasn't been explicitly linearized).
    if (p.exposure != 0.0) {
      val gain = 2.0.pow(p.exposure).toFloat()
      for (i in 0 until n) { r[i] = clamp01(r[i] * gain); g[i] = clamp01(g[i] * gain); b[i] = clamp01(b[i] * gain) }
    }

    // 2. Highlights & shadows — approximation of CIHighlightShadowAdjust.
    //    highlightAmount = 1 - highlights; shadowAmount = shadows.
    if (p.highlights != 0.0 || p.shadows != 0.0) {
      val hi = (1.0 - p.highlights).toFloat()
      val sh = p.shadows.toFloat()
      for (i in 0 until n) {
        val lum = 0.2126f * r[i] + 0.7152f * g[i] + 0.0722f * b[i]
        val shadowW = 1f - lum
        val highW   = lum
        val lift  = sh * 0.5f * shadowW
        val scale = 1f + (hi - 1f) * highW
        r[i] = clamp01((r[i] + lift) * scale)
        g[i] = clamp01((g[i] + lift) * scale)
        b[i] = clamp01((b[i] + lift) * scale)
      }
    }

    // 3. Contrast — CIColorControls: (v - 0.5) * (1 + contrast) + 0.5.
    if (p.contrast != 0.0) {
      val c = (1.0 + p.contrast).toFloat()
      for (i in 0 until n) {
        r[i] = clamp01((r[i] - 0.5f) * c + 0.5f)
        g[i] = clamp01((g[i] - 0.5f) * c + 0.5f)
        b[i] = clamp01((b[i] - 0.5f) * c + 0.5f)
      }
    }

    // 4. Warmth — CITemperatureAndTint approximation. neutral = 6500 + value*2000.
    if (p.warmth != 0.0) {
      val warm = p.warmth.toFloat()
      val rScale = 1f + 0.2f * warm
      val bScale = 1f - 0.2f * warm
      for (i in 0 until n) { r[i] = clamp01(r[i] * rScale); b[i] = clamp01(b[i] * bScale) }
    }

    // 5. Saturation — CIColorControls: saturation = 1 + value (BT.601 luma).
    if (p.saturation != 0.0) {
      val sat = (1.0 + p.saturation).toFloat()
      for (i in 0 until n) {
        val l = 0.299f * r[i] + 0.587f * g[i] + 0.114f * b[i]
        r[i] = clamp01(l + (r[i] - l) * sat)
        g[i] = clamp01(l + (g[i] - l) * sat)
        b[i] = clamp01(l + (b[i] - l) * sat)
      }
    }

    // 6. Vibrance — selective saturation (CIVibrance approximation).
    if (p.vibrance != 0.0) {
      val amount = p.vibrance.toFloat()
      for (i in 0 until n) {
        val mx = maxOf(r[i], g[i], b[i])
        val mn = minOf(r[i], g[i], b[i])
        val satVal = if (mx > 0f) (mx - mn) / mx else 0f
        val factor = 1f + amount * (1f - satVal)
        val l = 0.299f * r[i] + 0.587f * g[i] + 0.114f * b[i]
        r[i] = clamp01(l + (r[i] - l) * factor)
        g[i] = clamp01(l + (g[i] - l) * factor)
        b[i] = clamp01(l + (b[i] - l) * factor)
      }
    }

    val out = IntArray(n)
    for (i in 0 until n) {
      val rr = (r[i] * 255f).roundToInt().coerceIn(0, 255)
      val gg = (g[i] * 255f).roundToInt().coerceIn(0, 255)
      val bb = (b[i] * 255f).roundToInt().coerceIn(0, 255)
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
