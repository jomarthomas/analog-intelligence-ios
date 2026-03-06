//
//  FrameAlignmentOverlay.swift
//  Analog Intelligence
//
//  Visual guide for aligning film negatives during capture.
//

import SwiftUI

struct FrameAlignmentOverlay: View {
    @State private var isAnimating = false

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Semi-transparent dark overlay outside the frame
                Rectangle()
                    .fill(.black.opacity(0.5))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .mask(
                        Rectangle()
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .frame(width: frameWidth(for: geometry), height: frameHeight(for: geometry))
                                    .blendMode(.destinationOut)
                            )
                    )

                // Frame guide rectangle
                RoundedRectangle(cornerRadius: 12)
                    .stroke(lineWidth: 3)
                    .fill(
                        LinearGradient(
                            colors: [.white, .white.opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: frameWidth(for: geometry), height: frameHeight(for: geometry))
                    .shadow(color: .white.opacity(0.3), radius: 8)

                // Corner guides
                VStack {
                    HStack {
                        CornerGuide(corners: [.topLeft])
                        Spacer()
                        CornerGuide(corners: [.topRight])
                    }
                    Spacer()
                    HStack {
                        CornerGuide(corners: [.bottomLeft])
                        Spacer()
                        CornerGuide(corners: [.bottomRight])
                    }
                }
                .frame(width: frameWidth(for: geometry), height: frameHeight(for: geometry))

                // Alignment instruction text
                VStack {
                    Text("Align Film Frame")
                        .font(.headline)
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(.black.opacity(0.7)))
                        .padding(.top, 60)

                    Spacer()
                }
            }
        }
    }

    private func frameWidth(for geometry: GeometryProxy) -> CGFloat {
        // 35mm film aspect ratio (3:2)
        geometry.size.width * 0.8
    }

    private func frameHeight(for geometry: GeometryProxy) -> CGFloat {
        frameWidth(for: geometry) * 2 / 3
    }
}

struct CornerGuide: View {
    let corners: UIRectCorner
    let size: CGFloat = 30
    let lineWidth: CGFloat = 4

    var body: some View {
        ZStack {
            if corners.contains(.topLeft) {
                VStack(alignment: .leading, spacing: 0) {
                    Rectangle()
                        .fill(.white)
                        .frame(width: lineWidth, height: size)
                    HStack(spacing: 0) {
                        Rectangle()
                            .fill(.white)
                            .frame(width: size, height: lineWidth)
                        Spacer()
                    }
                }
            }

            if corners.contains(.topRight) {
                VStack(alignment: .trailing, spacing: 0) {
                    Rectangle()
                        .fill(.white)
                        .frame(width: lineWidth, height: size)
                    HStack(spacing: 0) {
                        Spacer()
                        Rectangle()
                            .fill(.white)
                            .frame(width: size, height: lineWidth)
                    }
                }
            }

            if corners.contains(.bottomLeft) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 0) {
                        Rectangle()
                            .fill(.white)
                            .frame(width: size, height: lineWidth)
                        Spacer()
                    }
                    Rectangle()
                        .fill(.white)
                        .frame(width: lineWidth, height: size)
                }
            }

            if corners.contains(.bottomRight) {
                VStack(alignment: .trailing, spacing: 0) {
                    HStack(spacing: 0) {
                        Spacer()
                        Rectangle()
                            .fill(.white)
                            .frame(width: size, height: lineWidth)
                    }
                    Rectangle()
                        .fill(.white)
                        .frame(width: lineWidth, height: size)
                }
            }
        }
        .frame(width: size, height: size)
    }
}

#Preview {
    ZStack {
        Color.gray
            .ignoresSafeArea()

        FrameAlignmentOverlay()
    }
}
