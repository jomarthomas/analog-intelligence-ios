//
//  ScannedImage.swift
//  AnalogIntelligence
//
//  Model representing an individual scanned negative image with metadata.
//

import Foundation
import UIKit

/// Represents a single scanned negative image with all associated metadata
struct ScannedImage: Codable, Identifiable {

    // MARK: - Properties

    let id: UUID
    let sessionId: UUID
    let captureDate: Date

    /// File paths (relative to Documents directory)
    var originalImagePath: String
    var processedImagePath: String?
    var thumbnailPath: String?

    /// Image metadata
    var metadata: ImageMetadata

    /// Processing adjustments
    var adjustments: ImageAdjustments

    /// Export information
    var exportHistory: [ExportRecord]

    // MARK: - Initialization

    init(
        id: UUID = UUID(),
        sessionId: UUID,
        captureDate: Date = Date(),
        originalImagePath: String,
        processedImagePath: String? = nil,
        thumbnailPath: String? = nil,
        metadata: ImageMetadata = ImageMetadata(),
        adjustments: ImageAdjustments = ImageAdjustments(),
        exportHistory: [ExportRecord] = []
    ) {
        self.id = id
        self.sessionId = sessionId
        self.captureDate = captureDate
        self.originalImagePath = originalImagePath
        self.processedImagePath = processedImagePath
        self.thumbnailPath = thumbnailPath
        self.metadata = metadata
        self.adjustments = adjustments
        self.exportHistory = exportHistory
    }
}

// MARK: - Image Metadata

/// Metadata captured during image acquisition
struct ImageMetadata: Codable {

    /// Camera settings
    var exposureTime: Double?
    var iso: Float?
    var focalLength: Float?
    var aperture: Float?
    var whiteBalance: WhiteBalanceMode

    /// Image format
    var format: ImageFormat
    var colorSpace: String?
    var bitDepth: Int?

    /// Dimensions
    var originalWidth: Int?
    var originalHeight: Int?

    /// Calibration settings used
    var focusLocked: Bool
    var exposureLocked: Bool
    var whiteBalanceLocked: Bool

    /// Orange mask estimation
    var orangeMaskValue: Float?

    init(
        exposureTime: Double? = nil,
        iso: Float? = nil,
        focalLength: Float? = nil,
        aperture: Float? = nil,
        whiteBalance: WhiteBalanceMode = .auto,
        format: ImageFormat = .heic,
        colorSpace: String? = nil,
        bitDepth: Int? = nil,
        originalWidth: Int? = nil,
        originalHeight: Int? = nil,
        focusLocked: Bool = false,
        exposureLocked: Bool = false,
        whiteBalanceLocked: Bool = false,
        orangeMaskValue: Float? = nil
    ) {
        self.exposureTime = exposureTime
        self.iso = iso
        self.focalLength = focalLength
        self.aperture = aperture
        self.whiteBalance = whiteBalance
        self.format = format
        self.colorSpace = colorSpace
        self.bitDepth = bitDepth
        self.originalWidth = originalWidth
        self.originalHeight = originalHeight
        self.focusLocked = focusLocked
        self.exposureLocked = exposureLocked
        self.whiteBalanceLocked = whiteBalanceLocked
        self.orangeMaskValue = orangeMaskValue
    }
}

// MARK: - Image Adjustments

/// User adjustments applied during processing
struct ImageAdjustments: Codable {

    /// Manual slider values
    var exposure: Float
    var warmth: Float
    var contrast: Float

    /// Crop and rotation
    var cropRect: CodableRect?
    var rotationAngle: Float

    /// Pro features
    var aiColorReconstruction: Bool
    var aiDustRemoval: Bool

    /// Processing pipeline parameters
    var orangeMaskCorrection: Float
    var sharpenAmount: Float

    init(
        exposure: Float = 0.0,
        warmth: Float = 0.0,
        contrast: Float = 0.0,
        cropRect: CodableRect? = nil,
        rotationAngle: Float = 0.0,
        aiColorReconstruction: Bool = false,
        aiDustRemoval: Bool = false,
        orangeMaskCorrection: Float = 1.0,
        sharpenAmount: Float = 0.5
    ) {
        self.exposure = exposure
        self.warmth = warmth
        self.contrast = contrast
        self.cropRect = cropRect
        self.rotationAngle = rotationAngle
        self.aiColorReconstruction = aiColorReconstruction
        self.aiDustRemoval = aiDustRemoval
        self.orangeMaskCorrection = orangeMaskCorrection
        self.sharpenAmount = sharpenAmount
    }
}

// MARK: - Supporting Types

enum ImageFormat: String, Codable {
    case heic
    case jpeg
    case raw
    case png
}

enum WhiteBalanceMode: String, Codable {
    case auto
    case locked
    case manual
}

/// Codable wrapper for CGRect
struct CodableRect: Codable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double

    init(rect: CGRect) {
        self.x = rect.origin.x
        self.y = rect.origin.y
        self.width = rect.size.width
        self.height = rect.size.height
    }

    var cgRect: CGRect {
        CGRect(x: x, y: y, width: width, height: height)
    }
}

// MARK: - Export Record

/// Tracks each export of the image
struct ExportRecord: Codable, Identifiable {
    let id: UUID
    let exportDate: Date
    let exportType: ExportType
    let resolution: ExportResolution
    let destination: String

    init(
        id: UUID = UUID(),
        exportDate: Date = Date(),
        exportType: ExportType,
        resolution: ExportResolution,
        destination: String
    ) {
        self.id = id
        self.exportDate = exportDate
        self.exportType = exportType
        self.resolution = resolution
        self.destination = destination
    }
}

enum ExportType: String, Codable {
    case photos
    case shareSheet
    case contactSheet
    case batch
}

enum ExportResolution: String, Codable {
    case free       // Limited resolution for free tier
    case full       // Full resolution for Pro users
    case thumbnail  // Thumbnail size
}

// MARK: - ScannedImage Extensions

extension ScannedImage {

    /// Check if the image has been processed
    var isProcessed: Bool {
        processedImagePath != nil
    }

    /// Check if thumbnail exists
    var hasThumbnail: Bool {
        thumbnailPath != nil
    }

    /// Get display name for the image
    var displayName: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d, yyyy HH:mm"
        return formatter.string(from: captureDate)
    }

    /// Create a copy with updated adjustments
    func withAdjustments(_ newAdjustments: ImageAdjustments) -> ScannedImage {
        var copy = self
        copy.adjustments = newAdjustments
        return copy
    }

    /// Add export record
    mutating func addExportRecord(_ record: ExportRecord) {
        exportHistory.append(record)
    }
}
