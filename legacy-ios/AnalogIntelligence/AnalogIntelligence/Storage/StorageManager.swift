//
//  StorageManager.swift
//  AnalogIntelligence
//
//  Created by Analog Intelligence
//

import UIKit
import Combine

class StorageManager: ObservableObject {
    static let shared = StorageManager()

    @Published var images: [ScannedImage] = []

    private let fileManager = FileManager.default
    private let documentsDirectory: URL

    private init() {
        documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        loadImages()
    }

    /// Save a processed image
    func saveImage(_ image: UIImage, metadata: ImageMetadata? = nil) {
        let imageId = UUID()
        let scannedImage = ScannedImage(
            id: imageId,
            captureDate: Date(),
            metadata: metadata
        )

        // Save full resolution image
        if let imageData = image.jpegData(compressionQuality: 0.9) {
            let imageURL = documentsDirectory.appendingPathComponent("\(imageId.uuidString).jpg")
            try? imageData.write(to: imageURL)
        }

        // Generate and save thumbnail
        if let thumbnail = generateThumbnail(from: image) {
            if let thumbnailData = thumbnail.jpegData(compressionQuality: 0.8) {
                let thumbnailURL = documentsDirectory.appendingPathComponent("\(imageId.uuidString)_thumb.jpg")
                try? thumbnailData.write(to: thumbnailURL)
            }
        }

        // Save metadata
        saveMetadata(scannedImage)

        // Add to images array
        DispatchQueue.main.async {
            self.images.append(scannedImage)
        }
    }

    /// Delete an image
    func deleteImage(_ image: ScannedImage) {
        // Delete files
        let imageURL = documentsDirectory.appendingPathComponent("\(image.id.uuidString).jpg")
        let thumbnailURL = documentsDirectory.appendingPathComponent("\(image.id.uuidString)_thumb.jpg")
        let metadataURL = documentsDirectory.appendingPathComponent("\(image.id.uuidString).json")

        try? fileManager.removeItem(at: imageURL)
        try? fileManager.removeItem(at: thumbnailURL)
        try? fileManager.removeItem(at: metadataURL)

        // Remove from array
        DispatchQueue.main.async {
            self.images.removeAll { $0.id == image.id }
        }
    }

    /// Delete multiple images
    func deleteImages(_ imagesToDelete: [ScannedImage]) {
        for image in imagesToDelete {
            deleteImage(image)
        }
    }

    /// Load image data
    func loadImageData(for image: ScannedImage) -> UIImage? {
        let imageURL = documentsDirectory.appendingPathComponent("\(image.id.uuidString).jpg")
        guard let imageData = try? Data(contentsOf: imageURL) else { return nil }
        return UIImage(data: imageData)
    }

    /// Export image to Photos library
    func exportToPhotos(_ image: ScannedImage, completion: @escaping (Bool, Error?) -> Void) {
        guard let uiImage = loadImageData(for: image) else {
            completion(false, NSError(domain: "StorageManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to load image"]))
            return
        }

        UIImageWriteToSavedPhotosAlbum(uiImage, nil, nil, nil)
        completion(true, nil)
    }

    // MARK: - Private Methods

    private func loadImages() {
        // Load all metadata files
        let metadataFiles = try? fileManager.contentsOfDirectory(at: documentsDirectory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }

        guard let metadataFiles = metadataFiles else { return }

        var loadedImages: [ScannedImage] = []

        for metadataURL in metadataFiles {
            if let data = try? Data(contentsOf: metadataURL),
               let scannedImage = try? JSONDecoder().decode(ScannedImage.self, from: data) {
                loadedImages.append(scannedImage)
            }
        }

        // Sort by capture date (newest first)
        loadedImages.sort { $0.captureDate > $1.captureDate }

        DispatchQueue.main.async {
            self.images = loadedImages
        }
    }

    private func saveMetadata(_ image: ScannedImage) {
        let metadataURL = documentsDirectory.appendingPathComponent("\(image.id.uuidString).json")
        if let data = try? JSONEncoder().encode(image) {
            try? data.write(to: metadataURL)
        }
    }

    private func generateThumbnail(from image: UIImage, size: CGSize = CGSize(width: 200, height: 200)) -> UIImage? {
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}
