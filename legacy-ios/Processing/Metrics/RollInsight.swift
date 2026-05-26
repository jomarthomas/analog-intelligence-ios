//
//  RollInsight.swift
//  AnalogIntelligence
//
//  Model for roll exposure insights and analysis
//

import Foundation

/// Represents an insight about a roll's exposure quality
struct RollInsight: Identifiable, Codable {
    let id: UUID
    let type: InsightType
    let title: String
    let description: String
    let metric: Double?
    let createdAt: Date

    enum InsightType: String, Codable {
        case positive
        case warning
        case info
    }

    init(
        id: UUID = UUID(),
        type: InsightType,
        title: String,
        description: String,
        metric: Double? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.type = type
        self.title = title
        self.description = description
        self.metric = metric
        self.createdAt = createdAt
    }
}

/// Analyzes exposure data to generate insights
struct InsightGenerator {
    /// Generate insights from histogram data
    static func generateInsights(
        shadowClipping: Double,
        highlightClipping: Double,
        histogram: [Double]
    ) -> [RollInsight] {
        var insights: [RollInsight] = []

        // Shadow clipping analysis
        if shadowClipping < 0.05 {
            insights.append(RollInsight(
                type: .positive,
                title: "Excellent Shadow Detail",
                description: "Shadows are well-preserved with minimal clipping",
                metric: shadowClipping
            ))
        } else if shadowClipping > 0.15 {
            insights.append(RollInsight(
                type: .warning,
                title: "Shadow Clipping Detected",
                description: "Consider increasing exposure to preserve shadow detail",
                metric: shadowClipping
            ))
        }

        // Highlight clipping analysis
        if highlightClipping < 0.05 {
            insights.append(RollInsight(
                type: .positive,
                title: "Highlights Preserved Well",
                description: "No significant highlight clipping detected",
                metric: highlightClipping
            ))
        } else if highlightClipping > 0.15 {
            insights.append(RollInsight(
                type: .warning,
                title: "Highlight Clipping Detected",
                description: "Some highlights may be overexposed",
                metric: highlightClipping
            ))
        }

        // Overall exposure analysis
        let avgValue = histogram.reduce(0.0, +) / Double(histogram.count)
        if avgValue > 0.4 && avgValue < 0.6 {
            insights.append(RollInsight(
                type: .positive,
                title: "Overall Well-Exposed Roll",
                description: "Exposure levels are well-balanced across the roll",
                metric: avgValue
            ))
        }

        // Distribution analysis
        let midtonesRange = histogram[histogram.count / 3 ..< (2 * histogram.count / 3)]
        let midtonesValue = midtonesRange.reduce(0.0, +) / Double(midtonesRange.count)

        if midtonesValue > 0.5 {
            insights.append(RollInsight(
                type: .info,
                title: "Good Midtone Separation",
                description: "Strong detail in middle tones",
                metric: midtonesValue
            ))
        }

        return insights
    }
}
