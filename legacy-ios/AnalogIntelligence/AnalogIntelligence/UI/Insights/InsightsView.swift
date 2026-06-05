//
//  InsightsView.swift
//  AnalogIntelligence
//
//  Created by Analog Intelligence
//

import SwiftUI
import Charts

struct InsightsView: View {
    @StateObject private var purchaseManager = PurchaseManager.shared
    @State private var rollMetrics: RollMetrics?

    var body: some View {
        NavigationStack {
            Group {
                if purchaseManager.isPro {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            // Histogram Chart
                            VStack(alignment: .leading) {
                                Text("Exposure Distribution")
                                    .font(.headline)
                                    .padding(.bottom, 5)

                                if let metrics = rollMetrics {
                                    HistogramChartView(metrics: metrics)
                                        .frame(height: 200)
                                } else {
                                    Text("No data available")
                                        .foregroundColor(.gray)
                                        .frame(height: 200)
                                }
                            }
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(12)

                            // Shadow and Highlight Clipping
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Clipping Analysis")
                                    .font(.headline)

                                if let metrics = rollMetrics {
                                    HStack {
                                        VStack(alignment: .leading) {
                                            Text("Shadow Clipping")
                                                .font(.subheadline)
                                                .foregroundColor(.gray)
                                            Text("\(Int(metrics.shadowClippingPercent))%")
                                                .font(.title2)
                                                .bold()
                                        }
                                        Spacer()
                                        VStack(alignment: .leading) {
                                            Text("Highlight Clipping")
                                                .font(.subheadline)
                                                .foregroundColor(.gray)
                                            Text("\(Int(metrics.highlightClippingPercent))%")
                                                .font(.title2)
                                                .bold()
                                        }
                                    }
                                }
                            }
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(12)

                            // Insights Summary
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Summary")
                                    .font(.headline)

                                if let metrics = rollMetrics {
                                    Text(metrics.insightSummary)
                                        .font(.body)
                                        .foregroundColor(.secondary)
                                }
                            }
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(12)
                        }
                        .padding()
                    }
                } else {
                    // Pro upsell view
                    VStack(spacing: 20) {
                        Image(systemName: "chart.bar.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.blue)

                        Text("Insights")
                            .font(.largeTitle)
                            .bold()

                        Text("Get detailed exposure analysis and insights about your scanned film rolls")
                            .font(.body)
                            .multilineTextAlignment(.center)
                            .foregroundColor(.secondary)
                            .padding(.horizontal)

                        Button(action: {
                            purchaseManager.purchasePro()
                        }) {
                            Text("Unlock Pro - $9.99")
                                .font(.headline)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.blue)
                                .cornerRadius(12)
                        }
                        .padding(.horizontal)
                    }
                    .padding()
                }
            }
            .navigationTitle("Insights")
        }
        .onAppear {
            loadMetrics()
        }
    }

    private func loadMetrics() {
        // Load roll metrics
        rollMetrics = MetricsAnalyzer.shared.calculateRollMetrics()
    }
}

#Preview {
    InsightsView()
}
