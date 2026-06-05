//
//  AIOptionsPanel.swift
//  Analog Intelligence
//
//  Panel displaying AI processing features (Color Reconstruction, Dust Removal).
//  Phase 1: UI only, actual AI processing will be implemented later.
//

import SwiftUI

struct AIOptionsPanel: View {
    @Binding var aiColorEnabled: Bool
    @Binding var aiDustRemovalEnabled: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // AI Color Reconstruction
            Toggle(isOn: $aiColorEnabled) {
                HStack(spacing: 8) {
                    Text("AI Color Reconstruction")
                        .font(AnalogTheme.body())
                        .foregroundColor(AnalogTheme.textPrimary)

                    Text("PRO")
                        .proBadge()
                }
            }
            .tint(AnalogTheme.primaryOrange)

            // AI Dust Removal
            Toggle(isOn: $aiDustRemovalEnabled) {
                HStack(spacing: 8) {
                    Text("AI Dust Removal")
                        .font(AnalogTheme.body())
                        .foregroundColor(AnalogTheme.textPrimary)

                    Text("PRO")
                        .proBadge()
                }
            }
            .tint(AnalogTheme.primaryOrange)
        }
        .padding(AnalogTheme.paddingMedium)
    }
}

#Preview {
    ZStack {
        Color.black
            .ignoresSafeArea()

        AIOptionsPanel(
            aiColorEnabled: .constant(true),
            aiDustRemovalEnabled: .constant(false)
        )
        .padding()
    }
}
