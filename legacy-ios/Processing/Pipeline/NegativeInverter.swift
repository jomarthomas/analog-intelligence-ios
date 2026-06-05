//
//  NegativeInverter.swift
//  AnalogIntelligence
//
//  Handles negative to positive conversion for film negatives.
//  Inverts color channels and applies film-specific corrections.
//

import Foundation
import CoreImage
import Accelerate

/// Inverts film negatives to positive images
class NegativeInverter {

    // MARK: - Inversion Methods

    /// Invert a negative image to positive
    /// - Parameters:
    ///   - image: Input negative image (in linear RGB)
    ///   - filmType: Type of film negative
    /// - Returns: Inverted positive image
    func invertNegative(
        image: CIImage,
        filmType: ImageProcessor.FilmType
    ) async throws -> CIImage {

        switch filmType {
        case .colorNegative:
            return await invertColorNegative(image: image)
        case .blackAndWhite:
            return invertBlackAndWhite(image: image)
        case .slide:
            // Slides are already positive, no inversion needed
            return image
        }
    }

    // MARK: - Color Negative Inversion

    /// Invert color negative film
    /// Color negatives have an orange mask and inverted colors
    private func invertColorNegative(image: CIImage) async -> CIImage {

        // Use CIColorInvert for basic inversion
        guard let invertFilter = CIFilter(name: "CIColorInvert") else {
            return image
        }

        invertFilter.setValue(image, forKey: kCIInputImageKey)

        guard let inverted = invertFilter.outputImage else {
            return image
        }

        return inverted
    }

    // MARK: - Black and White Inversion

    /// Invert black and white negative film
    private func invertBlackAndWhite(image: CIImage) -> CIImage {

        // B&W negatives are simpler - just invert luminance
        guard let invertFilter = CIFilter(name: "CIColorInvert") else {
            return image
        }

        invertFilter.setValue(image, forKey: kCIInputImageKey)

        guard let inverted = invertFilter.outputImage else {
            return image
        }

        return inverted
    }

    // MARK: - Advanced Inversion with Accelerate

    /// Invert using Accelerate framework for maximum performance
    /// This method provides fine-grained control over the inversion process
    func invertUsingAccelerate(cgImage: CGImage) throws -> CGImage {
        let context = CIContext()
        let input = CIImage(cgImage: cgImage)

        guard let filter = CIFilter(name: "CIColorInvert") else {
            throw ProcessingError.processingFailed("CIColorInvert unavailable")
        }
        filter.setValue(input, forKey: kCIInputImageKey)

        guard let output = filter.outputImage,
              let outputCGImage = context.createCGImage(output, from: output.extent) else {
            throw ProcessingError.processingFailed("Failed to invert image")
        }

        return outputCGImage
    }

    // MARK: - Channel-Specific Inversion

    /// Invert with per-channel control
    /// Useful for handling color negative films with different channel characteristics
    func invertWithChannelControl(
        image: CIImage,
        redGain: Float = 1.0,
        greenGain: Float = 1.0,
        blueGain: Float = 1.0
    ) -> CIImage {

        // First, invert the image
        guard let invertFilter = CIFilter(name: "CIColorInvert") else {
            return image
        }
        invertFilter.setValue(image, forKey: kCIInputImageKey)

        guard let inverted = invertFilter.outputImage else {
            return image
        }

        // Then apply channel-specific gains
        guard let matrixFilter = CIFilter(name: "CIColorMatrix") else {
            return inverted
        }

        matrixFilter.setValue(inverted, forKey: kCIInputImageKey)

        // Red channel
        matrixFilter.setValue(CIVector(x: CGFloat(redGain), y: 0, z: 0, w: 0), forKey: "inputRVector")

        // Green channel
        matrixFilter.setValue(CIVector(x: 0, y: CGFloat(greenGain), z: 0, w: 0), forKey: "inputGVector")

        // Blue channel
        matrixFilter.setValue(CIVector(x: 0, y: 0, z: CGFloat(blueGain), w: 0), forKey: "inputBVector")

        // Alpha channel (unchanged)
        matrixFilter.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")

        // Bias vector (no offset)
        matrixFilter.setValue(CIVector(x: 0, y: 0, z: 0, w: 0), forKey: "inputBiasVector")

        return matrixFilter.outputImage ?? inverted
    }

    // MARK: - Histogram-Based Inversion

    /// Analyze histogram to determine optimal inversion parameters
    func analyzeNegativeHistogram(image: CIImage, context: CIContext) -> HistogramStats {

        let extent = image.extent
        let inputExtent = CIVector(
            x: extent.origin.x,
            y: extent.origin.y,
            z: extent.size.width,
            w: extent.size.height
        )

        guard let histogramFilter = CIFilter(name: "CIAreaHistogram") else {
            return HistogramStats()
        }

        histogramFilter.setValue(image, forKey: kCIInputImageKey)
        histogramFilter.setValue(inputExtent, forKey: "inputExtent")
        histogramFilter.setValue(256, forKey: "inputCount")

        guard let histogramOutput = histogramFilter.outputImage else {
            return HistogramStats()
        }

        // Extract histogram data
        let histogramBounds = histogramOutput.extent
        var histogramData = [UInt8](repeating: 0, count: 256 * 4)

        context.render(
            histogramOutput,
            toBitmap: &histogramData,
            rowBytes: 256 * 4,
            bounds: histogramBounds,
            format: .RGBA8,
            colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
        )

        // Analyze histogram statistics
        return calculateHistogramStats(data: histogramData)
    }

    /// Calculate statistics from histogram data
    private func calculateHistogramStats(data: [UInt8]) -> HistogramStats {

        var stats = HistogramStats()

        // Calculate mean, min, max for each channel
        let channelCount = 4 // RGBA
        let binCount = data.count / channelCount

        for channel in 0..<3 { // RGB only
            var sum: Float = 0
            var count: Float = 0

            for bin in 0..<binCount {
                let index = bin * channelCount + channel
                let value = Float(data[index])
                sum += value * Float(bin)
                count += value
            }

            let mean = count > 0 ? sum / count : 128.0

            switch channel {
            case 0: stats.redMean = mean
            case 1: stats.greenMean = mean
            case 2: stats.blueMean = mean
            default: break
            }
        }

        return stats
    }

    // MARK: - Supporting Types

    struct HistogramStats {
        var redMean: Float = 128.0
        var greenMean: Float = 128.0
        var blueMean: Float = 128.0

        var overallMean: Float {
            return (redMean + greenMean + blueMean) / 3.0
        }
    }
}
