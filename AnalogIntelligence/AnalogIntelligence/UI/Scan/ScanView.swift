//
//  ScanView.swift
//  AnalogIntelligence
//
//  Created by Analog Intelligence
//

import SwiftUI

struct ScanView: View {
    @StateObject private var cameraManager = CameraManager()
    @State private var showingSettings = false
    @State private var showingAdjustScreen = false
    @State private var capturedImage: UIImage?

    var body: some View {
        NavigationStack {
            ZStack {
                // Camera preview will go here
                CameraPreviewView(cameraManager: cameraManager)
                    .ignoresSafeArea()

                VStack {
                    Spacer()

                    // Frame alignment overlay
                    FrameAlignmentOverlay()

                    Spacer()

                    // Capture button
                    Button(action: captureImage) {
                        Circle()
                            .fill(Color.white)
                            .frame(width: 70, height: 70)
                            .overlay(
                                Circle()
                                    .stroke(Color.white, lineWidth: 3)
                                    .frame(width: 80, height: 80)
                            )
                    }
                    .padding(.bottom, 40)
                }
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingSettings = true }) {
                        Image(systemName: "gearshape.fill")
                            .foregroundColor(.white)
                    }
                }
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView()
            }
            .sheet(isPresented: $showingAdjustScreen) {
                if let image = capturedImage {
                    AdjustView(image: image)
                }
            }
        }
        .onAppear {
            cameraManager.startSession()
        }
        .onDisappear {
            cameraManager.stopSession()
        }
    }

    private func captureImage() {
        cameraManager.capturePhoto { image in
            if let image = image {
                capturedImage = image
                showingAdjustScreen = true
            }
        }
    }
}

#Preview {
    ScanView()
}
