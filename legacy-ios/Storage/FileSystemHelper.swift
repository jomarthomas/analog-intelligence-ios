//
//  FileSystemHelper.swift
//  AnalogIntelligence
//
//  Utilities for file system operations and path management.
//

import Foundation
import UIKit
import CoreImage

/// Utility class for file system operations
enum FileSystemHelper {

    // MARK: - Directory Management

    /// Get the Documents directory URL
    static var documentsDirectory: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    /// Get the Caches directory URL
    static var cachesDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    }

    /// Get the app's main storage directory for images
    static var imagesDirectory: URL {
        let url = documentsDirectory.appendingPathComponent("Images", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    /// Get the processed images directory
    static var processedImagesDirectory: URL {
        let url = documentsDirectory.appendingPathComponent("ProcessedImages", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    /// Get the thumbnails directory (in Caches)
    static var thumbnailsDirectory: URL {
        let url = cachesDirectory.appendingPathComponent("Thumbnails", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    /// Get the metadata directory
    static var metadataDirectory: URL {
        let url = documentsDirectory.appendingPathComponent("Metadata", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    /// Get the sessions directory
    static var sessionsDirectory: URL {
        let url = documentsDirectory.appendingPathComponent("Sessions", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    // MARK: - File Path Generation

    /// Generate a unique filename for an image
    static func generateImageFilename(format: ImageFormat, prefix: String = "IMG") -> String {
        let timestamp = ISO8601DateFormatter().string(from: Date())
            .replacingOccurrences(of: ":", with: "-")
            .replacingOccurrences(of: ".", with: "-")
        let uuid = UUID().uuidString.prefix(8)
        return "\(prefix)_\(timestamp)_\(uuid).\(format.fileExtension)"
    }

    /// Generate a thumbnail filename based on the original image ID
    static func generateThumbnailFilename(for imageId: UUID) -> String {
        "thumb_\(imageId.uuidString).jpg"
    }

    /// Get full URL for an image path
    static func imageURL(for relativePath: String) -> URL {
        documentsDirectory.appendingPathComponent(relativePath)
    }

    /// Get relative path from full URL
    static func relativePath(from url: URL) -> String {
        url.path.replacingOccurrences(of: documentsDirectory.path + "/", with: "")
    }

    // MARK: - File Operations

    /// Save image data to disk
    @discardableResult
    static func saveImage(_ image: UIImage, format: ImageFormat, to directory: URL) throws -> URL {
        let filename = generateImageFilename(format: format)
        let fileURL = directory.appendingPathComponent(filename)

        guard let data = imageData(from: image, format: format) else {
            throw FileSystemError.imageConversionFailed
        }

        try data.write(to: fileURL, options: .atomic)
        return fileURL
    }

    /// Save image with specific filename
    @discardableResult
    static func saveImage(_ image: UIImage, format: ImageFormat, filename: String, to directory: URL) throws -> URL {
        let fileURL = directory.appendingPathComponent(filename)

        guard let data = imageData(from: image, format: format) else {
            throw FileSystemError.imageConversionFailed
        }

        try data.write(to: fileURL, options: .atomic)
        return fileURL
    }

    /// Load image from disk
    static func loadImage(from url: URL) throws -> UIImage {
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw FileSystemError.fileNotFound(url.path)
        }

        let data = try Data(contentsOf: url)

        guard let image = UIImage(data: data) else {
            throw FileSystemError.imageLoadFailed
        }

        return image
    }

    /// Delete file at URL
    static func deleteFile(at url: URL) throws {
        guard FileManager.default.fileExists(atPath: url.path) else {
            return // File doesn't exist, nothing to delete
        }

        try FileManager.default.removeItem(at: url)
    }

    /// Move file from one location to another
    static func moveFile(from sourceURL: URL, to destinationURL: URL) throws {
        // Create parent directory if needed
        let parentDirectory = destinationURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: parentDirectory, withIntermediateDirectories: true)

        // Remove destination if it exists
        try? FileManager.default.removeItem(at: destinationURL)

        try FileManager.default.moveItem(at: sourceURL, to: destinationURL)
    }

    /// Copy file from one location to another
    static func copyFile(from sourceURL: URL, to destinationURL: URL) throws {
        // Create parent directory if needed
        let parentDirectory = destinationURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: parentDirectory, withIntermediateDirectories: true)

        // Remove destination if it exists
        try? FileManager.default.removeItem(at: destinationURL)

        try FileManager.default.copyItem(at: sourceURL, to: destinationURL)
    }

    /// Check if file exists
    static func fileExists(at url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.path)
    }

    /// Get file size in bytes
    static func fileSize(at url: URL) -> Int64? {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path) else {
            return nil
        }
        return attributes[.size] as? Int64
    }

    // MARK: - Image Conversion

    /// Convert UIImage to Data based on format
    private static func imageData(from image: UIImage, format: ImageFormat) -> Data? {
        switch format {
        case .jpeg:
            return image.jpegData(compressionQuality: 0.95)
        case .png:
            return image.pngData()
        case .heic:
            // For HEIC, we use JPEG as fallback (HEIC encoding requires more complex setup)
            return image.jpegData(compressionQuality: 0.95)
        case .raw:
            // RAW format should be handled separately during capture
            return image.jpegData(compressionQuality: 1.0)
        }
    }

    // MARK: - Thumbnail Generation

    /// Generate thumbnail from image
    static func generateThumbnail(
        from image: UIImage,
        maxDimension: CGFloat = 200
    ) -> UIImage? {
        let size = image.size
        let scale = min(maxDimension / size.width, maxDimension / size.height)
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)

        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    /// Generate and save thumbnail for an image
    static func generateAndSaveThumbnail(
        for image: UIImage,
        imageId: UUID,
        maxDimension: CGFloat = 200
    ) throws -> URL {
        guard let thumbnail = generateThumbnail(from: image, maxDimension: maxDimension) else {
            throw FileSystemError.thumbnailGenerationFailed
        }

        let filename = generateThumbnailFilename(for: imageId)
        return try saveImage(thumbnail, format: .jpeg, filename: filename, to: thumbnailsDirectory)
    }

    // MARK: - Storage Info

    /// Get total storage used by the app in bytes
    static func getTotalStorageUsed() -> Int64 {
        var totalSize: Int64 = 0

        let directories = [
            imagesDirectory,
            processedImagesDirectory,
            thumbnailsDirectory,
            metadataDirectory,
            sessionsDirectory
        ]

        for directory in directories {
            totalSize += directorySize(at: directory)
        }

        return totalSize
    }

    /// Get size of a directory in bytes
    static func directorySize(at url: URL) -> Int64 {
        var totalSize: Int64 = 0

        guard let enumerator = FileManager.default.enumerator(at: url, includingPropertiesForKeys: [.fileSizeKey]) else {
            return 0
        }

        for case let fileURL as URL in enumerator {
            guard let fileSize = fileSize(at: fileURL) else { continue }
            totalSize += fileSize
        }

        return totalSize
    }

    /// Format bytes to human-readable string
    static func formatBytes(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }

    // MARK: - Cleanup

    /// Clear all thumbnails
    static func clearThumbnails() throws {
        let thumbnailFiles = try FileManager.default.contentsOfDirectory(
            at: thumbnailsDirectory,
            includingPropertiesForKeys: nil
        )

        for fileURL in thumbnailFiles {
            try FileManager.default.removeItem(at: fileURL)
        }
    }

    /// Clear all cached data
    static func clearCaches() throws {
        try clearThumbnails()
    }

    /// Delete all app data (use with caution)
    static func deleteAllData() throws {
        let directories = [
            imagesDirectory,
            processedImagesDirectory,
            thumbnailsDirectory,
            metadataDirectory,
            sessionsDirectory
        ]

        for directory in directories {
            try? FileManager.default.removeItem(at: directory)
            // Recreate empty directory
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        }
    }
}

// MARK: - File Extension

extension ImageFormat {
    var fileExtension: String {
        switch self {
        case .heic: return "heic"
        case .jpeg: return "jpg"
        case .raw: return "dng"
        case .png: return "png"
        }
    }
}

// MARK: - Errors

enum FileSystemError: LocalizedError {
    case imageConversionFailed
    case imageLoadFailed
    case thumbnailGenerationFailed
    case fileNotFound(String)
    case invalidPath
    case insufficientStorage
    case writePermissionDenied

    var errorDescription: String? {
        switch self {
        case .imageConversionFailed:
            return "Failed to convert image to data"
        case .imageLoadFailed:
            return "Failed to load image from disk"
        case .thumbnailGenerationFailed:
            return "Failed to generate thumbnail"
        case .fileNotFound(let path):
            return "File not found at path: \(path)"
        case .invalidPath:
            return "Invalid file path"
        case .insufficientStorage:
            return "Insufficient storage space"
        case .writePermissionDenied:
            return "Write permission denied"
        }
    }
}
