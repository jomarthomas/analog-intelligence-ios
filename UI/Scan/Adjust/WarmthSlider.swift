//
//  WarmthSlider.swift
//  Analog Intelligence
//
//  Custom slider for adjusting color temperature (warmth/coolness).
//

import SwiftUI

struct WarmthSlider: View {
    @Binding var value: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Warmth")
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
                .accessibilityLabel("Warmth")
                .accessibilityValue("\(Int(value * 100)) percent")
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    ZStack {
        Color.black
            .ignoresSafeArea()

        WarmthSlider(value: .constant(-0.3))
            .padding()
    }
}
