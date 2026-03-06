//
//  ScanEvent.swift
//  AnalogIntelligence
//
//  Events that trigger state transitions in the scanning workflow.
//

import Foundation
import UIKit

/// Events that trigger state transitions in the scan state machine
enum ScanEvent: Equatable {
    // MARK: - Session Events

    /// User initiated a new scanning session
    case startSession

    /// User ended the current scanning session
    case endSession

    /// User paused the scanning session
    case pauseSession

    /// User resumed a paused session
    case resumeSession

    // MARK: - Calibration Events

    /// Begin camera calibration (focus, exposure, white balance)
    case startCalibration

    /// Calibration completed successfully
    case calibrationCompleted

    /// Calibration failed
    case calibrationFailed(reason: String)

    // MARK: - Capture Events

    /// User pressed capture button
    case captureRequested

    /// Photo capture started
    case captureStarted

    /// Photo captured successfully
    case captureCompleted(imageData: Data, metadata: CaptureMetadata)

    /// Photo capture failed
    case captureFailed(reason: String)

    // MARK: - Film Advance Events

    /// User confirmed film has been advanced to next frame
    case filmAdvanced

    /// Skip waiting and go directly to ready (for first frame)
    case skipFilmAdvance

    // MARK: - Processing Events

    /// Image processing started
    case processingStarted

    /// Image processing completed
    case processingCompleted(processedImage: ProcessedImageResult)

    /// Image processing failed
    case processingFailed(reason: String)

    // MARK: - Review Events

    /// User opened adjust/review screen
    case reviewStarted(frameIndex: Int)

    /// User saved adjustments
    case reviewCompleted

    /// User canceled review (discard)
    case reviewCanceled

    // MARK: - Export Events

    /// Export process started
    case exportStarted

    /// Export completed successfully
    case exportCompleted

    /// Export failed
    case exportFailed(reason: String)

    // MARK: - Error Events

    /// An error occurred
    case errorOccurred(ScanError)

    /// User chose to retry after error
    case retryAfterError

    /// User chose to cancel after error
    case cancelAfterError

    // MARK: - Phase 3: Future Dock Events (Stubbed)
    // These will be implemented when hardware dock integration is added

    // /// Dock connection initiated
    // case dockConnectionStarted
    //
    // /// Dock connected successfully
    // case dockConnected
    //
    // /// Dock disconnected
    // case dockDisconnected
    //
    // /// Film frame is aligned in dock
    // case frameAligned
    //
    // /// Frame alignment lost
    // case frameAlignmentLost
    //
    // /// Quality verification passed
    // case qualityVerificationPassed
    //
    // /// Quality verification failed, need retry
    // case qualityVerificationFailed
    //
    // /// Film jam detected in dock
    // case filmJamDetected
    //
    // /// Dock battery low
    // case dockLowBattery
    //
    // /// All frames in roll scanned
    // case rollCompleted
}

// MARK: - Supporting Types

/// Metadata captured with each photo
struct CaptureMetadata: Equatable {
    let timestamp: Date
    let exposureDuration: TimeInterval
    let iso: Float
    let aperture: Float?
    let focalLength: Float?
    let captureMode: CaptureMode
    let deviceOrientation: UIDeviceOrientation?

    static func == (lhs: CaptureMetadata, rhs: CaptureMetadata) -> Bool {
        return lhs.timestamp == rhs.timestamp &&
               lhs.exposureDuration == rhs.exposureDuration &&
               lhs.iso == rhs.iso &&
               lhs.aperture == rhs.aperture &&
               lhs.focalLength == rhs.focalLength &&
               lhs.captureMode == rhs.captureMode
    }
}

/// Result from image processing pipeline
struct ProcessedImageResult: Equatable {
    let processedImage: Data // Processed image data
    let thumbnailImage: Data? // Thumbnail for gallery
    let frameIndex: Int
    let processingDuration: TimeInterval
    let metadata: ProcessingMetadata

    static func == (lhs: ProcessedImageResult, rhs: ProcessedImageResult) -> Bool {
        return lhs.processedImage == rhs.processedImage &&
               lhs.thumbnailImage == rhs.thumbnailImage &&
               lhs.frameIndex == rhs.frameIndex &&
               lhs.processingDuration == rhs.processingDuration
    }
}

/// Metadata from image processing
struct ProcessingMetadata: Equatable {
    let orangeMaskEstimate: OrangeMaskEstimate?
    let histogramData: HistogramData?
    let appliedAdjustments: WorkflowImageAdjustments

    static func == (lhs: ProcessingMetadata, rhs: ProcessingMetadata) -> Bool {
        return lhs.appliedAdjustments == rhs.appliedAdjustments
    }
}

/// Orange mask color estimation
struct OrangeMaskEstimate: Equatable {
    let redChannel: Float
    let greenChannel: Float
    let blueChannel: Float
}

/// Histogram data for insights
struct HistogramData: Equatable {
    let redHistogram: [Int]
    let greenHistogram: [Int]
    let blueHistogram: [Int]
    let luminanceHistogram: [Int]
    let shadowClipping: Float // Percentage
    let highlightClipping: Float // Percentage
}

/// User adjustments applied to image
struct WorkflowImageAdjustments: Equatable {
    var exposure: Float = 0.0 // -2.0 to +2.0
    var warmth: Float = 0.0 // -1.0 to +1.0
    var contrast: Float = 1.0 // 0.5 to 1.5

    // Phase 2 - AI adjustments (stubbed)
    // var aiColorReconstruction: Bool = false
    // var aiDustRemoval: Bool = false
}

// MARK: - Event Properties

extension ScanEvent {
    /// Whether this event represents an error condition
    var isError: Bool {
        switch self {
        case .calibrationFailed, .captureFailed, .processingFailed, .exportFailed, .errorOccurred:
            return true
        default:
            return false
        }
    }

    /// Whether this event requires user action
    var requiresUserAction: Bool {
        switch self {
        case .filmAdvanced, .reviewCompleted, .reviewCanceled, .retryAfterError, .cancelAfterError:
            return true
        default:
            return false
        }
    }

    /// Human-readable description of the event
    var description: String {
        switch self {
        // Session
        case .startSession: return "Start session"
        case .endSession: return "End session"
        case .pauseSession: return "Pause session"
        case .resumeSession: return "Resume session"

        // Calibration
        case .startCalibration: return "Start calibration"
        case .calibrationCompleted: return "Calibration completed"
        case .calibrationFailed(let reason): return "Calibration failed: \(reason)"

        // Capture
        case .captureRequested: return "Capture requested"
        case .captureStarted: return "Capture started"
        case .captureCompleted: return "Capture completed"
        case .captureFailed(let reason): return "Capture failed: \(reason)"

        // Film advance
        case .filmAdvanced: return "Film advanced"
        case .skipFilmAdvance: return "Skip film advance"

        // Processing
        case .processingStarted: return "Processing started"
        case .processingCompleted: return "Processing completed"
        case .processingFailed(let reason): return "Processing failed: \(reason)"

        // Review
        case .reviewStarted(let index): return "Review started (frame \(index))"
        case .reviewCompleted: return "Review completed"
        case .reviewCanceled: return "Review canceled"

        // Export
        case .exportStarted: return "Export started"
        case .exportCompleted: return "Export completed"
        case .exportFailed(let reason): return "Export failed: \(reason)"

        // Error
        case .errorOccurred(let error): return "Error: \(error.localizedDescription)"
        case .retryAfterError: return "Retry after error"
        case .cancelAfterError: return "Cancel after error"
        }
    }
}
