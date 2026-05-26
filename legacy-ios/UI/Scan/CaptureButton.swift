//
//  CaptureButton.swift
//  Analog Intelligence
//
//  Custom capture button with camera shutter design.
//

import SwiftUI

struct CaptureButton: View {
    let action: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: {
            withAnimation(.easeInOut(duration: 0.1)) {
                isPressed = true
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.easeInOut(duration: 0.1)) {
                    isPressed = false
                }
                action()
            }
        }) {
            ZStack {
                // Outer ring
                Circle()
                    .strokeBorder(.white, lineWidth: 5)
                    .frame(width: 80, height: 80)

                // Inner circle (shutter button)
                Circle()
                    .fill(.white)
                    .frame(width: isPressed ? 60 : 65, height: isPressed ? 60 : 65)
                    .shadow(color: .black.opacity(0.3), radius: 4, x: 0, y: 2)
            }
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel("Capture photo")
        .accessibilityHint("Double tap to capture film negative")
    }
}

#Preview {
    ZStack {
        Color.black
            .ignoresSafeArea()

        CaptureButton {
            print("Capture!")
        }
    }
}
