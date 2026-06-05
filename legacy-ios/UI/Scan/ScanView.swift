//
//  ScanView.swift
//  Analog Intelligence
//
//  Main scan tab with camera preview, frame alignment overlay,
//  capture flow, settings access, and free-tier monetization overlays.
//

import SwiftUI
import AVFoundation

struct ScanView: View {
    @StateObject private var cameraManager = CameraManager()
    @StateObject private var purchaseState = PurchaseState.shared
    @StateObject private var preferencesManager = PreferencesManager.shared

    @State private var showingSettings = false
    @State private var showingAdjustView = false
    @State private var capturedImage: UIImage?
    @State private var showingCameraError = false
    @State private var calibrationErrorMessage: String?
    @State private var sessionErrorMessage: String?
    @State private var isSessionActive = false
    @State private var waitingForFilmAdvance = false
    @State private var currentFrame = 0
    @State private var sessionName = ""

    private let storageManager = StorageManager.shared

    var body: some View {
        ZStack {
            CameraPreviewView(previewLayer: cameraManager.previewLayer)
                .ignoresSafeArea()

            FrameAlignmentOverlay()

            VStack {
                HStack {
                    if !cameraManager.usesSimulatorCapture {
                        Button {
                            toggleCalibration()
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: cameraManager.calibrationManager.isCalibrated ? "checkmark.seal.fill" : "scope")
                                Text(cameraManager.calibrationManager.isCalibrated ? "Calibrated" : "Calibrate")
                                    .font(.caption.weight(.semibold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(.black.opacity(0.5)))
                        }
                    }

                    Spacer()

                    Menu {
                        ForEach(CaptureMode.allCases) { mode in
                            Button(mode.displayName) {
                                cameraManager.setCaptureMode(mode)
                                preferencesManager.updatePreference(
                                    \.defaultCaptureFormat,
                                    value: mode.preferenceFormat
                                )
                            }
                        }
                    } label: {
                        Text(cameraManager.captureMode.displayName)
                            .font(.caption.weight(.semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(.black.opacity(0.5)))
                    }

                    Spacer()

                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape.fill")
                            .font(.title2)
                            .foregroundColor(.white)
                            .padding()
                            .background(Circle().fill(.black.opacity(0.5)))
                    }
                    .padding()
                }

                VStack(spacing: 8) {
                    if isSessionActive {
                        Text("\(sessionName) • Frame \(currentFrame + 1)")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(.black.opacity(0.45)))

                        Button("End Session") {
                            endScanSession()
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(.red.opacity(0.7)))
                    } else {
                        Button("Start New Roll Session") {
                            startScanSession()
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(.blue.opacity(0.75)))
                    }
                }
                .padding(.top, 4)

                Spacer()

                if !purchaseState.isPro {
                    WatermarkView()
                        .padding(.bottom, 8)
                }

                if cameraManager.usesSimulatorCapture {
                    Text("Simulator Mode: capture uses bundled sample image")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.85))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(.black.opacity(0.45)))
                        .padding(.bottom, 8)
                }

                if !cameraManager.usesSimulatorCapture && !cameraManager.calibrationManager.isCalibrated {
                    Text("Calibrate focus/exposure/white balance before capture")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.9))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(.black.opacity(0.45)))
                        .padding(.bottom, 8)
                }

                if waitingForFilmAdvance {
                    Button("Film Advanced - Ready Next Frame") {
                        waitingForFilmAdvance = false
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(.orange.opacity(0.8)))
                    .padding(.bottom, 10)
                }

                CaptureButton {
                    captureImage()
                }
                .disabled(!canCapture)
                .opacity(canCapture ? 1 : 0.5)
                .padding(.bottom, 20)

                // Banner ad for free tier users
                // TODO: Uncomment after adding Google Mobile Ads SDK
                // if !purchaseState.isPro {
                //     BannerAdView()
                //         .padding(.bottom)
                // }
            }
        }
        .task {
            await setupCameraSession()
        }
        .onDisappear {
            cameraManager.stopSession()
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView(isProUser: .constant(purchaseState.isPro))
        }
        .fullScreenCover(isPresented: $showingAdjustView) {
            if let image = capturedImage {
                AdjustView(image: image, isProUser: purchaseState.isPro) { didSave in
                    showingAdjustView = false
                    capturedImage = nil
                    if didSave {
                        currentFrame += 1
                        waitingForFilmAdvance = true
                    }
                }
            }
        }
        .alert("Camera Error", isPresented: $showingCameraError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(cameraManager.error?.localizedDescription ?? "Unable to access camera.")
        }
        .alert("Calibration Failed", isPresented: Binding(get: {
            calibrationErrorMessage != nil
        }, set: { if !$0 { calibrationErrorMessage = nil } })) {
            Button("OK", role: .cancel) { calibrationErrorMessage = nil }
        } message: {
            Text(calibrationErrorMessage ?? "Unable to calibrate camera.")
        }
        .alert("Session Error", isPresented: Binding(get: {
            sessionErrorMessage != nil
        }, set: { if !$0 { sessionErrorMessage = nil } })) {
            Button("OK", role: .cancel) { sessionErrorMessage = nil }
        } message: {
            Text(sessionErrorMessage ?? "Unable to manage session.")
        }
        .onChange(of: preferencesManager.preferences.defaultCaptureFormat) { _, newFormat in
            cameraManager.setCaptureMode(newFormat.captureMode)
        }
    }

    private var canCapture: Bool {
        guard isSessionActive else { return false }
        guard !waitingForFilmAdvance else { return false }
        if cameraManager.usesSimulatorCapture {
            return true
        }
        return cameraManager.calibrationManager.isCalibrated
    }

    private func setupCameraSession() async {
        if let existingSession = storageManager.currentSession {
            isSessionActive = true
            sessionName = existingSession.name
            currentFrame = existingSession.imageCount
            waitingForFilmAdvance = false
        }

        await cameraManager.requestAuthorization()

        guard cameraManager.isAuthorized else {
            showingCameraError = true
            return
        }

        do {
            cameraManager.setCaptureMode(preferencesManager.preferences.defaultCaptureFormat.captureMode)
            try await cameraManager.startSession()
            if !cameraManager.usesSimulatorCapture && preferencesManager.preferences.autoLockCalibration {
                try? await cameraManager.calibrationManager.lockCalibration()
            }
        } catch {
            cameraManager.error = error as? CameraError
            showingCameraError = true
        }
    }

    private func captureImage() {
        Task {
            do {
                let photo = try await cameraManager.capturePhoto()
                guard let image = UIImage(data: photo.data) else {
                    return
                }
                capturedImage = image
                showingAdjustView = true
            } catch {
                cameraManager.error = error as? CameraError
                showingCameraError = true
            }
        }
    }

    private func toggleCalibration() {
        Task {
            do {
                if cameraManager.calibrationManager.isCalibrated {
                    try await cameraManager.calibrationManager.unlockCalibration()
                } else {
                    try await cameraManager.calibrationManager.lockCalibration()
                }
            } catch {
                calibrationErrorMessage = error.localizedDescription
            }
        }
    }

    private func startScanSession() {
        sessionName = "Roll \(Date().formatted(date: .abbreviated, time: .omitted))"
        waitingForFilmAdvance = false
        currentFrame = 0

        Task {
            do {
                let session = try await storageManager.createSession(name: sessionName)
                storageManager.setCurrentSession(session)
                await MainActor.run {
                    isSessionActive = true
                }
            } catch {
                await MainActor.run {
                    sessionErrorMessage = error.localizedDescription
                }
            }
        }
    }

    private func endScanSession() {
        waitingForFilmAdvance = false

        Task {
            do {
                if let session = storageManager.currentSession {
                    try await storageManager.markSessionCompleted(id: session.id)
                }
                await MainActor.run {
                    isSessionActive = false
                }
            } catch {
                await MainActor.run {
                    sessionErrorMessage = error.localizedDescription
                }
            }
        }
    }
}

#Preview {
    ScanView()
}
