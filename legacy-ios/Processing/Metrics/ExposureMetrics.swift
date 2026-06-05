//
//  ExposureMetrics.swift
//  AnalogIntelligence
//
//  Tracks and analyzes exposure metrics for a roll of film
//

import Foundation
import CoreImage
import UIKit

/// Exposure metrics for a single frame
struct FrameExposureMetrics: Codable {
    let frameNumber: Int
    let averageLuminance: Double
    let shadowClipping: Double
    let highlightClipping: Double
    let captureISO: Float?
    let captureExposureDuration: Double?
    let timestamp: Date

    var isWellExposed: Bool {
        // Consider well-exposed if:
        // - Average luminance is between 0.3 and 0.7
        // - Shadow clipping < 10%
        // - Highlight clipping < 10%
        return averageLuminance > 0.3 &&
               averageLuminance < 0.7 &&
               shadowClipping < 0.10 &&
               highlightClipping < 0.10
    }

    var exposureQuality: ExposureQuality {
        if shadowClipping > 0.20 {
            return .underexposed
        } else if highlightClipping > 0.20 {
            return .overexposed
        } else if isWellExposed {
            return .excellent
        } else {
            return .acceptable
        }
    }

    enum ExposureQuality: String, Codable {
        case excellent = "Excellent"
        case acceptable = "Acceptable"
        case underexposed = "Underexposed"
        case overexposed = "Overexposed"
    }
}

/// Aggregated exposure metrics for an entire roll
struct RollExposureMetrics: Codable {
    let rollID: UUID
    let rollName: String
    let frames: [FrameExposureMetrics]
    let createdAt: Date

    var frameCount: Int {
        return frames.count
    }

    var averageLuminance: Double {
        guard !frames.isEmpty else { return 0 }
        return frames.map { $0.averageLuminance }.reduce(0, +) / Double(frames.count)
    }

    var averageShadowClipping: Double {
        guard !frames.isEmpty else { return 0 }
        return frames.map { $0.shadowClipping }.reduce(0, +) / Double(frames.count)
    }

    var averageHighlightClipping: Double {
        guard !frames.isEmpty else { return 0 }
        return frames.map { $0.highlightClipping }.reduce(0, +) / Double(frames.count)
    }

    var wellExposedFramesCount: Int {
        return frames.filter { $0.isWellExposed }.count
    }

    var wellExposedPercentage: Double {
        guard !frames.isEmpty else { return 0 }
        return Double(wellExposedFramesCount) / Double(frames.count)
    }

    var consistencyScore: Double {
        guard frames.count > 1 else { return 1.0 }

        // Calculate standard deviation of luminance
        let avg = averageLuminance
        let variance = frames.map { pow($0.averageLuminance - avg, 2) }.reduce(0, +) / Double(frames.count)
        let stdDev = sqrt(variance)

        // Consistency score: 1.0 = perfect, 0.0 = highly inconsistent
        // Standard deviation of 0.1 or less is considered very consistent
        return max(0, 1.0 - (stdDev / 0.2))
    }

    var overallQuality: RollQuality {
        let wellExposedRatio = wellExposedPercentage

        if wellExposedRatio > 0.8 && consistencyScore > 0.7 {
            return .excellent
        } else if wellExposedRatio > 0.6 {
            return .good
        } else if wellExposedRatio > 0.4 {
            return .fair
        } else {
            return .poor
        }
    }

    enum RollQuality: String, Codable {
        case excellent = "Excellent"
        case good = "Good"
        case fair = "Fair"
        case poor = "Poor"

        var description: String {
            switch self {
            case .excellent:
                return "Consistently well-exposed throughout the roll"
            case .good:
                return "Most frames are well-exposed with minor variations"
            case .fair:
                return "Mixed exposure quality across the roll"
            case .poor:
                return "Significant exposure issues detected"
            }
        }
    }

    /// Generate insights for the roll
    func generateRollInsights() -> [RollInsight] {
        var insights: [RollInsight] = []

        // Overall quality insight
        insights.append(RollInsight(
            type: overallQuality == .excellent || overallQuality == .good ? .positive : .warning,
            title: "Roll Quality: \(overallQuality.rawValue)",
            description: overallQuality.description,
            metric: wellExposedPercentage
        ))

        // Consistency insight
        if consistencyScore > 0.8 {
            insights.append(RollInsight(
                type: .positive,
                title: "Excellent Consistency",
                description: "Exposure is very consistent across the roll",
                metric: consistencyScore
            ))
        } else if consistencyScore < 0.5 {
            insights.append(RollInsight(
                type: .warning,
                title: "Inconsistent Exposure",
                description: "Exposure varies significantly between frames",
                metric: consistencyScore
            ))
        }

        // Shadow/highlight analysis
        if averageShadowClipping < 0.05 {
            insights.append(RollInsight(
                type: .positive,
                title: "Excellent Shadow Preservation",
                description: "Shadow detail is well-preserved across the roll",
                metric: averageShadowClipping
            ))
        }

        if averageHighlightClipping < 0.05 {
            insights.append(RollInsight(
                type: .positive,
                title: "Highlights Well-Preserved",
                description: "Minimal highlight clipping detected",
                metric: averageHighlightClipping
            ))
        }

        return insights
    }
}

/// Manager for calculating and tracking exposure metrics
class ExposureMetricsManager {
    private let histogramAnalyzer = HistogramAnalyzer()

    /// Calculate metrics for a single frame
    func calculateFrameMetrics(
        image: UIImage,
        frameNumber: Int,
        captureISO: Float? = nil,
        captureExposureDuration: Double? = nil
    ) -> FrameExposureMetrics? {

        guard let histogram = histogramAnalyzer.generateHistogram(from: image) else {
            return nil
        }

        let clipping = histogramAnalyzer.analyzeClipping(histogram: histogram)
        let avgLuminance = histogramAnalyzer.averageLuminance(histogram: histogram)

        return FrameExposureMetrics(
            frameNumber: frameNumber,
            averageLuminance: avgLuminance,
            shadowClipping: clipping.shadowClipping,
            highlightClipping: clipping.highlightClipping,
            captureISO: captureISO,
            captureExposureDuration: captureExposureDuration,
            timestamp: Date()
        )
    }

    /// Build roll metrics from individual frame metrics
    func buildRollMetrics(
        rollID: UUID,
        rollName: String,
        frames: [FrameExposureMetrics]
    ) -> RollExposureMetrics {
        return RollExposureMetrics(
            rollID: rollID,
            rollName: rollName,
            frames: frames.sorted { $0.frameNumber < $1.frameNumber },
            createdAt: Date()
        )
    }
}
