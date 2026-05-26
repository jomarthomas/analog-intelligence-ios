//
//  ContrastSlider.swift
//  Analog Intelligence
//
//  Custom slider for adjusting image contrast.
//

import SwiftUI

struct ContrastSlider: View {
    @Binding var value: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Contrast")
                    .font(AnalogTheme.body())
                    .foregroundColor(AnalogTheme.textPrimary)

                Spacer()

                Text(String(format: "%.2f", value))
                    .font(AnalogTheme.caption())
                    .foregroundColor(AnalogTheme.textSecondary)
                    .monospacedDigit()
            }

            Slider(value: $value, in: 0.5...2.0)
                .tint(AnalogTheme.sliderTrack)
                .accessibilityLabel("Contrast")
                .accessibilityValue("\(Int(value * 100)) percent")
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    ZStack {
        Color.black
            .ignoresSafeArea()

        ContrastSlider(value: .constant(1.2))
            .padding()
    }
}
