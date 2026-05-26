//
//  InsightsView.swift
//  Analog Intelligence
//
//  Pro feature: Exposure analysis with histogram and clipping detection.
//

import SwiftUI
import UIKit

struct InsightsView: View {
    @StateObject private var purchaseState = PurchaseState.shared
    @State private var rollData: RollAnalysisData?
    @State private var showingProUpgrade = false

    private let storageManager = StorageManager.shared

    var body: some View {
        NavigationView {
            if !purchaseState.isPro {
                ProFeatureLock(
                    featureName: "Insights",
                    featureDescription: "Get exposure analysis for your scans with histograms and clipping metrics.",
                    onUpgrade: { showingProUpgrade = true }
                )
            } else {
                ZStack {
                    AnalogTheme.backgroundDark
                        .ignoresSafeArea()

                    ScrollView {
                        VStack(spacing: 20) {
                            if let data = rollData {
                                VStack(alignment: .leading, spacing: 16) {
                                    Text("Exposure analysis")
                                        .font(AnalogTheme.headline())
                                        .foregroundColor(AnalogTheme.textPrimary)

                                    HistogramChart(data: data.histogramData)
                                        .frame(height: 180)
                                }
                                .padding(AnalogTheme.paddingMedium)
                                .cardStyle()
                                .padding(.horizontal, AnalogTheme.paddingMedium)

                                HStack(spacing: 16) {
                                    ClippingCard(
                                        title: "% Shadow Clipping",
                                        percentage: data.shadowClipping,
                                        color: .white,
                                        icon: "moon.fill"
                                    )

                                    ClippingCard(
                                        title: "% Highlight Clipping",
                                        percentage: data.highlightClipping,
                                        color: AnalogTheme.primaryOrange,
                                        icon: "sun.max.fill"
                                    )
                                }
                                .padding(.horizontal, AnalogTheme.paddingMedium)

                                VStack(alignment: .leading, spacing: 12) {
                                    Text("Template-based")
                                        .font(AnalogTheme.caption())
                                        .foregroundColor(AnalogTheme.textSecondary)

                                    ForEach(data.insights) { insight in
                                        ExposureAnalysisCard(insight: insight)
                                    }
                                }
                                .padding(.horizontal, AnalogTheme.paddingMedium)
                                .padding(.bottom)
                            } else {
                                emptyStateView
                            }
                        }
                        .padding(.top)
                    }
                }
                .navigationTitle("INSIGHTS (PRO)")
                .navigationBarTitleDisplayMode(.inline)
                .preferredColorScheme(.dark)
            }
        }
        .sheet(isPresented: $showingProUpgrade) {
            ProUpgradeView()
        }
        .onAppear {
            loadRollData()
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "chart.bar.fill")
                .font(.system(size: 80))
                .foregroundColor(.gray)

            Text("No Analysis Available")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Scan some film to see exposure insights")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func loadRollData() {
        let images = storageManager.allImages()
        guard !images.isEmpty else {
            rollData = nil
            return
        }

        let brightnessValues = images.map { image in
            Double(0.5 + image.adjustments.exposure * 0.25)
        }

        let histogram = histogramData(from: brightnessValues, bins: 64)

        let shadowClipping = (brightnessValues.filter { $0 < 0.08 }.count * 100) / max(images.count, 1)
        let highlightClipping = (brightnessValues.filter { $0 > 0.92 }.count * 100) / max(images.count, 1)

        var insights: [RollInsight] = []
        if highlightClipping < 10 {
            insights.append(RollInsight(type: .positive, title: "Highlights Preserved", description: "Minimal highlight clipping detected."))
        } else {
            insights.append(RollInsight(type: .warning, title: "Highlights Clipped", description: "Several scans show highlight clipping. Lower exposure during adjust."))
        }

        if shadowClipping < 15 {
            insights.append(RollInsight(type: .positive, title: "Shadow Detail Retained", description: "Most scans keep usable shadow information."))
        } else {
            insights.append(RollInsight(type: .warning, title: "Shadow Loss Detected", description: "Shadow clipping is elevated. Increase exposure in low-light frames."))
        }

        insights.append(RollInsight(type: .info, title: "Frames Analyzed", description: "\(images.count) scanned images included in this roll analysis."))

        rollData = RollAnalysisData(
            histogramData: histogram,
            shadowClipping: Double(shadowClipping),
            highlightClipping: Double(highlightClipping),
            insights: insights
        )
    }

    private func histogramData(from values: [Double], bins: Int) -> [Double] {
        guard bins > 0 else { return [] }
        var counts = Array(repeating: 0.0, count: bins)

        for value in values {
            let clamped = min(max(value, 0), 1)
            let index = min(Int(clamped * Double(bins)), bins - 1)
            counts[index] += 1
        }

        return counts
    }
}

struct ClippingCard: View {
    let title: String
    let percentage: Double
    let color: Color
    let icon: String

    var body: some View {
        VStack(spacing: 8) {
            Text(title)
                .font(AnalogTheme.caption())
                .foregroundColor(AnalogTheme.textSecondary)

            Text(String(format: "%.1f%%", percentage))
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(color)
        }
        .frame(maxWidth: .infinity)
        .padding(AnalogTheme.paddingMedium)
        .cardStyle()
    }
}

struct RollAnalysisData {
    let histogramData: [Double]
    let shadowClipping: Double
    let highlightClipping: Double
    let insights: [RollInsight]
}

struct RollInsight: Identifiable {
    let id = UUID()
    let type: InsightType
    let title: String
    let description: String
}

enum InsightType {
    case positive
    case warning
    case info
}

#Preview {
    InsightsView()
}
