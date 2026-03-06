//
//  CameraManager.swift
//  Analog Intelligence
//
//  Main camera controller using AVFoundation for negative scanning
//

import Foundation
import AVFoundation
import UIKit
import Combine

/// Main camera manager handling capture session, photo capture, and calibration
@MainActor
class CameraManager: NSObject, ObservableObject {
    // MARK: - Published Properties

    @Published var isSessionRunning = false
    @Published var isAuthorized = false
    @Published var captureMode: CaptureMode = .heic
    @Published var flashMode: FlashMode = .off
    @Published var torchMode: TorchMode = .off
    @Published var isCameraUnavailable = false
    @Published var currentZoomFactor: CGFloat = 1.0

    // Preview layer for SwiftUI
    @Published var previewLayer: AVCaptureVideoPreviewLayer?

    // Error handling
    @Published var error: CameraError?

    // Calibration manager
    let calibrationManager: CalibrationManager

    var usesSimulatorCapture: Bool {
#if targetEnvironment(simulator)
        true
#else
        false
#endif
    }

    // MARK: - Private Properties

    private let session = AVCaptureSession()
    private var videoDeviceInput: AVCaptureDeviceInput?
    private let photoOutput = AVCapturePhotoOutput()
    private var videoDataOutput: AVCaptureVideoDataOutput?

    private let sessionQueue = DispatchQueue(label: "com.analogintelligence.camera.session")
    private var setupResult: SessionSetupResult = .success

    // Photo capture handling
    private var inProgressPhotoCaptures = [Int64: PhotoCaptureProcessor]()

    // Device observation
    private var deviceObservations: [NSKeyValueObservation] = []

    // Video device discovery
    private var videoDeviceDiscoverySession: AVCaptureDevice.DiscoverySession?

    // Current camera device
    private var currentDevice: AVCaptureDevice?

    // Stability analysis (optional)
    private var isAnalyzingStability = false
    private var stabilityThreshold: Double = 0.02

    // MARK: - Initialization

    override init() {
        calibrationManager = CalibrationManager()
        super.init()
        setupVideoDeviceDiscovery()
    }

    // MARK: - Public Methods

    /// Request camera authorization
    func requestAuthorization() async {
        if usesSimulatorCapture {
            isAuthorized = true
            setupResult = .success
            return
        }

        let status = AVCaptureDevice.authorizationStatus(for: .video)

        switch status {
        case .authorized:
            isAuthorized = true

        case .notDetermined:
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            isAuthorized = granted
            if !granted {
                setupResult = .notAuthorized
            }

        case .denied, .restricted:
            isAuthorized = false
            setupResult = .notAuthorized

        @unknown default:
            setupResult = .notAuthorized
        }
    }

    /// Configure and start the camera session
    func startSession() async throws {
        guard isAuthorized else {
            throw CameraError.notAuthorized
        }

        if usesSimulatorCapture {
            isSessionRunning = true
            calibrationManager.isFocusLocked = true
            calibrationManager.isExposureLocked = true
            calibrationManager.isWhiteBalanceLocked = true
            calibrationManager.isCalibrated = true
            return
        }

        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            self.configureSession()
        }

        // Wait for session to start
        try await Task.sleep(nanoseconds: 100_000_000) // 100ms

        if setupResult == .success {
            sessionQueue.async { [weak self] in
                self?.session.startRunning()
                Task { @MainActor in
                    self?.isSessionRunning = self?.session.isRunning ?? false
                }
            }
        } else {
            throw setupResult.error ?? CameraError.sessionSetupFailed
        }
    }

    /// Stop the camera session
    func stopSession() {
        if usesSimulatorCapture {
            isSessionRunning = false
            return
        }

        guard setupResult == .success else { return }

        sessionQueue.async { [weak self] in
            if self?.session.isRunning == true {
                self?.session.stopRunning()
                Task { @MainActor in
                    self?.isSessionRunning = false
                }
            }
        }
    }

    /// Capture a photo with current settings
    func capturePhoto() async throws -> CapturedPhoto {
        if usesSimulatorCapture {
            guard let mockData = simulatorSampleImageData() else {
                throw CameraError.captureDataUnavailable
            }

            return CapturedPhoto(
                data: mockData,
                rawData: nil,
                settings: nil
            )
        }

        guard setupResult == .success else {
            throw CameraError.sessionSetupFailed
        }

        // Configure photo settings based on capture mode
        let photoSettings = captureMode.photoSettings()

        // Configure flash
        if photoOutput.supportedFlashModes.contains(flashMode.avFlashMode) {
            photoSettings.flashMode = flashMode.avFlashMode
        }

        // Enable high resolution capture
        photoSettings.isHighResolutionPhotoEnabled = true

        // Enable depth data if available (useful for future features)
        photoSettings.isDepthDataDeliveryEnabled = photoOutput.isDepthDataDeliveryEnabled

        // Create photo capture processor
        let photoCaptureProcessor = PhotoCaptureProcessor()

        return try await withCheckedThrowingContinuation { continuation in
            photoCaptureProcessor.continuation = continuation

            sessionQueue.async { [weak self] in
                guard let self = self else { return }

                // Track in-progress captures
                self.inProgressPhotoCaptures[photoSettings.uniqueID] = photoCaptureProcessor

                // Capture photo
                self.photoOutput.capturePhoto(with: photoSettings, delegate: photoCaptureProcessor)
            }
        }
    }

    /// Set capture mode (HEIC, JPEG, RAW)
    func setCaptureMode(_ mode: CaptureMode) {
        self.captureMode = mode
        sessionQueue.async { [weak self] in
            self?.updatePhotoOutputSettings()
        }
    }

    /// Set flash mode
    func setFlashMode(_ mode: FlashMode) {
        self.flashMode = mode
    }

    /// Set torch mode (continuous light)
    func setTorchMode(_ mode: TorchMode) async throws {
        guard let device = currentDevice else {
            throw CameraError.deviceUnavailable
        }

        guard device.hasTorch && device.isTorchAvailable else {
            throw CameraError.torchUnavailable
        }

        try device.lockForConfiguration()
        device.torchMode = mode.avTorchMode
        device.unlockForConfiguration()

        self.torchMode = mode
    }

    /// Set zoom level (1.0 = no zoom)
    func setZoom(_ factor: CGFloat) async throws {
        guard let device = currentDevice else {
            throw CameraError.deviceUnavailable
        }

        let clampedFactor = max(device.minAvailableVideoZoomFactor,
                                min(factor, device.maxAvailableVideoZoomFactor))

        try device.lockForConfiguration()
        device.videoZoomFactor = clampedFactor
        device.unlockForConfiguration()

        currentZoomFactor = clampedFactor
    }

    /// Focus at a specific point in the preview (0,0 to 1,1)
    func focus(at point: CGPoint) async throws {
        guard let device = currentDevice else {
            throw CameraError.deviceUnavailable
        }

        guard device.isFocusPointOfInterestSupported else {
            throw CameraError.focusNotSupported
        }

        try device.lockForConfiguration()
        device.focusPointOfInterest = point
        device.focusMode = .autoFocus
        device.unlockForConfiguration()
    }

    /// Expose at a specific point in the preview (0,0 to 1,1)
    func expose(at point: CGPoint) async throws {
        guard let device = currentDevice else {
            throw CameraError.deviceUnavailable
        }

        guard device.isExposurePointOfInterestSupported else {
            throw CameraError.exposureNotSupported
        }

        try device.lockForConfiguration()
        device.exposurePointOfInterest = point
        device.exposureMode = .autoExpose
        device.unlockForConfiguration()
    }

    /// Enable or disable video data output for stability analysis
    func enableStabilityAnalysis(_ enabled: Bool) {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }

            if enabled && self.videoDataOutput == nil {
                self.addVideoDataOutput()
            } else if !enabled && self.videoDataOutput != nil {
                self.removeVideoDataOutput()
            }

            self.isAnalyzingStability = enabled
        }
    }

    // MARK: - Private Methods

    private func setupVideoDeviceDiscovery() {
        // Discover available video devices
        videoDeviceDiscoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .builtInTelephotoCamera, .builtInUltraWideCamera],
            mediaType: .video,
            position: .back
        )
    }

    private func configureSession() {
        guard setupResult == .success else { return }

        session.beginConfiguration()

        // Set session preset
        session.sessionPreset = .photo

        // Add video input
        do {
            guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
                print("❌ [CameraManager] Failed to get video device")
                setupResult = .configurationFailed
                session.commitConfiguration()
                return
            }

            currentDevice = videoDevice

            let videoDeviceInput = try AVCaptureDeviceInput(device: videoDevice)

            if session.canAddInput(videoDeviceInput) {
                session.addInput(videoDeviceInput)
                self.videoDeviceInput = videoDeviceInput
                print("✓ [CameraManager] Video input added successfully")

                // Setup calibration manager with device
                Task { @MainActor in
                    calibrationManager.setCaptureDevice(videoDevice)
                }

                // Setup device observations
                setupDeviceObservations(for: videoDevice)
            } else {
                print("❌ [CameraManager] Cannot add video input to session")
                setupResult = .configurationFailed
                session.commitConfiguration()
                return
            }
        } catch {
            print("❌ [CameraManager] Failed to create video device input: \(error)")
            setupResult = .configurationFailed
            session.commitConfiguration()
            return
        }

        // Add photo output
        if session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
            print("✓ [CameraManager] Photo output added successfully")

            photoOutput.isHighResolutionCaptureEnabled = true
            photoOutput.maxPhotoQualityPrioritization = .quality

            // Enable RAW capture if available
            if !photoOutput.availableRawPhotoPixelFormatTypes.isEmpty {
                photoOutput.isAppleProRAWEnabled = photoOutput.isAppleProRAWSupported
            }

            updatePhotoOutputSettings()
        } else {
            print("❌ [CameraManager] Cannot add photo output to session")
            setupResult = .configurationFailed
            session.commitConfiguration()
            return
        }

        session.commitConfiguration()
        print("✓ [CameraManager] Session configuration completed successfully")

        // Create preview layer
        Task { @MainActor in
            let preview = AVCaptureVideoPreviewLayer(session: session)
            preview.videoGravity = .resizeAspectFill
            self.previewLayer = preview
        }
    }

    private func updatePhotoOutputSettings() {
        // Configure photo output based on capture mode
        photoOutput.isHighResolutionCaptureEnabled = true

        // Enable RAW + JPEG if in RAW mode
        if captureMode == .raw && !photoOutput.availableRawPhotoPixelFormatTypes.isEmpty {
            photoOutput.isAppleProRAWEnabled = photoOutput.isAppleProRAWSupported
        }
    }

    private func setupDeviceObservations(for device: AVCaptureDevice) {
        // Observe device changes for UI updates
        let isoObservation = device.observe(\.iso) { [weak self] _, _ in
            Task { @MainActor in
                self?.calibrationManager.updateCurrentValues()
            }
        }

        let exposureObservation = device.observe(\.exposureDuration) { [weak self] _, _ in
            Task { @MainActor in
                self?.calibrationManager.updateCurrentValues()
            }
        }

        let lensObservation = device.observe(\.lensPosition) { [weak self] _, _ in
            Task { @MainActor in
                self?.calibrationManager.updateCurrentValues()
            }
        }

        deviceObservations = [isoObservation, exposureObservation, lensObservation]
    }

    private func addVideoDataOutput() {
        let videoOutput = AVCaptureVideoDataOutput()
        videoOutput.setSampleBufferDelegate(self, queue: sessionQueue)

        if session.canAddOutput(videoOutput) {
            session.beginConfiguration()
            session.addOutput(videoOutput)
            session.commitConfiguration()
            self.videoDataOutput = videoOutput
        }
    }

    private func removeVideoDataOutput() {
        guard let videoOutput = videoDataOutput else { return }

        session.beginConfiguration()
        session.removeOutput(videoOutput)
        session.commitConfiguration()
        self.videoDataOutput = nil
    }

    private func simulatorSampleImageData() -> Data? {
        // Generate a mock film negative for simulator testing
        let size = CGSize(width: 1800, height: 1200)
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { context in
            // Draw orange film base
            UIColor(red: 1.0, green: 0.6, blue: 0.2, alpha: 1.0).setFill()
            context.fill(CGRect(origin: .zero, size: size))

            // Draw film frame border
            UIColor(red: 0.8, green: 0.4, blue: 0.1, alpha: 1.0).setStroke()
            context.cgContext.setLineWidth(8)
            context.cgContext.stroke(CGRect(x: 140, y: 120, width: 1520, height: 960))

            // Draw simulated negative content (inverted colors)
            UIColor(red: 0.3, green: 0.2, blue: 0.15, alpha: 1.0).setFill()
            context.fill(CGRect(x: 400, y: 300, width: 600, height: 600))

            // Add text
            let text = "SIMULATOR\nNEGATIVE SAMPLE"
            let paragraphStyle = NSMutableParagraphStyle()
            paragraphStyle.alignment = .center
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 48),
                .foregroundColor: UIColor(red: 0.2, green: 0.15, blue: 0.1, alpha: 1.0),
                .paragraphStyle: paragraphStyle
            ]
            let textSize = text.size(withAttributes: attrs)
            let point = CGPoint(
                x: (size.width - textSize.width) / 2,
                y: (size.height - textSize.height) / 2
            )
            text.draw(at: point, withAttributes: attrs)
        }

        return image.jpegData(compressionQuality: 0.95)
    }

    // MARK: - Cleanup

    deinit {
        deviceObservations.forEach { $0.invalidate() }
    }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

extension CameraManager: AVCaptureVideoDataOutputSampleBufferDelegate {
    nonisolated func captureOutput(_ output: AVCaptureOutput,
                                   didOutput sampleBuffer: CMSampleBuffer,
                                   from connection: AVCaptureConnection) {
        // Reserved for future frame stability analysis.
    }
}

// MARK: - Photo Capture Processor

private class PhotoCaptureProcessor: NSObject, AVCapturePhotoCaptureDelegate {
    var continuation: CheckedContinuation<CapturedPhoto, Error>?
    private var photoData: Data?
    private var rawPhotoData: Data?

    func photoOutput(_ output: AVCapturePhotoOutput,
                    didFinishProcessingPhoto photo: AVCapturePhoto,
                    error: Error?) {
        if let error = error {
            continuation?.resume(throwing: error)
            return
        }

        // Check if this is RAW or processed image
        if photo.isRawPhoto {
            rawPhotoData = photo.fileDataRepresentation()
        } else {
            photoData = photo.fileDataRepresentation()
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput,
                    didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
                    error: Error?) {
        if let error = error {
            continuation?.resume(throwing: error)
            return
        }

        guard let photoData = photoData else {
            continuation?.resume(throwing: CameraError.captureDataUnavailable)
            return
        }

        let capturedPhoto = CapturedPhoto(
            data: photoData,
            rawData: rawPhotoData,
            settings: resolvedSettings
        )

        continuation?.resume(returning: capturedPhoto)
    }
}

// MARK: - Supporting Types

/// Result of a photo capture
struct CapturedPhoto {
    let data: Data
    let rawData: Data?
    let settings: AVCaptureResolvedPhotoSettings?

    var hasRawData: Bool {
        return rawData != nil
    }

    var timestamp: Date {
        return Date()
    }
}

/// Session setup result
private enum SessionSetupResult {
    case success
    case notAuthorized
    case configurationFailed

    var error: CameraError? {
        switch self {
        case .success:
            return nil
        case .notAuthorized:
            return .notAuthorized
        case .configurationFailed:
            return .sessionSetupFailed
        }
    }
}

/// Camera-specific errors
enum CameraError: LocalizedError {
    case notAuthorized
    case sessionSetupFailed
    case deviceUnavailable
    case captureDataUnavailable
    case torchUnavailable
    case focusNotSupported
    case exposureNotSupported

    var errorDescription: String? {
        switch self {
        case .notAuthorized:
            return "Camera access not authorized. Please enable camera access in Settings."
        case .sessionSetupFailed:
            return "Failed to setup camera session"
        case .deviceUnavailable:
            return "Camera device not available"
        case .captureDataUnavailable:
            return "Failed to capture photo data"
        case .torchUnavailable:
            return "Torch not available on this device"
        case .focusNotSupported:
            return "Manual focus not supported"
        case .exposureNotSupported:
            return "Manual exposure not supported"
        }
    }
}
