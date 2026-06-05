//
//  ExportManager.swift
//  Analog Intelligence
//
//  Export coordinator for processed images.
//

import Foundation
import CoreImage
import Photos
import UIKit

@MainActor
final class ExportManager {
    static let shared = ExportManager()

    private init() {}

    lazy var ciContext: CIContext = {
        let options: [CIContextOption: Any] = [
            .workingColorSpace: CGColorSpace(name: CGColorSpace.linearSRGB)!,
            .outputColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
            .useSoftwareRenderer: false
        ]
        return CIContext(options: options)
    }()

    enum ExportFormat: String, CaseIterable {
        case jpeg = "JPEG"
        case png = "PNG"
        case heic = "HEIC"
        case dng = "DNG (RAW)"

        var uti: String {
            switch self {
            case .jpeg: return "public.jpeg"
            case .png: return "public.png"
            case .heic: return "public.heic"
            case .dng: return "com.adobe.raw-image"
            }
        }

        var fileExtension: String {
            switch self {
            case .jpeg: return "jpg"
            case .png: return "png"
            case .heic: return "heic"
            case .dng: return "dng"
            }
        }

        var isProOnly: Bool {
            switch self {
            case .dng, .heic: return true
            default: return false
            }
        }
    }

    enum ExportError: LocalizedError {
        case noRawDataAvailable
        case invalidDNGData
        case unknownImageType
        case failedToCreateDestination
        case failedToFinalize
        case unsupportedFormat

        var errorDescription: String? {
            switch self {
            case .noRawDataAvailable:
                return "No RAW data available for export. Ensure you captured in RAW mode."
            case .invalidDNGData:
                return "The DNG data is corrupted or invalid."
            case .unknownImageType:
                return "Unknown image type."
            case .failedToCreateDestination:
                return "Failed to create export destination."
            case .failedToFinalize:
                return "Failed to finalize export."
            case .unsupportedFormat:
                return "This export format is not supported."
            }
        }
    }

    func exportImage(
        _ image: CIImage,
        context: CIContext,
        isPro: Bool,
        format: ExportFormat,
        addWatermark: Bool
    ) async throws -> Data {
        guard let cgImage = context.createCGImage(image, from: image.extent) else {
            throw ProcessingError.exportFailed("Unable to render output image")
        }

        var uiImage = UIImage(cgImage: cgImage)

        if !isPro {
            uiImage = ResolutionLimiter.limitResolution(of: uiImage)
        }

        if addWatermark {
            uiImage = WatermarkRenderer.addWatermark(to: uiImage)
        }

        switch format {
        case .jpeg, .heic:
            guard let data = uiImage.jpegData(compressionQuality: 0.95) else {
                throw ProcessingError.exportFailed("Unable to encode JPEG data")
            }
            return data
        case .png:
            guard let data = uiImage.pngData() else {
                throw ProcessingError.exportFailed("Unable to encode PNG data")
            }
            return data
        case .dng:
            // DNG export requires raw data, handled by exportDNG method
            throw ExportError.unsupportedFormat
        }
    }

    func exportToPhotos(
        _ image: CIImage,
        context: CIContext,
        isPro: Bool
    ) async throws {
        let data = try await exportImage(
            image,
            context: context,
            isPro: isPro,
            format: .jpeg,
            addWatermark: !isPro
        )

        guard let uiImage = UIImage(data: data) else {
            throw ProcessingError.exportFailed("Unable to decode exported image")
        }

        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        if status == .notDetermined {
            _ = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        }

        try await PHPhotoLibrary.shared().performChanges {
            PHAssetChangeRequest.creationRequestForAsset(from: uiImage)
        }
    }

    // MARK: - DNG/RAW Export

    /// Export RAW DNG file with metadata
    /// - Parameters:
    ///   - rawData: The raw DNG data from capture
    ///   - metadata: Image metadata to embed
    ///   - includeMetadata: Whether to embed EXIF/IPTC metadata
    /// - Returns: DNG file data with metadata
    /// - Throws: ExportError if metadata write fails
    func exportDNG(
        rawData: Data,
        metadata: ImageMetadata,
        includeMetadata: Bool = true
    ) async throws -> Data {
        // If no metadata needed, return raw DNG directly
        guard includeMetadata else {
            return rawData
        }

        // Otherwise, write EXIF/IPTC metadata to DNG
        return try writeMetadataToDNG(rawData, metadata: metadata)
    }

    /// Write EXIF and IPTC metadata to DNG file
    private func writeMetadataToDNG(
        _ dngData: Data,
        metadata: ImageMetadata
    ) throws -> Data {
        // Create image source from DNG data
        guard let source = CGImageSourceCreateWithData(dngData as CFData, nil) else {
            throw ExportError.invalidDNGData
        }

        guard let uti = CGImageSourceGetType(source) else {
            throw ExportError.unknownImageType
        }

        // Create mutable data for output
        let mutableData = NSMutableData(data: dngData)

        guard let destination = CGImageDestinationCreateWithData(
            mutableData,
            uti,
            1,
            nil
        ) else {
            throw ExportError.failedToCreateDestination
        }

        // Get existing properties
        var properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] ?? [:]

        // Build EXIF dictionary
        var exifDict = properties[kCGImagePropertyExifDictionary] as? [CFString: Any] ?? [:]

        // ISO speed rating
        if let iso = metadata.iso {
            exifDict[kCGImagePropertyExifISOSpeedRatings] = [Int(iso)]
        }

        // Exposure time
        if let exposureTime = metadata.exposureTime {
            exifDict[kCGImagePropertyExifExposureTime] = exposureTime
        }

        // Aperture (f-number)
        if let aperture = metadata.aperture {
            exifDict[kCGImagePropertyExifFNumber] = aperture
        }

        // Focal length
        if let focalLength = metadata.focalLength {
            exifDict[kCGImagePropertyExifFocalLength] = focalLength
        }

        // Lens make and model
        exifDict[kCGImagePropertyExifLensMake] = "Apple"
        exifDict[kCGImagePropertyExifLensModel] = "iPhone Camera"

        properties[kCGImagePropertyExifDictionary] = exifDict

        // Build TIFF dictionary
        var tiffDict = properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any] ?? [:]
        tiffDict[kCGImagePropertyTIFFMake] = "Apple"
        tiffDict[kCGImagePropertyTIFFModel] = "iPhone"
        tiffDict[kCGImagePropertyTIFFSoftware] = "Analog Intelligence"

        // Add dimensions if available
        if let width = metadata.originalWidth, let height = metadata.originalHeight {
            tiffDict[kCGImagePropertyPixelWidth] = width
            tiffDict[kCGImagePropertyPixelHeight] = height
        }

        properties[kCGImagePropertyTIFFDictionary] = tiffDict

        // Build IPTC dictionary (copyright, photographer, etc.)
        var iptcDict = properties[kCGImagePropertyIPTCDictionary] as? [CFString: Any] ?? [:]

        iptcDict[kCGImagePropertyIPTCCopyrightNotice] = "Scanned with Analog Intelligence"
        iptcDict[kCGImagePropertyIPTCSource] = "Film scan"

        let keywords = ["film", "analog", "negative scan"]
        iptcDict[kCGImagePropertyIPTCKeywords] = keywords

        properties[kCGImagePropertyIPTCDictionary] = iptcDict

        // Write image with updated metadata
        CGImageDestinationAddImageFromSource(
            destination,
            source,
            0,
            properties as CFDictionary
        )

        guard CGImageDestinationFinalize(destination) else {
            throw ExportError.failedToFinalize
        }

        return mutableData as Data
    }
}
