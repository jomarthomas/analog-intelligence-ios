//
//  ImageRepository.swift
//  AnalogIntelligence
//
//  Handles saving/loading images to/from disk with metadata management.
//

import Foundation
import UIKit
import Combine
import Photos

/// Repository for managing scanned images and their metadata
@MainActor
class ImageRepository: ObservableObject {

    // MARK: - Properties

    @Published private(set) var images: [UUID: ScannedImage] = [:]
    @Published private(set) var isLoading = false

    private let fileManager = FileManager.default
    private let metadataFilename = "images_metadata.json"

    // MARK: - Initialization

    init() {
        Task {
            await loadAllMetadata()
        }
    }

    // MARK: - Public Methods

    /// Save a new scanned image
    func saveImage(
        _ image: UIImage,
        format: ImageFormat,
        sessionId: UUID,
        metadata: ImageMetadata,
        adjustments: ImageAdjustments = ImageAdjustments()
    ) async throws -> ScannedImage {

        // Save original image
        let originalURL = try FileSystemHelper.saveImage(
            image,
            format: format,
            to: FileSystemHelper.imagesDirectory
        )

        let originalPath = FileSystemHelper.relativePath(from: originalURL)

        // Generate thumbnail
        let thumbnailURL = try FileSystemHelper.generateAndSaveThumbnail(
            for: image,
            imageId: UUID()
        )

        let thumbnailPath = FileSystemHelper.relativePath(from: thumbnailURL)

        // Create scanned image record
        let scannedImage = ScannedImage(
            sessionId: sessionId,
            originalImagePath: originalPath,
            thumbnailPath: thumbnailPath,
            metadata: metadata,
            adjustments: adjustments
        )

        // Store in memory
        images[scannedImage.id] = scannedImage

        // Persist metadata
        try await saveMetadata()

        return scannedImage
    }

    /// Save processed image for an existing scanned image
    func saveProcessedImage(
        _ image: UIImage,
        for imageId: UUID,
        format: ImageFormat
    ) async throws {

        guard var scannedImage = images[imageId] else {
            throw RepositoryError.imageNotFound(imageId)
        }

        // Save processed image
        let processedURL = try FileSystemHelper.saveImage(
            image,
            format: format,
            to: FileSystemHelper.processedImagesDirectory
        )

        let processedPath = FileSystemHelper.relativePath(from: processedURL)

        // Update scanned image record
        scannedImage.processedImagePath = processedPath
        images[imageId] = scannedImage

        // Persist metadata
        try await saveMetadata()
    }

    /// Update adjustments for an image
    func updateAdjustments(
        for imageId: UUID,
        adjustments: ImageAdjustments
    ) async throws {

        guard var scannedImage = images[imageId] else {
            throw RepositoryError.imageNotFound(imageId)
        }

        scannedImage.adjustments = adjustments
        images[imageId] = scannedImage

        try await saveMetadata()
    }

    /// Load original image from disk
    func loadOriginalImage(for imageId: UUID) async throws -> UIImage {
        guard let scannedImage = images[imageId] else {
            throw RepositoryError.imageNotFound(imageId)
        }

        let url = FileSystemHelper.imageURL(for: scannedImage.originalImagePath)
        return try FileSystemHelper.loadImage(from: url)
    }

    /// Load processed image from disk
    func loadProcessedImage(for imageId: UUID) async throws -> UIImage {
        guard let scannedImage = images[imageId] else {
            throw RepositoryError.imageNotFound(imageId)
        }

        guard let processedPath = scannedImage.processedImagePath else {
            throw RepositoryError.processedImageNotFound(imageId)
        }

        let url = FileSystemHelper.imageURL(for: processedPath)
        return try FileSystemHelper.loadImage(from: url)
    }

    /// Load thumbnail image from disk
    func loadThumbnail(for imageId: UUID) async throws -> UIImage {
        guard let scannedImage = images[imageId] else {
            throw RepositoryError.imageNotFound(imageId)
        }

        guard let thumbnailPath = scannedImage.thumbnailPath else {
            throw RepositoryError.thumbnailNotFound(imageId)
        }

        let url = FileSystemHelper.imageURL(for: thumbnailPath)
        return try FileSystemHelper.loadImage(from: url)
    }

    /// Delete an image and all associated files
    func deleteImage(id: UUID) async throws {
        guard let scannedImage = images[id] else {
            throw RepositoryError.imageNotFound(id)
        }

        // Delete original image
        let originalURL = FileSystemHelper.imageURL(for: scannedImage.originalImagePath)
        try FileSystemHelper.deleteFile(at: originalURL)

        // Delete processed image if exists
        if let processedPath = scannedImage.processedImagePath {
            let processedURL = FileSystemHelper.imageURL(for: processedPath)
            try FileSystemHelper.deleteFile(at: processedURL)
        }

        // Delete thumbnail if exists
        if let thumbnailPath = scannedImage.thumbnailPath {
            let thumbnailURL = FileSystemHelper.imageURL(for: thumbnailPath)
            try FileSystemHelper.deleteFile(at: thumbnailURL)
        }

        // Remove from memory
        images.removeValue(forKey: id)

        // Persist metadata
        try await saveMetadata()
    }

    /// Delete multiple images
    func deleteImages(ids: [UUID]) async throws {
        for id in ids {
            try await deleteImage(id: id)
        }
    }

    /// Get all images for a session
    func images(for sessionId: UUID) -> [ScannedImage] {
        images.values
            .filter { $0.sessionId == sessionId }
            .sorted { $0.captureDate > $1.captureDate }
    }

    /// Get image by ID
    func image(for id: UUID) -> ScannedImage? {
        images[id]
    }

    /// Add export record to an image
    func addExportRecord(
        to imageId: UUID,
        exportType: ExportType,
        resolution: ExportResolution,
        destination: String
    ) async throws {

        guard var scannedImage = images[imageId] else {
            throw RepositoryError.imageNotFound(imageId)
        }

        let record = ExportRecord(
            exportType: exportType,
            resolution: resolution,
            destination: destination
        )

        scannedImage.addExportRecord(record)
        images[imageId] = scannedImage

        try await saveMetadata()
    }

    /// Get total number of images
    var totalImageCount: Int {
        images.count
    }

    /// Get storage statistics
    func getStorageStats() -> StorageStats {
        let totalSize = FileSystemHelper.getTotalStorageUsed()
        let imageCount = images.count

        var processedCount = 0
        for image in images.values {
            if image.isProcessed {
                processedCount += 1
            }
        }

        return StorageStats(
            totalSize: totalSize,
            totalImages: imageCount,
            processedImages: processedCount
        )
    }

    // MARK: - Metadata Persistence

    private var metadataURL: URL {
        FileSystemHelper.metadataDirectory.appendingPathComponent(metadataFilename)
    }

    /// Load all image metadata from disk
    private func loadAllMetadata() async {
        isLoading = true
        defer { isLoading = false }

        guard FileSystemHelper.fileExists(at: metadataURL) else {
            return
        }

        do {
            let data = try Data(contentsOf: metadataURL)
            let decoder = JSONDecoder()
            let loadedImages = try decoder.decode([ScannedImage].self, from: data)

            // Convert array to dictionary
            var imageDictionary: [UUID: ScannedImage] = [:]
            for image in loadedImages {
                imageDictionary[image.id] = image
            }

            images = imageDictionary

        } catch {
            print("Error loading metadata: \(error)")
        }
    }

    /// Save all image metadata to disk
    private func saveMetadata() async throws {
        let imagesArray = Array(images.values)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        let data = try encoder.encode(imagesArray)
        try data.write(to: metadataURL, options: .atomic)
    }

    // MARK: - Batch Operations

    /// Export images to Photos app
    func exportToPhotos(imageIds: [UUID], isPro: Bool) async throws {
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        if status == .notDetermined {
            _ = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        }

        guard PHPhotoLibrary.authorizationStatus(for: .addOnly) == .authorized else {
            throw RepositoryError.exportFailed("Photos access not granted")
        }

        for imageId in imageIds {
            guard let scannedImage = images[imageId] else { continue }

            // Load processed image if available, otherwise original
            let image = if scannedImage.isProcessed {
                try await loadProcessedImage(for: imageId)
            } else {
                try await loadOriginalImage(for: imageId)
            }

            // Apply watermark for free users
            let finalImage = if !isPro {
                applyWatermark(to: image)
            } else {
                image
            }

            try await PHPhotoLibrary.shared().performChanges {
                PHAssetChangeRequest.creationRequestForAsset(from: finalImage)
            }

            try await addExportRecord(
                to: imageId,
                exportType: .photos,
                resolution: isPro ? .full : .free,
                destination: "Photos Library"
            )
        }
    }

    /// Apply watermark to image (for free users)
    private func applyWatermark(to image: UIImage) -> UIImage {
        // Simple watermark implementation
        let renderer = UIGraphicsImageRenderer(size: image.size)

        return renderer.image { context in
            // Draw original image
            image.draw(at: .zero)

            // Draw watermark text
            let watermarkText = "Analog Intelligence"
            let attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 20, weight: .medium),
                .foregroundColor: UIColor.white.withAlphaComponent(0.5)
            ]

            let textSize = watermarkText.size(withAttributes: attributes)
            let x = image.size.width - textSize.width - 20
            let y = image.size.height - textSize.height - 20

            watermarkText.draw(at: CGPoint(x: x, y: y), withAttributes: attributes)
        }
    }

    // MARK: - Cleanup

    /// Clear all thumbnails and regenerate
    func regenerateThumbnails() async throws {
        try FileSystemHelper.clearThumbnails()

        for (id, var scannedImage) in images {
            do {
                let originalImage = try await loadOriginalImage(for: id)
                let thumbnailURL = try FileSystemHelper.generateAndSaveThumbnail(
                    for: originalImage,
                    imageId: id
                )
                scannedImage.thumbnailPath = FileSystemHelper.relativePath(from: thumbnailURL)
                images[id] = scannedImage
            } catch {
                print("Error regenerating thumbnail for image \(id): \(error)")
            }
        }

        try await saveMetadata()
    }

    /// Delete all images and data
    func deleteAllData() async throws {
        try FileSystemHelper.deleteAllData()
        images.removeAll()
        try await saveMetadata()
    }
}

// MARK: - Supporting Types

struct StorageStats {
    let totalSize: Int64
    let totalImages: Int
    let processedImages: Int

    var formattedSize: String {
        FileSystemHelper.formatBytes(totalSize)
    }

    var unprocessedImages: Int {
        totalImages - processedImages
    }
}

// MARK: - Errors

enum RepositoryError: LocalizedError {
    case imageNotFound(UUID)
    case processedImageNotFound(UUID)
    case thumbnailNotFound(UUID)
    case saveFailed
    case loadFailed
    case exportFailed(String)

    var errorDescription: String? {
        switch self {
        case .imageNotFound(let id):
            return "Image not found: \(id)"
        case .processedImageNotFound(let id):
            return "Processed image not found: \(id)"
        case .thumbnailNotFound(let id):
            return "Thumbnail not found: \(id)"
        case .saveFailed:
            return "Failed to save image"
        case .loadFailed:
            return "Failed to load image"
        case .exportFailed(let reason):
            return "Failed to export image: \(reason)"
        }
    }
}
