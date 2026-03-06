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
    enum ExportFormat {
        case jpeg
        case png
        case heic
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
}
