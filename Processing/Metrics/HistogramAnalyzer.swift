//
//  HistogramAnalyzer.swift
//  AnalogIntelligence
//
//  Analyzes image histograms for exposure quality and clipping detection
//

import Foundation
import CoreImage
import Accelerate
import UIKit

/// Analyzes histogram data for exposure insights
class HistogramAnalyzer {

    /// Histogram data for RGB channels
    struct HistogramData {
        let red: [Double]
        let green: [Double]
        let blue: [Double]
        let luminance: [Double]

        var bins: Int {
            return luminance.count
        }
    }

    /// Clipping analysis results
    struct ClippingAnalysis {
        let shadowClipping: Double  // Percentage of pixels in shadow (0-1)
        let highlightClipping: Double  // Percentage of pixels in highlights (0-1)
        let shadowThreshold: Double = 0.05  // Bottom 5%
        let highlightThreshold: Double = 0.95  // Top 5%
    }

    // MARK: - Public Methods

    /// Generate histogram from image
    func generateHistogram(from image: CIImage, bins: Int = 256) -> HistogramData? {
        let context = CIContext(options: [.workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!])

        guard let cgImage = context.createCGImage(image, from: image.extent) else {
            return nil
        }

        return generateHistogram(from: cgImage, bins: bins)
    }

    /// Generate histogram from UIImage
    func generateHistogram(from uiImage: UIImage, bins: Int = 256) -> HistogramData? {
        guard let cgImage = uiImage.cgImage else {
            return nil
        }

        return generateHistogram(from: cgImage, bins: bins)
    }

    /// Generate histogram from CGImage
    func generateHistogram(from cgImage: CGImage, bins: Int = 256) -> HistogramData? {
        let width = cgImage.width
        let height = cgImage.height

        // Create bitmap context
        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(
                data: nil,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: width * 4,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              ) else {
            return nil
        }

        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

        guard let pixelData = context.data else {
            return nil
        }

        // Calculate histograms for each channel
        var redHistogram = [UInt](repeating: 0, count: bins)
        var greenHistogram = [UInt](repeating: 0, count: bins)
        var blueHistogram = [UInt](repeating: 0, count: bins)

        let totalPixels = width * height
        let pixels = pixelData.bindMemory(to: UInt8.self, capacity: totalPixels * 4)

        for i in 0..<totalPixels {
            let offset = i * 4
            let r = Int(pixels[offset])
            let g = Int(pixels[offset + 1])
            let b = Int(pixels[offset + 2])

            let rBin = min(r * bins / 256, bins - 1)
            let gBin = min(g * bins / 256, bins - 1)
            let bBin = min(b * bins / 256, bins - 1)

            redHistogram[rBin] += 1
            greenHistogram[gBin] += 1
            blueHistogram[bBin] += 1
        }

        // Calculate luminance histogram
        var luminanceHistogram = [UInt](repeating: 0, count: bins)

        for i in 0..<totalPixels {
            let offset = i * 4
            let r = Double(pixels[offset])
            let g = Double(pixels[offset + 1])
            let b = Double(pixels[offset + 2])

            // ITU-R BT.709 luminance weights
            let luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
            let bin = min(Int(luminance) * bins / 256, bins - 1)
            luminanceHistogram[bin] += 1
        }

        // Normalize histograms
        let normalizedRed = normalize(histogram: redHistogram, totalPixels: totalPixels)
        let normalizedGreen = normalize(histogram: greenHistogram, totalPixels: totalPixels)
        let normalizedBlue = normalize(histogram: blueHistogram, totalPixels: totalPixels)
        let normalizedLuminance = normalize(histogram: luminanceHistogram, totalPixels: totalPixels)

        return HistogramData(
            red: normalizedRed,
            green: normalizedGreen,
            blue: normalizedBlue,
            luminance: normalizedLuminance
        )
    }

    /// Analyze clipping in the histogram
    func analyzeClipping(histogram: HistogramData) -> ClippingAnalysis {
        let lum = histogram.luminance
        let bins = lum.count

        // Calculate shadow clipping (bottom 5% of histogram)
        let shadowBins = max(1, bins / 20)  // 5% of bins
        let shadowSum = lum[..<shadowBins].reduce(0.0, +)

        // Calculate highlight clipping (top 5% of histogram)
        let highlightBins = max(1, bins / 20)
        let highlightStart = bins - highlightBins
        let highlightSum = lum[highlightStart...].reduce(0.0, +)

        return ClippingAnalysis(
            shadowClipping: shadowSum,
            highlightClipping: highlightSum
        )
    }

    /// Calculate average luminance
    func averageLuminance(histogram: HistogramData) -> Double {
        let bins = histogram.luminance.count
        var weightedSum = 0.0

        for (index, value) in histogram.luminance.enumerated() {
            let binCenter = (Double(index) + 0.5) / Double(bins)
            weightedSum += binCenter * value
        }

        return weightedSum
    }

    /// Generate insights from histogram analysis
    func generateInsights(histogram: HistogramData) -> [RollInsight] {
        let clipping = analyzeClipping(histogram: histogram)
        let avgLum = averageLuminance(histogram: histogram)

        return InsightGenerator.generateInsights(
            shadowClipping: clipping.shadowClipping,
            highlightClipping: clipping.highlightClipping,
            histogram: histogram.luminance
        )
    }

    // MARK: - Private Methods

    private func normalize(histogram: [UInt], totalPixels: Int) -> [Double] {
        return histogram.map { Double($0) / Double(totalPixels) }
    }
}
