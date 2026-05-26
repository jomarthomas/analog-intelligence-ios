//
//  FrameAlignmentOverlay.swift
//  AnalogIntelligence
//
//  Created by Analog Intelligence
//

import SwiftUI

struct FrameAlignmentOverlay: View {
    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width * 0.8
            let height = width * 0.667 // 35mm aspect ratio

            ZStack {
                // Semi-transparent overlay
                Rectangle()
                    .fill(Color.black.opacity(0.5))
                    .frame(width: geometry.size.width, height: geometry.size.height)

                // Clear rectangle for frame alignment
                Rectangle()
                    .fill(Color.clear)
                    .frame(width: width, height: height)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.white, lineWidth: 2)
                    )
                    .blendMode(.destinationOut)
            }
            .compositingGroup()
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
    }
}

#Preview {
    FrameAlignmentOverlay()
}
