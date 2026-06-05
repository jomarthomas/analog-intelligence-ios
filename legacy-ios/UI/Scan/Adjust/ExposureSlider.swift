//
//  ExposureSlider.swift
//  Analog Intelligence
//
//  Custom slider for adjusting image exposure.
//

import SwiftUI

struct ExposureSlider: View {
    @Binding var value: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Exposure")
                    .font(AnalogTheme.body())
                    .foregroundColor(AnalogTheme.textPrimary)

                Spacer()

                Text(String(format: "%.2f", value))
                    .font(AnalogTheme.caption())
                    .foregroundColor(AnalogTheme.textSecondary)
                    .monospacedDigit()
            }

            Slider(value: $value, in: -1.0...1.0)
                .tint(AnalogTheme.sliderTrack)
                .accessibilityLabel("Exposure")
                .accessibilityValue("\(Int(value * 100)) percent")
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    ZStack {
        Color.black
            .ignoresSafeArea()

        ExposureSlider(value: .constant(0.3))
            .padding()
    }
}
