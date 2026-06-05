//
//  ColorCorrector.swift
//  AnalogIntelligence
//
//  Handles color channel normalization and tone correction.
//  Balances color channels and applies optimal tone curves.
//

import Foundation
import CoreImage
import Accelerate

/// Color correction and tone mapping
class ColorCorrector {

    // MARK: - Channel Normalization

    /// Normalize color channels to balance the image
    /// - Parameters:
    ///   - image: Input image after orange mask removal
    ///   - context: Core Image context for rendering
    /// - Returns: Normalized image
    func normalizeChannels(
        image: CIImage,
        context: CIContext
    ) async throws -> CIImage {

        // Analyze channel statistics
        let stats = await analyzeChannelStatistics(image: image, context: context)

        // Calculate normalization factors
        let normFactors = calculateNormalizationFactors(stats: stats)

        // Apply normalization
        return applyChannelNormalization(image: image, factors: normFactors)
    }

    // MARK: - Tone Correction

    /// Apply tone correction to optimize dynamic range
    /// - Parameters:
    ///   - image: Input image after channel normalization
    ///   - context: Core Image context for rendering
    /// - Returns: Tone-corrected image
    func applyToneCorrection(
        image: CIImage,
        context: CIContext
    ) async throws -> CIImage {

        // Analyze image histogram
        let histogram = await analyzeHistogram(image: image, context: context)

        // Calculate optimal tone curve
        let toneCurve = calculateToneCurve(histogram: histogram)

        // Apply tone curve
        return applyToneCurve(image: image, curve: toneCurve)
    }

    // MARK: - Channel Statistics

    /// Analyze per-channel statistics
    private func analyzeChannelStatistics(
        image: CIImage,
        context: CIContext
    ) async -> ChannelStatistics {

        let extent = image.extent

        // Use area average to get mean values
        guard let avgFilter = CIFilter(name: "CIAreaAverage") else {
            return ChannelStatistics()
        }

        avgFilter.setValue(image, forKey: kCIInputImageKey)
        avgFilter.setValue(CIVector(cgRect: extent), forKey: kCIInputExtentKey)

        guard let avgOutput = avgFilter.outputImage else {
            return ChannelStatistics()
        }

        // Render to get average color
        var bitmap = [UInt8](repeating: 0, count: 4)
        context.render(
            avgOutput,
            toBitmap: &bitmap,
            rowBytes: 4,
            bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
            format: .RGBA8,
            colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
        )

        // Use area histogram for more detailed statistics
        guard let histFilter = CIFilter(name: "CIAreaHistogram") else {
            return ChannelStatistics()
        }

        histFilter.setValue(image, forKey: kCIInputImageKey)
        histFilter.setValue(CIVector(cgRect: extent), forKey: "inputExtent")
        histFilter.setValue(256, forKey: "inputCount")

        guard let histOutput = histFilter.outputImage else {
            return ChannelStatistics()
        }

        var histData = [UInt8](repeating: 0, count: 256 * 4)
        context.render(
            histOutput,
            toBitmap: &histData,
            rowBytes: 256 * 4,
            bounds: histOutput.extent,
            format: .RGBA8,
            colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
        )

        // Calculate statistics from histogram
        return calculateStatistics(histogramData: histData, averageColor: bitmap)
    }

    /// Calculate channel statistics from histogram data
    private func calculateStatistics(
        histogramData: [UInt8],
        averageColor: [UInt8]
    ) -> ChannelStatistics {

        var stats = ChannelStatistics()

        // Set mean values from average
        stats.redMean = Float(averageColor[0]) / 255.0
        stats.greenMean = Float(averageColor[1]) / 255.0
        stats.blueMean = Float(averageColor[2]) / 255.0

        // Calculate min/max from histogram (5th and 95th percentiles)
        for channel in 0..<3 {
            var total: Float = 0
            for bin in 0..<256 {
                let index = bin * 4 + channel
                total += Float(histogramData[index])
            }

            var cumulative: Float = 0
            var minValue: Float = 0
            var maxValue: Float = 255

            for bin in 0..<256 {
                let index = bin * 4 + channel
                cumulative += Float(histogramData[index])

                if cumulative >= total * 0.05 && minValue == 0 {
                    minValue = Float(bin) / 255.0
                }

                if cumulative >= total * 0.95 {
                    maxValue = Float(bin) / 255.0
                    break
                }
            }

            switch channel {
            case 0:
                stats.redMin = minValue
                stats.redMax = maxValue
            case 1:
                stats.greenMin = minValue
                stats.greenMax = maxValue
            case 2:
                stats.blueMin = minValue
                stats.blueMax = maxValue
            default:
                break
            }
        }

        return stats
    }

    // MARK: - Normalization Factors

    /// Calculate normalization factors to balance channels
    private func calculateNormalizationFactors(stats: ChannelStatistics) -> NormalizationFactors {

        // Use gray world assumption - average of all channels should be equal
        let targetMean: Float = (stats.redMean + stats.greenMean + stats.blueMean) / 3.0

        // Calculate gain for each channel
        let redGain = targetMean / max(stats.redMean, 0.01)
        let greenGain = targetMean / max(stats.greenMean, 0.01)
        let blueGain = targetMean / max(stats.blueMean, 0.01)

        // Limit gains to prevent overcompensation
        let maxGain: Float = 2.0
        let minGain: Float = 0.5

        return NormalizationFactors(
            redGain: min(max(redGain, minGain), maxGain),
            greenGain: min(max(greenGain, minGain), maxGain),
            blueGain: min(max(blueGain, minGain), maxGain)
        )
    }

    /// Apply channel normalization using color matrix
    private func applyChannelNormalization(
        image: CIImage,
        factors: NormalizationFactors
    ) -> CIImage {

        guard let matrixFilter = CIFilter(name: "CIColorMatrix") else {
            return image
        }

        matrixFilter.setValue(image, forKey: kCIInputImageKey)

        matrixFilter.setValue(
            CIVector(x: CGFloat(factors.redGain), y: 0, z: 0, w: 0),
            forKey: "inputRVector"
        )
        matrixFilter.setValue(
            CIVector(x: 0, y: CGFloat(factors.greenGain), z: 0, w: 0),
            forKey: "inputGVector"
        )
        matrixFilter.setValue(
            CIVector(x: 0, y: 0, z: CGFloat(factors.blueGain), w: 0),
            forKey: "inputBVector"
        )
        matrixFilter.setValue(
            CIVector(x: 0, y: 0, z: 0, w: 1),
            forKey: "inputAVector"
        )
        matrixFilter.setValue(
            CIVector(x: 0, y: 0, z: 0, w: 0),
            forKey: "inputBiasVector"
        )

        return matrixFilter.outputImage ?? image
    }

    // MARK: - Histogram Analysis

    /// Analyze image histogram for tone curve calculation
    private func analyzeHistogram(
        image: CIImage,
        context: CIContext
    ) async -> Histogram {

        let extent = image.extent

        guard let histFilter = CIFilter(name: "CIAreaHistogram") else {
            return Histogram()
        }

        histFilter.setValue(image, forKey: kCIInputImageKey)
        histFilter.setValue(CIVector(cgRect: extent), forKey: "inputExtent")
        histFilter.setValue(256, forKey: "inputCount")

        guard let histOutput = histFilter.outputImage else {
            return Histogram()
        }

        var histData = [UInt8](repeating: 0, count: 256 * 4)
        context.render(
            histOutput,
            toBitmap: &histData,
            rowBytes: 256 * 4,
            bounds: histOutput.extent,
            format: .RGBA8,
            colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
        )

        return Histogram(data: histData)
    }

    // MARK: - Tone Curve

    /// Calculate optimal tone curve based on histogram
    private func calculateToneCurve(histogram: Histogram) -> ToneCurve {

        // Calculate cumulative distribution for auto-levels
        var luminanceCDF = [Float](repeating: 0, count: 256)
        var total: Float = 0

        // Build luminance histogram from RGB
        for bin in 0..<256 {
            let r = Float(histogram.data[bin * 4])
            let g = Float(histogram.data[bin * 4 + 1])
            let b = Float(histogram.data[bin * 4 + 2])

            let luminance = 0.299 * r + 0.587 * g + 0.114 * b
            total += luminance
        }

        // Calculate CDF
        var cumulative: Float = 0
        for bin in 0..<256 {
            let r = Float(histogram.data[bin * 4])
            let g = Float(histogram.data[bin * 4 + 1])
            let b = Float(histogram.data[bin * 4 + 2])

            let luminance = 0.299 * r + 0.587 * g + 0.114 * b
            cumulative += luminance
            luminanceCDF[bin] = cumulative / max(total, 1.0)
        }

        // Find black and white points (1% and 99%)
        var blackPoint: Float = 0
        var whitePoint: Float = 1.0

        for bin in 0..<256 {
            if luminanceCDF[bin] >= 0.01 && blackPoint == 0 {
                blackPoint = Float(bin) / 255.0
            }
            if luminanceCDF[bin] >= 0.99 {
                whitePoint = Float(bin) / 255.0
                break
            }
        }

        // Create tone curve with S-curve for contrast
        var curve = ToneCurve()
        curve.blackPoint = blackPoint
        curve.whitePoint = whitePoint
        curve.midPoint = 0.5 // Neutral midtones
        curve.contrast = 1.1 // Slight contrast boost

        return curve
    }

    /// Apply tone curve to image
    private func applyToneCurve(image: CIImage, curve: ToneCurve) -> CIImage {

        // First, apply levels adjustment
        guard let levelsFilter = CIFilter(name: "CIColorControls") else {
            return image
        }

        // Use exposure to adjust black/white points
        let inputRange = curve.whitePoint - curve.blackPoint
        let exposure = log2(1.0 / max(inputRange, 0.1))

        levelsFilter.setValue(image, forKey: kCIInputImageKey)
        levelsFilter.setValue(exposure, forKey: kCIInputBrightnessKey)
        levelsFilter.setValue(curve.contrast, forKey: kCIInputContrastKey)

        guard let levelsOutput = levelsFilter.outputImage else {
            return image
        }

        // Apply gamma for midtone adjustment
        guard let gammaFilter = CIFilter(name: "CIGammaAdjust") else {
            return levelsOutput
        }

        let gamma = 1.0 / curve.midPoint
        gammaFilter.setValue(levelsOutput, forKey: kCIInputImageKey)
        gammaFilter.setValue(gamma, forKey: "inputPower")

        return gammaFilter.outputImage ?? levelsOutput
    }

    // MARK: - Advanced Tone Mapping with Accelerate

    /// Apply tone curve using Accelerate for maximum performance
    func applyToneCurveAccelerate(
        cgImage: CGImage,
        curve: ToneCurve
    ) throws -> CGImage {

        let width = cgImage.width
        let height = cgImage.height

        // Create buffers
        var sourceBuffer = vImage_Buffer()
        var format = vImage_CGImageFormat(
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            colorSpace: nil,
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.first.rawValue),
            version: 0,
            decode: nil,
            renderingIntent: .defaultIntent
        )

        var error = vImageBuffer_InitWithCGImage(
            &sourceBuffer,
            &format,
            nil,
            cgImage,
            vImage_Flags(kvImageNoFlags)
        )

        guard error == kvImageNoError else {
            throw ProcessingError.processingFailed("Failed to initialize buffer")
        }

        defer {
            sourceBuffer.data.deallocate()
        }

        var destBuffer = vImage_Buffer()
        error = vImageBuffer_Init(
            &destBuffer,
            vImagePixelCount(height),
            vImagePixelCount(width),
            format.bitsPerPixel,
            vImage_Flags(kvImageNoFlags)
        )

        guard error == kvImageNoError else {
            throw ProcessingError.processingFailed("Failed to initialize destination buffer")
        }

        defer {
            destBuffer.data.deallocate()
        }

        // Create lookup table for tone curve
        var lut = [Pixel_8](repeating: 0, count: 256)
        for i in 0..<256 {
            let input = Float(i) / 255.0
            let normalized = (input - curve.blackPoint) / (curve.whitePoint - curve.blackPoint)
            let clamped = max(0, min(1, normalized))
            let output = pow(clamped, Float(1.0 / curve.midPoint)) * curve.contrast
            lut[i] = Pixel_8(min(255, max(0, output * 255.0)))
        }

        // Apply lookup table
        error = vImageTableLookUp_ARGB8888(
            &sourceBuffer,
            &destBuffer,
            nil, // Alpha unchanged
            &lut,
            &lut,
            &lut,
            vImage_Flags(kvImageNoFlags)
        )

        guard error == kvImageNoError else {
            throw ProcessingError.processingFailed("Failed to apply tone curve")
        }

        guard let outputImage = vImageCreateCGImageFromBuffer(
            &destBuffer,
            &format,
            nil,
            nil,
            vImage_Flags(kvImageNoFlags),
            &error
        )?.takeRetainedValue() else {
            throw ProcessingError.processingFailed("Failed to create output")
        }

        return outputImage
    }

    // MARK: - Supporting Types

    struct ChannelStatistics {
        var redMean: Float = 0.5
        var greenMean: Float = 0.5
        var blueMean: Float = 0.5

        var redMin: Float = 0.0
        var redMax: Float = 1.0
        var greenMin: Float = 0.0
        var greenMax: Float = 1.0
        var blueMin: Float = 0.0
        var blueMax: Float = 1.0
    }

    struct NormalizationFactors {
        var redGain: Float
        var greenGain: Float
        var blueGain: Float
    }

    struct Histogram {
        var data: [UInt8]

        init(data: [UInt8] = [UInt8](repeating: 0, count: 256 * 4)) {
            self.data = data
        }
    }

    struct ToneCurve {
        var blackPoint: Float = 0.0
        var whitePoint: Float = 1.0
        var midPoint: Float = 0.5
        var contrast: Float = 1.0
    }
}
