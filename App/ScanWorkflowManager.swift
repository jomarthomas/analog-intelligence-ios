//
//  ScanWorkflowManager.swift
//  AnalogIntelligence
//
//  Coordinates the full scanning workflow, integrating camera, processing, and storage.
//

import Foundation
import Combine
import SwiftUI
import CoreImage
import UIKit

@MainActor
@Observable
final class ScanWorkflowManager {
    // MARK: - Properties

    private let stateMachine = ScanStateMachine()

    private(set) var currentSession: WorkflowScanSession?

    var currentState: ScanState {
        stateMachine.currentState
    }

    var statePublisher: AnyPublisher<ScanState, Never> {
        stateMachine.statePublisher
    }

    private var pendingCaptureData: (data: Data, metadata: CaptureMetadata)?
    private var pendingProcessedResult: ProcessedImageResult?

    private(set) var currentAdjustments = WorkflowImageAdjustments()

    // MARK: - Dependencies

    private let cameraManager: CameraManager
    private let imageProcessor: ImageProcessor
    private let storageManager: StorageManager

    private var storageSessionID: UUID?

    // MARK: - Initialization

    init() {
        self.cameraManager = CameraManager()
        self.imageProcessor = ImageProcessor()
        self.storageManager = .shared
        setupObservers()
    }

    // MARK: - Session Management

    func startSession(rollName: String? = nil) {
        guard currentSession == nil else {
            print("⚠️ Session already active")
            return
        }

        let session = WorkflowScanSession(
            id: UUID(),
            rollName: rollName ?? "Roll \(Date().formatted(date: .numeric, time: .omitted))",
            startTime: Date(),
            captureMode: cameraManager.captureMode
        )

        currentSession = session
        stateMachine.handle(.startSession)

        Task {
            do {
                let storageSession = try await storageManager.createSession(name: session.rollName)
                storageSessionID = storageSession.id
            } catch {
                print("⚠️ Failed to create storage session: \(error.localizedDescription)")
            }
        }

        beginCalibration()
    }

    func endSession() {
        guard let session = currentSession else {
            print("⚠️ No active session to end")
            return
        }

        stateMachine.handle(.endSession)
        saveSessionMetadata(session)

        currentSession = nil
        pendingCaptureData = nil
        pendingProcessedResult = nil
        currentAdjustments = WorkflowImageAdjustments()
    }

    func pauseSession() {
        stateMachine.handle(.pauseSession)
    }

    func resumeSession() {
        stateMachine.handle(.resumeSession)
    }

    // MARK: - Calibration

    private func beginCalibration() {
        stateMachine.handle(.startCalibration)

        Task {
            do {
                try await cameraManager.calibrationManager.lockCalibration()
                stateMachine.handle(.calibrationCompleted)
            } catch {
                stateMachine.handle(.calibrationFailed(reason: error.localizedDescription))
            }
        }
    }

    // MARK: - Capture Workflow

    func captureFrame() {
        guard currentSession != nil else {
            stateMachine.handle(.errorOccurred(.noActiveSession))
            return
        }

        guard stateMachine.canHandle(.captureRequested) else {
            print("⚠️ Cannot capture in current state: \(currentState)")
            return
        }

        stateMachine.handle(.captureRequested)
        performCapture()
    }

    private func performCapture() {
        Task {
            do {
                let captured = try await cameraManager.capturePhoto()

                let metadata = CaptureMetadata(
                    timestamp: Date(),
                    exposureDuration: 1.0 / 60.0,
                    iso: 100,
                    aperture: nil,
                    focalLength: nil,
                    captureMode: cameraManager.captureMode,
                    deviceOrientation: UIDevice.current.orientation
                )

                pendingCaptureData = (captured.data, metadata)

                stateMachine.handle(.captureCompleted(imageData: captured.data, metadata: metadata))
                processImage(captured.data, metadata: metadata)
            } catch {
                stateMachine.handle(.captureFailed(reason: error.localizedDescription))
            }
        }
    }

    // MARK: - Image Processing

    private func processImage(_ imageData: Data, metadata: CaptureMetadata) {
        stateMachine.handle(.processingStarted)

        Task {
            do {
                guard let uiImage = UIImage(data: imageData),
                      let ciImage = CIImage(image: uiImage) else {
                    throw ScanError.invalidImageData
                }

                var session = currentSession
                let frameIndex = (session?.frameCount ?? 0) + 1

                let config = ImageProcessor.ProcessingConfig(
                    cropRect: nil,
                    perspectiveCorrection: nil,
                    filmType: .colorNegative,
                    autoOrangeMask: true,
                    autoColorCorrection: true,
                    sharpenAmount: 0.5
                )

                let adjustments = UserAdjustments.Parameters(
                    exposure: currentAdjustments.exposure,
                    warmth: currentAdjustments.warmth,
                    contrast: currentAdjustments.contrast - 1.0
                )

                let processedCI = try await imageProcessor.processNegative(
                    inputImage: ciImage,
                    config: config,
                    adjustments: adjustments,
                    isPro: ProFeatureGate.isPro
                )

                let exportData = try await imageProcessor.exportImage(
                    processedCI,
                    isPro: ProFeatureGate.isPro,
                    format: .jpeg,
                    addWatermark: true
                )

                let thumbnailData: Data?
                if let processedUIImage = UIImage(data: exportData),
                   let thumb = FileSystemHelper.generateThumbnail(from: processedUIImage),
                   let thumbJPEG = thumb.jpegData(compressionQuality: 0.8) {
                    thumbnailData = thumbJPEG
                } else {
                    thumbnailData = nil
                }

                let result = ProcessedImageResult(
                    processedImage: exportData,
                    thumbnailImage: thumbnailData,
                    frameIndex: frameIndex,
                    processingDuration: imageProcessor.processingProgress,
                    metadata: ProcessingMetadata(
                        orangeMaskEstimate: nil,
                        histogramData: nil,
                        appliedAdjustments: currentAdjustments
                    )
                )

                session?.frameCount = frameIndex
                currentSession = session
                pendingProcessedResult = result

                stateMachine.handle(.processingCompleted(processedImage: result))
            } catch {
                stateMachine.handle(.processingFailed(reason: error.localizedDescription))
            }
        }
    }

    // MARK: - Review & Adjustments

    func beginReview(frameIndex: Int) {
        stateMachine.handle(.reviewStarted(frameIndex: frameIndex))
    }

    func updateAdjustments(_ adjustments: WorkflowImageAdjustments) {
        currentAdjustments = adjustments

        guard let capture = pendingCaptureData,
              case .reviewing = currentState else {
            return
        }

        processImage(capture.data, metadata: capture.metadata)
    }

    func completeReview() {
        stateMachine.handle(.reviewCompleted)
        exportImage()
    }

    func cancelReview() {
        stateMachine.handle(.reviewCanceled)
        pendingProcessedResult = nil
        resetAdjustments()
    }

    // MARK: - Export

    private func exportImage() {
        stateMachine.handle(.exportStarted)

        guard let result = pendingProcessedResult,
              let capture = pendingCaptureData,
              let originalImage = UIImage(data: capture.data),
              let processedImage = UIImage(data: result.processedImage) else {
            stateMachine.handle(.exportFailed(reason: "No processed image to export"))
            return
        }

        Task {
            do {
                let metadata = ImageMetadata(
                    exposureTime: capture.metadata.exposureDuration,
                    iso: capture.metadata.iso,
                    focalLength: capture.metadata.focalLength,
                    aperture: capture.metadata.aperture,
                    whiteBalance: cameraManager.calibrationManager.isWhiteBalanceLocked ? .locked : .auto,
                    format: .jpeg,
                    originalWidth: Int(originalImage.size.width),
                    originalHeight: Int(originalImage.size.height),
                    focusLocked: cameraManager.calibrationManager.isFocusLocked,
                    exposureLocked: cameraManager.calibrationManager.isExposureLocked,
                    whiteBalanceLocked: cameraManager.calibrationManager.isWhiteBalanceLocked,
                    orangeMaskValue: nil
                )

                let adjustments = ImageAdjustments(
                    exposure: currentAdjustments.exposure,
                    warmth: currentAdjustments.warmth,
                    contrast: currentAdjustments.contrast
                )

                let scannedImage = try await storageManager.saveScannedImage(
                    originalImage,
                    format: .jpeg,
                    metadata: metadata,
                    adjustments: adjustments
                )

                try await storageManager.saveProcessedImage(
                    processedImage,
                    for: scannedImage.id,
                    format: .jpeg
                )

                stateMachine.handle(.exportCompleted)
                pendingProcessedResult = nil
                pendingCaptureData = nil
                resetAdjustments()
            } catch {
                stateMachine.handle(.exportFailed(reason: error.localizedDescription))
            }
        }
    }

    // MARK: - Film Advance

    func confirmFilmAdvanced() {
        stateMachine.handle(.filmAdvanced)
    }

    // MARK: - Error Handling

    func retryAfterError() {
        guard case .error(let error) = currentState else {
            return
        }

        if error.isRecoverable {
            stateMachine.handle(.retryAfterError)
        }
    }

    func cancelAfterError() {
        stateMachine.handle(.cancelAfterError)
        cleanup()
    }

    // MARK: - Helpers

    private func setupObservers() {
        // Reserved for analytics hooks.
    }

    private func resetAdjustments() {
        currentAdjustments = WorkflowImageAdjustments()
    }

    private func cleanup() {
        pendingCaptureData = nil
        pendingProcessedResult = nil
        resetAdjustments()
    }

    private func saveSessionMetadata(_ session: WorkflowScanSession) {
        guard let sessionID = storageSessionID else { return }

        Task {
            do {
                try await storageManager.updateSession(
                    id: sessionID,
                    notes: "Frames captured: \(session.frameCount)"
                )
                try await storageManager.markSessionCompleted(id: sessionID)
            } catch {
                print("⚠️ Failed to save session metadata: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Debugging

    func debugPrintState() {
        stateMachine.debugPrint()
        if let session = currentSession {
            print("Current Session: \(session.rollName) - \(session.frameCount) frames")
        }
    }
}

// MARK: - Scan Session

struct WorkflowScanSession: Identifiable {
    let id: UUID
    let rollName: String
    let startTime: Date
    var endTime: Date?
    var frameCount: Int = 0
    let captureMode: CaptureMode

    var duration: TimeInterval {
        let end = endTime ?? Date()
        return end.timeIntervalSince(startTime)
    }
}

// MARK: - SwiftUI Integration

extension ScanWorkflowManager {
    var isSessionActive: Bool {
        currentSession != nil && currentState != .idle
    }

    var canCapture: Bool {
        currentState.captureButtonEnabled
    }

    var shouldShowCameraPreview: Bool {
        currentState.shouldShowCameraPreview
    }

    var statusMessage: String {
        currentState.description
    }

    var currentFrameCount: Int {
        currentSession?.frameCount ?? 0
    }

    var currentRollName: String {
        currentSession?.rollName ?? "No active session"
    }
}
