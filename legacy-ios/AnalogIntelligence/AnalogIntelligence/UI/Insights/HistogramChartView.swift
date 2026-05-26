//
//  HistogramChartView.swift
//  AnalogIntelligence
//
//  Created by Analog Intelligence
//

import SwiftUI
import Charts

struct HistogramChartView: View {
    let metrics: RollMetrics

    var body: some View {
        Chart {
            ForEach(metrics.histogramData, id: \.bin) { data in
                BarMark(
                    x: .value("Brightness", data.bin),
                    y: .value("Count", data.count)
                )
                .foregroundStyle(.blue.gradient)
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 5))
        }
        .chartYAxis {
            AxisMarks(position: .leading)
        }
    }
}
