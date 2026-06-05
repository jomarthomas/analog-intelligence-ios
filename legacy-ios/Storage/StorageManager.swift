//
//  StorageManager.swift
//  AnalogIntelligence
//
//  Main storage coordinator for managing scanned images, sessions, and metadata.
//

import Foundation
import UIKit
import Combine
import Photos

/// Main storage manager coordinating all storage operations
@MainActor
class StorageManager: ObservableObject {

    // MARK: - Singleton

    static let shared = StorageManager()

    // MARK: - Published Properties

    @Published private(set) var sessions: [ScanSession] = []
    @Published private(set) var currentSession: ScanSession?
    @Published private(set) var isLoading = false

    // MARK: - Repositories

    private let imageRepository = ImageRepository()
    private let preferencesManager = PreferencesManager.shared

    // MARK: - Private Properties

    private let sessionsFilename = "sessions.json"
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    private init() {
        setupDirectories()
        Task {
            await loadSessions()
            await createDefaultSessionIfNeeded()
        }
    }

    // MARK: - Directory Setup

    private func setupDirectories() {
        // Ensure all required directories exist
        _ = FileSystemHelper.imagesDirectory
        _ = FileSystemHelper.processedImagesDirectory
        _ = FileSystemHelper.thumbnailsDirectory
        _ = FileSystemHelper.metadataDirectory
        _ = FileSystemHelper.sessionsDirectory
    }

    // MARK: - Session Management

    /// Create a new scanning session
    func createSession(
        name: String,
        filmType: FilmType? = nil,
        filmBrand: String? = nil,
        filmSpeed: Int? = nil
    ) async throws -> ScanSession {

        let session = ScanSession(
            name: name,
            filmType: filmType,
            filmBrand: filmBrand,
            filmSpeed: filmSpeed
        )

        sessions.append(session)
        currentSession = session

        try await saveSessions()

        return session
    }

    /// Update an existing session
    func updateSession(
        id: UUID,
        name: String? = nil,
        notes: String? = nil,
        filmType: FilmType? = nil,
        filmBrand: String? = nil,
        filmSpeed: Int? = nil
    ) async throws {

        guard let index = sessions.firstIndex(where: { $0.id == id }) else {
            throw StorageError.sessionNotFound(id)
        }

        sessions[index].updateMetadata(
            name: name,
            notes: notes,
            filmType: filmType,
            filmBrand: filmBrand,
            filmSpeed: filmSpeed
        )

        try await saveSessions()
    }

    /// Delete a session and all its images
    func deleteSession(id: UUID) async throws {
        guard let session = sessions.first(where: { $0.id == id }) else {
            throw StorageError.sessionNotFound(id)
        }

        // Delete all images in the session
        try await imageRepository.deleteImages(ids: session.imageIds)

        // Remove session
        sessions.removeAll { $0.id == id }

        // Clear current session if it was deleted
        if currentSession?.id == id {
            currentSession = sessions.first
        }

        try await saveSessions()
    }

    /// Set the active session
    func setCurrentSession(_ session: ScanSession) {
        currentSession = session
    }

    /// Get session by ID
    func session(for id: UUID) -> ScanSession? {
        sessions.first { $0.id == id }
    }

    /// Mark session as completed
    func markSessionCompleted(id: UUID) async throws {
        guard let index = sessions.firstIndex(where: { $0.id == id }) else {
            throw StorageError.sessionNotFound(id)
        }

        sessions[index].markCompleted()
        try await saveSessions()
    }

    /// Archive session
    func archiveSession(id: UUID) async throws {
        guard let index = sessions.firstIndex(where: { $0.id == id }) else {
            throw StorageError.sessionNotFound(id)
        }

        sessions[index].archive()
        try await saveSessions()
    }

    // MARK: - Image Management

    /// Save a newly captured image
    func saveScannedImage(
        _ image: UIImage,
        format: ImageFormat = .heic,
        metadata: ImageMetadata,
        adjustments: ImageAdjustments = ImageAdjustments()
    ) async throws -> ScannedImage {

        // Ensure we have a current session
        if currentSession == nil {
            // Create default session if none exists
            let newSession = try await createSession(name: ScanSession.createDefault().name)
            currentSession = newSession
        }

        guard let sessionId = currentSession?.id else {
            throw StorageError.noActiveSession
        }

        // Save image through repository
        let scannedImage = try await imageRepository.saveImage(
            image,
            format: format,
            sessionId: sessionId,
            metadata: metadata,
            adjustments: adjustments
        )

        // Update session
        if let index = sessions.firstIndex(where: { $0.id == sessionId }) {
            sessions[index].addImage(id: scannedImage.id)
            try await saveSessions()
        }

        return scannedImage
    }

    /// Save processed version of an image
    func saveProcessedImage(
        _ image: UIImage,
        for imageId: UUID,
        format: ImageFormat = .jpeg
    ) async throws {

        try await imageRepository.saveProcessedImage(
            image,
            for: imageId,
            format: format
        )
    }

    /// Update image adjustments
    func updateImageAdjustments(
        for imageId: UUID,
        adjustments: ImageAdjustments
    ) async throws {

        try await imageRepository.updateAdjustments(
            for: imageId,
            adjustments: adjustments
        )
    }

    /// Delete an image
    func deleteImage(id: UUID) async throws {
        // Get the image to find its session
        guard let scannedImage = imageRepository.image(for: id) else {
            throw StorageError.imageNotFound(id)
        }

        // Remove from session
        if let index = sessions.firstIndex(where: { $0.id == scannedImage.sessionId }) {
            sessions[index].removeImage(id: id)
            try await saveSessions()
        }

        // Delete from repository
        try await imageRepository.deleteImage(id: id)
    }

    /// Delete multiple images
    func deleteImages(ids: [UUID]) async throws {
        for id in ids {
            try await deleteImage(id: id)
        }
    }

    /// Get all images for a session
    func images(for sessionId: UUID) -> [ScannedImage] {
        imageRepository.images(for: sessionId)
    }

    /// Get all images across all sessions
    func allImages() -> [ScannedImage] {
        Array(imageRepository.images.values)
            .sorted { $0.captureDate > $1.captureDate }
    }

    /// Get image by ID
    func image(for id: UUID) -> ScannedImage? {
        imageRepository.image(for: id)
    }

    // MARK: - Image Loading

    /// Load original image
    func loadOriginalImage(for imageId: UUID) async throws -> UIImage {
        try await imageRepository.loadOriginalImage(for: imageId)
    }

    /// Load processed image
    func loadProcessedImage(for imageId: UUID) async throws -> UIImage {
        try await imageRepository.loadProcessedImage(for: imageId)
    }

    /// Load thumbnail
    func loadThumbnail(for imageId: UUID) async throws -> UIImage {
        try await imageRepository.loadThumbnail(for: imageId)
    }

    // MARK: - Export Operations

    /// Export images to Photos app
    func exportToPhotos(imageIds: [UUID]) async throws {
        let isPro = preferencesManager.preferences.isPro

        // Check Photos permission
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)

        guard status == .authorized else {
            throw StorageError.photosPermissionDenied
        }

        try await imageRepository.exportToPhotos(imageIds: imageIds, isPro: isPro)
    }

    /// Prepare image for sharing via share sheet
    func prepareForSharing(imageId: UUID) async throws -> URL {
        let isPro = preferencesManager.preferences.isPro
        let scannedImage = imageRepository.image(for: imageId)

        guard scannedImage != nil else {
            throw StorageError.imageNotFound(imageId)
        }

        // Load processed or original image
        let image = try await (scannedImage?.isProcessed == true
            ? loadProcessedImage(for: imageId)
            : loadOriginalImage(for: imageId))

        // Apply watermark for free users
        let finalImage = isPro ? image : applyWatermark(to: image)

        // Save to temporary location
        let tempURL = FileSystemHelper.cachesDirectory
            .appendingPathComponent("share_\(imageId.uuidString).jpg")

        if let data = finalImage.jpegData(compressionQuality: 0.95) {
            try data.write(to: tempURL)
        }

        // Record export
        try await imageRepository.addExportRecord(
            to: imageId,
            exportType: .shareSheet,
            resolution: isPro ? .full : .free,
            destination: "Share Sheet"
        )

        return tempURL
    }

    /// Export batch of images
    func exportBatch(
        sessionId: UUID,
        format: ExportFormat = .jpeg,
        includeMetadata: Bool = true
    ) async throws -> URL {

        let session = sessions.first { $0.id == sessionId }
        guard session != nil else {
            throw StorageError.sessionNotFound(sessionId)
        }

        let sessionImages = images(for: sessionId)
        let isPro = preferencesManager.preferences.isPro

        // Create temporary export directory
        let exportDir = FileSystemHelper.cachesDirectory
            .appendingPathComponent("export_\(sessionId.uuidString)")

        try? FileManager.default.createDirectory(at: exportDir, withIntermediateDirectories: true)

        // Export each image
        for (index, scannedImage) in sessionImages.enumerated() {
            let image = try await (scannedImage.isProcessed
                ? loadProcessedImage(for: scannedImage.id)
                : loadOriginalImage(for: scannedImage.id))

            let finalImage = isPro ? image : applyWatermark(to: image)

            let filename = String(format: "image_%03d.%@", index + 1, format.fileExtension)
            let fileURL = exportDir.appendingPathComponent(filename)

            if let data = imageData(from: finalImage, format: format) {
                try data.write(to: fileURL)
            }

            // Save metadata if requested
            if includeMetadata {
                let metadataURL = exportDir.appendingPathComponent("image_\(index + 1)_metadata.json")
                let encoder = JSONEncoder()
                encoder.outputFormatting = [.prettyPrinted]
                let metadataData = try encoder.encode(scannedImage)
                try metadataData.write(to: metadataURL)
            }
        }

        return exportDir
    }

    // MARK: - Statistics

    /// Get storage statistics
    func getStorageStats() -> StorageStats {
        imageRepository.getStorageStats()
    }

    /// Get session statistics
    func getSessionStats() -> SessionStats {
        SessionStats(
            totalSessions: sessions.count,
            activeSessions: sessions.filter { $0.sessionState == .active }.count,
            completedSessions: sessions.filter { $0.sessionState == .completed }.count,
            archivedSessions: sessions.filter { $0.sessionState == .archived }.count
        )
    }

    // MARK: - Maintenance

    /// Regenerate all thumbnails
    func regenerateThumbnails() async throws {
        try await imageRepository.regenerateThumbnails()
    }

    /// Clear cache data
    func clearCache() async throws {
        try FileSystemHelper.clearCaches()
    }

    /// Delete all data (factory reset)
    func deleteAllData() async throws {
        try await imageRepository.deleteAllData()
        sessions.removeAll()
        currentSession = nil
        try await saveSessions()
    }

    // MARK: - Session Persistence

    private var sessionsURL: URL {
        FileSystemHelper.sessionsDirectory.appendingPathComponent(sessionsFilename)
    }

    private func loadSessions() async {
        isLoading = true
        defer { isLoading = false }

        guard FileSystemHelper.fileExists(at: sessionsURL) else {
            return
        }

        do {
            let data = try Data(contentsOf: sessionsURL)
            let decoder = JSONDecoder()
            sessions = try decoder.decode([ScanSession].self, from: data)

            // Sort sessions
            sessions.sort()

        } catch {
            print("Error loading sessions: \(error)")
        }
    }

    private func saveSessions() async throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        let data = try encoder.encode(sessions)
        try data.write(to: sessionsURL, options: .atomic)
    }

    private func createDefaultSessionIfNeeded() async {
        if sessions.isEmpty {
            let defaultSession = ScanSession.createDefault()
            sessions.append(defaultSession)
            currentSession = defaultSession

            try? await saveSessions()
        } else {
            // Set first active session as current
            currentSession = sessions.first { $0.sessionState == .active } ?? sessions.first
        }
    }

    // MARK: - Helper Methods

    private func applyWatermark(to image: UIImage) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: image.size)

        return renderer.image { context in
            image.draw(at: .zero)

            let watermarkText = "Analog Intelligence"
            let attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 24, weight: .semibold),
                .foregroundColor: UIColor.white.withAlphaComponent(0.6)
            ]

            let textSize = watermarkText.size(withAttributes: attributes)
            let position = preferencesManager.preferences.watermarkPosition

            let point = watermarkPosition(
                for: position,
                imageSize: image.size,
                textSize: textSize
            )

            watermarkText.draw(at: point, withAttributes: attributes)
        }
    }

    private func watermarkPosition(
        for position: WatermarkPosition,
        imageSize: CGSize,
        textSize: CGSize
    ) -> CGPoint {

        let padding: CGFloat = 20

        switch position {
        case .topLeft:
            return CGPoint(x: padding, y: padding)
        case .topRight:
            return CGPoint(x: imageSize.width - textSize.width - padding, y: padding)
        case .bottomLeft:
            return CGPoint(x: padding, y: imageSize.height - textSize.height - padding)
        case .bottomRight:
            return CGPoint(x: imageSize.width - textSize.width - padding,
                          y: imageSize.height - textSize.height - padding)
        case .center:
            return CGPoint(x: (imageSize.width - textSize.width) / 2,
                          y: (imageSize.height - textSize.height) / 2)
        }
    }

    private func imageData(from image: UIImage, format: ExportFormat) -> Data? {
        switch format {
        case .jpeg:
            return image.jpegData(compressionQuality: Double(preferencesManager.preferences.jpegQuality))
        case .png:
            return image.pngData()
        case .heic:
            return image.jpegData(compressionQuality: 0.95)
        case .tiff:
            return image.jpegData(compressionQuality: 1.0)
        }
    }
}

// MARK: - Supporting Types

struct SessionStats {
    let totalSessions: Int
    let activeSessions: Int
    let completedSessions: Int
    let archivedSessions: Int
}

// MARK: - Errors

enum StorageError: LocalizedError {
    case sessionNotFound(UUID)
    case imageNotFound(UUID)
    case noActiveSession
    case photosPermissionDenied
    case exportFailed
    case insufficientStorage

    var errorDescription: String? {
        switch self {
        case .sessionNotFound(let id):
            return "Session not found: \(id)"
        case .imageNotFound(let id):
            return "Image not found: \(id)"
        case .noActiveSession:
            return "No active scanning session"
        case .photosPermissionDenied:
            return "Photos library access denied"
        case .exportFailed:
            return "Failed to export images"
        case .insufficientStorage:
            return "Insufficient storage space"
        }
    }
}
