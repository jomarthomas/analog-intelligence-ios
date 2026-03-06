//
//  ScanState.swift
//  AnalogIntelligence
//
//  Defines all possible states in the manual film scanning workflow.
//

import Foundation

/// States for manual batch scanning workflow (Phase 1)
enum ScanState: Equatable, Hashable {
    // MARK: - Phase 1: Manual Scanning States

    /// Initial state, no scanning session active
    case idle

    /// Locking focus, exposure, and white balance for consistent scans
    case calibrating

    /// Calibrated and ready to capture the first or next frame
    case ready

    /// Waiting for user to manually advance film to next frame
    case waitingForFilmAdvance

    /// Actively capturing a photo
    case capturing

    /// Running the image processing pipeline (inversion, color correction, etc.)
    case processing

    /// User reviewing and adjusting the processed image in Adjust screen
    case reviewing(frameIndex: Int)

    /// Saving the final image to storage/gallery
    case exporting

    /// User paused the scanning session (can resume later)
    case paused

    /// Error occurred during scanning workflow
    case error(ScanError)

    // MARK: - Phase 3: Future Auto Roll Scan States (Stubbed)
    // These will be implemented when hardware dock integration is added

    // /// Establishing Bluetooth connection with scanning dock
    // case connectingToDock
    //
    // /// Waiting for film frame to be aligned in dock
    // case waitingForDockAlignment
    //
    // /// Checking capture quality before moving to next frame
    // case verifyingQuality
    //
    // /// Re-capturing current frame due to quality issues
    // case retryingCapture
    //
    // /// All frames in roll have been scanned
    // case completed
}

// MARK: - Scan Errors

/// Errors that can occur during the scanning workflow
enum ScanError: Error, Equatable, Hashable {
    // Camera errors
    case cameraNotAvailable
    case calibrationFailed(reason: String)
    case captureFailed(reason: String)
    case focusLockFailed
    case exposureLockFailed
    case whiteBalanceLockFailed

    // Processing errors
    case processingFailed(reason: String)
    case invalidImageData
    case memoryLimitExceeded

    // Storage errors
    case exportFailed(reason: String)
    case storagePermissionDenied
    case insufficientStorage

    // Session errors
    case sessionInterrupted
    case noActiveSession

    // Phase 3 - Future dock errors (stubbed)
    // case dockConnectionFailed
    // case frameAlignmentTimeout
    // case filmJamDetected
    // case dockLowBattery
    // case dockDisconnected

    var localizedDescription: String {
        switch self {
        // Camera errors
        case .cameraNotAvailable:
            return "Camera is not available. Please check permissions."
        case .calibrationFailed(let reason):
            return "Calibration failed: \(reason)"
        case .captureFailed(let reason):
            return "Capture failed: \(reason)"
        case .focusLockFailed:
            return "Unable to lock focus. Try adjusting lighting."
        case .exposureLockFailed:
            return "Unable to lock exposure. Try adjusting lighting."
        case .whiteBalanceLockFailed:
            return "Unable to lock white balance."

        // Processing errors
        case .processingFailed(let reason):
            return "Image processing failed: \(reason)"
        case .invalidImageData:
            return "Captured image data is invalid."
        case .memoryLimitExceeded:
            return "Not enough memory to process image."

        // Storage errors
        case .exportFailed(let reason):
            return "Export failed: \(reason)"
        case .storagePermissionDenied:
            return "Storage permission denied. Please enable in Settings."
        case .insufficientStorage:
            return "Not enough storage space available."

        // Session errors
        case .sessionInterrupted:
            return "Scanning session was interrupted."
        case .noActiveSession:
            return "No active scanning session."
        }
    }

    /// Whether the error is recoverable
    var isRecoverable: Bool {
        switch self {
        case .cameraNotAvailable, .storagePermissionDenied, .insufficientStorage:
            return false
        case .calibrationFailed, .captureFailed, .focusLockFailed, .exposureLockFailed,
             .whiteBalanceLockFailed, .processingFailed, .invalidImageData,
             .memoryLimitExceeded, .exportFailed, .sessionInterrupted:
            return true
        case .noActiveSession:
            return false
        }
    }
}

// MARK: - State Properties

extension ScanState {
    /// Human-readable description of the current state
    var description: String {
        switch self {
        case .idle:
            return "Idle"
        case .calibrating:
            return "Calibrating camera..."
        case .ready:
            return "Ready to capture"
        case .waitingForFilmAdvance:
            return "Advance film to next frame"
        case .capturing:
            return "Capturing..."
        case .processing:
            return "Processing image..."
        case .reviewing(let frameIndex):
            return "Reviewing frame \(frameIndex)"
        case .exporting:
            return "Exporting..."
        case .paused:
            return "Paused"
        case .error(let error):
            return "Error: \(error.localizedDescription)"
        }
    }

    /// Whether the state allows user interaction
    var allowsUserInteraction: Bool {
        switch self {
        case .idle, .ready, .waitingForFilmAdvance, .reviewing, .paused, .error:
            return true
        case .calibrating, .capturing, .processing, .exporting:
            return false
        }
    }

    /// Whether the camera preview should be active
    var shouldShowCameraPreview: Bool {
        switch self {
        case .idle, .calibrating, .ready, .waitingForFilmAdvance, .capturing, .paused:
            return true
        case .processing, .reviewing, .exporting, .error:
            return false
        }
    }

    /// Whether the capture button should be enabled
    var captureButtonEnabled: Bool {
        switch self {
        case .ready, .waitingForFilmAdvance:
            return true
        case .idle, .calibrating, .capturing, .processing, .reviewing, .exporting, .paused, .error:
            return false
        }
    }
}
