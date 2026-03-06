//
//  MetricsAnalyzer.swift
//  AnalogIntelligence
//
//  Created by Analog Intelligence
//

import UIKit
import CoreImage

class MetricsAnalyzer {
    static let shared = MetricsAnalyzer()

    private init() {}

    /// Calculate roll metrics from all scanned images
    func calculateRollMetrics() -> RollMetrics? {
        let images = StorageManager.shared.images

        guard !images.isEmpty else { return nil }

        var allHistogramData: [[HistogramBin]] = []
        var totalShadowClipping: Double = 0
        var totalHighlightClipping: Double = 0

        for scannedImage in images {
            guard let uiImage = scannedImage.processedImage else { continue }

            let histogram = calculateHistogram(for: uiImage)
            allHistogramData.append(histogram)

            let clipping = calculateClipping(histogram: histogram)
            totalShadowClipping += clipping.shadow
            totalHighlightClipping += clipping.highlight
        }

        let count = Double(images.count)
        let avgShadowClipping = totalShadowClipping / count
        let avgHighlightClipping = totalHighlightClipping / count

        // Average histogram across all images
        let avgHistogram = averageHistograms(allHistogramData)

        let summary = generateInsightSummary(
            shadowClipping: avgShadowClipping,
            highlightClipping: avgHighlightClipping
        )

        return RollMetrics(
            histogramData: avgHistogram,
            shadowClippingPercent: avgShadowClipping,
            highlightClippingPercent: avgHighlightClipping,
            insightSummary: summary
        )
    }

    /// Calculate histogram for a single image
    private func calculateHistogram(for image: UIImage) -> [HistogramBin] {
        guard let cgImage = image.cgImage else { return [] }

        let width = cgImage.width
        let height = cgImage.height
        let bitsPerComponent = 8
        let bytesPerRow = width * 4
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue

        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: bitsPerComponent,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: bitmapInfo
        ) else { return [] }

        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

        guard let data = context.data else { return [] }

        let pixelData = data.bindMemory(to: UInt8.self, capacity: width * height * 4)

        // Create histogram bins (256 bins for brightness levels)
        var bins = [Int](repeating: 0, count: 256)

        for y in 0..<height {
            for x in 0..<width {
                let offset = (y * width + x) * 4
                let r = Int(pixelData[offset])
                let g = Int(pixelData[offset + 1])
                let b = Int(pixelData[offset + 2])

                // Calculate brightness (luminance)
                let brightness = Int(0.299 * Double(r) + 0.587 * Double(g) + 0.114 * Double(b))
                bins[brightness] += 1
            }
        }

        // Group into 32 bins for chart display
        let groupSize = 8
        var histogramData: [HistogramBin] = []

        for i in 0..<32 {
            let start = i * groupSize
            let end = start + groupSize
            let sum = bins[start..<end].reduce(0, +)
            histogramData.append(HistogramBin(bin: i, count: sum))
        }

        return histogramData
    }

    /// Calculate shadow and highlight clipping percentages
    private func calculateClipping(histogram: [HistogramBin]) -> (shadow: Double, highlight: Double) {
        let totalPixels = histogram.reduce(0) { $0 + $1.count }
        guard totalPixels > 0 else { return (0, 0) }

        // Shadow clipping (first 2 bins)
        let shadowPixels = histogram.prefix(2).reduce(0) { $0 + $1.count }
        let shadowPercent = (Double(shadowPixels) / Double(totalPixels)) * 100

        // Highlight clipping (last 2 bins)
        let highlightPixels = histogram.suffix(2).reduce(0) { $0 + $1.count }
        let highlightPercent = (Double(highlightPixels) / Double(totalPixels)) * 100

        return (shadowPercent, highlightPercent)
    }

    /// Average multiple histograms
    private func averageHistograms(_ histograms: [[HistogramBin]]) -> [HistogramBin] {
        guard !histograms.isEmpty else { return [] }

        let binCount = histograms[0].count
        var averaged: [HistogramBin] = []

        for i in 0..<binCount {
            let sum = histograms.reduce(0) { $0 + $1[i].count }
            let avg = sum / histograms.count
            averaged.append(HistogramBin(bin: i, count: avg))
        }

        return averaged
    }

    /// Generate insight summary based on metrics
    private func generateInsightSummary(shadowClipping: Double, highlightClipping: Double) -> String {
        var insights: [String] = []

        // Analyze shadow clipping
        if shadowClipping < 5 {
            insights.append("Shadows are well preserved")
        } else if shadowClipping < 15 {
            insights.append("Some shadow detail lost")
        } else {
            insights.append("Significant shadow clipping detected")
        }

        // Analyze highlight clipping
        if highlightClipping < 5 {
            insights.append("Highlights are well preserved")
        } else if highlightClipping < 15 {
            insights.append("Some highlight detail lost")
        } else {
            insights.append("Significant highlight clipping detected")
        }

        // Overall assessment
        if shadowClipping < 5 && highlightClipping < 5 {
            insights.append("Overall well-exposed roll with excellent dynamic range")
        } else if shadowClipping < 15 && highlightClipping < 15 {
            insights.append("Overall decent exposure with minor clipping")
        } else {
            insights.append("Consider adjusting exposure for future rolls")
        }

        return insights.joined(separator: ". ") + "."
    }
}
