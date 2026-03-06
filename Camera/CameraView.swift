//
//  CameraView.swift
//  Analog Intelligence
//
//  SwiftUI wrapper for camera preview and controls
//

import SwiftUI
import AVFoundation

/// Main camera view with preview and controls for negative scanning
struct CameraView: View {
    @StateObject private var cameraManager = CameraManager()
    @State private var showingSettings = false
    @State private var showingError = false
    @State private var isCapturing = false
    @State private var showingCalibration = false

    var body: some View {
        ZStack {
            // Camera preview
            CameraPreviewView(previewLayer: cameraManager.previewLayer)
                .ignoresSafeArea()

            // Overlay UI
            VStack {
                // Top controls
                topControls

                Spacer()

                // Bottom controls
                bottomControls
            }
            .padding()

            // Calibration overlay
            if showingCalibration {
                calibrationOverlay
            }
        }
        .task {
            await setupCamera()
        }
        .onDisappear {
            cameraManager.stopSession()
        }
        .alert("Camera Error", isPresented: $showingError) {
            Button("OK") {
                showingError = false
            }
        } message: {
            if let error = cameraManager.error {
                Text(error.localizedDescription)
            }
        }
    }

    // MARK: - Top Controls

    private var topControls: some View {
        HStack {
            // Flash mode toggle
            Button(action: toggleFlash) {
                Image(systemName: flashIcon)
                    .font(.title2)
                    .foregroundColor(.white)
                    .padding(8)
                    .background(Color.black.opacity(0.5))
                    .clipShape(Circle())
            }

            Spacer()

            // Capture mode selector
            Menu {
                ForEach(CaptureMode.allCases) { mode in
                    Button(mode.displayName) {
                        cameraManager.setCaptureMode(mode)
                    }
                }
            } label: {
                HStack {
                    Text(cameraManager.captureMode.displayName)
                        .font(.headline)
                    Image(systemName: "chevron.down")
                }
                .foregroundColor(.white)
                .padding(8)
                .background(Color.black.opacity(0.5))
                .cornerRadius(8)
            }

            Spacer()

            // Settings button
            Button(action: { showingSettings.toggle() }) {
                Image(systemName: "gear")
                    .font(.title2)
                    .foregroundColor(.white)
                    .padding(8)
                    .background(Color.black.opacity(0.5))
                    .clipShape(Circle())
            }
        }
    }

    // MARK: - Bottom Controls

    private var bottomControls: some View {
        VStack(spacing: 20) {
            // Calibration status indicator
            if cameraManager.calibrationManager.isCalibrated {
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text("Calibrated")
                        .font(.caption)
                        .foregroundColor(.white)
                }
                .padding(8)
                .background(Color.black.opacity(0.5))
                .cornerRadius(8)
            }

            HStack(spacing: 40) {
                // Calibration button
                Button(action: { showingCalibration.toggle() }) {
                    VStack {
                        Image(systemName: "scope")
                            .font(.title)
                        Text("Calibrate")
                            .font(.caption)
                    }
                    .foregroundColor(.white)
                }

                // Capture button
                Button(action: capturePhoto) {
                    Circle()
                        .strokeBorder(Color.white, lineWidth: 4)
                        .background(
                            Circle()
                                .fill(isCapturing ? Color.gray : Color.white.opacity(0.3))
                        )
                        .frame(width: 70, height: 70)
                }
                .disabled(isCapturing)

                // Torch toggle
                Button(action: toggleTorch) {
                    VStack {
                        Image(systemName: torchIcon)
                            .font(.title)
                        Text("Light")
                            .font(.caption)
                    }
                    .foregroundColor(.white)
                }
            }
        }
    }

    // MARK: - Calibration Overlay

    private var calibrationOverlay: some View {
        ZStack {
            Color.black.opacity(0.8)
                .ignoresSafeArea()

            VStack(spacing: 30) {
                Text("Camera Calibration")
                    .font(.title)
                    .foregroundColor(.white)

                Text("Position the camera and lock settings for consistent batch scanning")
                    .font(.body)
                    .foregroundColor(.white.opacity(0.8))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                // Calibration status
                VStack(spacing: 15) {
                    calibrationStatusRow(
                        icon: "scope",
                        title: "Focus",
                        isLocked: cameraManager.calibrationManager.isFocusLocked
                    )

                    calibrationStatusRow(
                        icon: "sun.max",
                        title: "Exposure",
                        isLocked: cameraManager.calibrationManager.isExposureLocked
                    )

                    calibrationStatusRow(
                        icon: "thermometer.sun",
                        title: "White Balance",
                        isLocked: cameraManager.calibrationManager.isWhiteBalanceLocked
                    )
                }
                .padding()
                .background(Color.white.opacity(0.1))
                .cornerRadius(12)

                // Action buttons
                HStack(spacing: 20) {
                    if cameraManager.calibrationManager.isCalibrated {
                        Button("Unlock") {
                            unlockCalibration()
                        }
                        .buttonStyle(CalibrationButtonStyle(color: .orange))
                    } else {
                        Button("Lock All") {
                            lockCalibration()
                        }
                        .buttonStyle(CalibrationButtonStyle(color: .green))
                    }

                    Button("Done") {
                        showingCalibration = false
                    }
                    .buttonStyle(CalibrationButtonStyle(color: .blue))
                }
            }
            .padding()
        }
    }

    private func calibrationStatusRow(icon: String, title: String, isLocked: Bool) -> some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(.white)
                .frame(width: 30)

            Text(title)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, alignment: .leading)

            Image(systemName: isLocked ? "lock.fill" : "lock.open")
                .foregroundColor(isLocked ? .green : .white.opacity(0.5))
        }
    }

    // MARK: - Actions

    private func setupCamera() async {
        await cameraManager.requestAuthorization()

        if cameraManager.isAuthorized {
            do {
                try await cameraManager.startSession()
            } catch {
                cameraManager.error = error as? CameraError
                showingError = true
            }
        } else {
            cameraManager.error = .notAuthorized
            showingError = true
        }
    }

    private func capturePhoto() {
        isCapturing = true

        Task {
            do {
                let photo = try await cameraManager.capturePhoto()
                // Handle captured photo (save, process, etc.)
                print("Photo captured: \(photo.data.count) bytes")
                if photo.hasRawData {
                    print("RAW data: \(photo.rawData?.count ?? 0) bytes")
                }
            } catch {
                cameraManager.error = error as? CameraError
                showingError = true
            }

            isCapturing = false
        }
    }

    private func toggleFlash() {
        let modes: [FlashMode] = [.off, .on, .auto]
        if let currentIndex = modes.firstIndex(of: cameraManager.flashMode) {
            let nextIndex = (currentIndex + 1) % modes.count
            cameraManager.setFlashMode(modes[nextIndex])
        }
    }

    private func toggleTorch() {
        Task {
            do {
                let newMode: TorchMode = cameraManager.torchMode == .off ? .on : .off
                try await cameraManager.setTorchMode(newMode)
            } catch {
                cameraManager.error = error as? CameraError
                showingError = true
            }
        }
    }

    private func lockCalibration() {
        Task {
            do {
                try await cameraManager.calibrationManager.lockCalibration()
            } catch {
                cameraManager.error = .sessionSetupFailed
                showingError = true
            }
        }
    }

    private func unlockCalibration() {
        Task {
            do {
                try await cameraManager.calibrationManager.unlockCalibration()
            } catch {
                cameraManager.error = .sessionSetupFailed
                showingError = true
            }
        }
    }

    // MARK: - Computed Properties

    private var flashIcon: String {
        switch cameraManager.flashMode {
        case .off:
            return "bolt.slash"
        case .on:
            return "bolt.fill"
        case .auto:
            return "bolt.badge.automatic"
        }
    }

    private var torchIcon: String {
        cameraManager.torchMode == .on ? "flashlight.on.fill" : "flashlight.off.fill"
    }
}

// MARK: - Camera Preview View

struct CameraPreviewView: UIViewRepresentable {
    let previewLayer: AVCaptureVideoPreviewLayer?

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.backgroundColor = .black
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {
        if let previewLayer = previewLayer {
            uiView.setPreviewLayer(previewLayer)
        }
    }

    // Custom UIView to host the preview layer
    class PreviewView: UIView {
        private var previewLayer: AVCaptureVideoPreviewLayer?

        override class var layerClass: AnyClass {
            return AVCaptureVideoPreviewLayer.self
        }

        func setPreviewLayer(_ layer: AVCaptureVideoPreviewLayer) {
            if previewLayer != layer {
                previewLayer = layer
                self.layer.addSublayer(layer)
                updateLayerFrame()
            }
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            updateLayerFrame()
        }

        private func updateLayerFrame() {
            previewLayer?.frame = self.bounds
        }
    }
}

// MARK: - Button Styles

struct CalibrationButtonStyle: ButtonStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundColor(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(color.opacity(configuration.isPressed ? 0.7 : 1.0))
            .cornerRadius(8)
    }
}

// MARK: - Previews

#Preview {
    CameraView()
}
