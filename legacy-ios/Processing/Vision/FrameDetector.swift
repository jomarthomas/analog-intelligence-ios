//
//  FrameDetector.swift
//  Analog Intelligence
//
//  Automatic film frame detection using Vision framework
//

import Foundation
import CoreImage
import Vision

/// Detects film frame boundaries using rectangle detection
class FrameDetector {
    private let minimumAspectRatio: Float = 0.6   // ~2:3 for 35mm
    private let maximumAspectRatio: Float = 0.7
    private let minimumSize: Float = 0.3           // At least 30% of image
    private let minimumConfidence: Float = 0.7     // 70% confidence threshold

    /// Detect film frame rectangle in captured image
    /// - Parameter image: The captured image (negative or positive)
    /// - Returns: Rectangle observation if detected, nil otherwise
    func detectFilmFrame(in image: CIImage) async throws -> VNRectangleObservation? {
        let request = VNDetectRectanglesRequest()

        // Configure for film frames
        request.minimumAspectRatio = VNAspectRatio(minimumAspectRatio)
        request.maximumAspectRatio = VNAspectRatio(maximumAspectRatio)
        request.minimumSize = minimumSize
        request.minimumConfidence = VNConfidence(minimumConfidence)
        request.maximumObservations = 1  // We only want the most prominent rectangle

        let handler = VNImageRequestHandler(ciImage: image, options: [:])

        try await handler.perform([request])

        return request.results?.first
    }

    /// Detect multiple frames in a contact sheet or flatbed scan
    /// - Parameter image: The captured image containing multiple frames
    /// - Returns: Array of rectangle observations
    func detectMultipleFrames(in image: CIImage) async throws -> [VNRectangleObservation] {
        let request = VNDetectRectanglesRequest()

        // Same configuration as single frame
        request.minimumAspectRatio = VNAspectRatio(minimumAspectRatio)
        request.maximumAspectRatio = VNAspectRatio(maximumAspectRatio)
        request.minimumSize = minimumSize
        request.minimumConfidence = VNConfidence(minimumConfidence)
        request.maximumObservations = 36  // Max for 35mm roll

        let handler = VNImageRequestHandler(ciImage: image, options: [:])

        try await handler.perform([request])

        return request.results ?? []
    }

    /// Convert Vision normalized coordinates to image coordinates
    /// - Parameters:
    ///   - observation: The rectangle observation from Vision
    ///   - imageSize: The size of the original image
    /// - Returns: Array of 4 corner points in image coordinates (TL, TR, BR, BL)
    func convertToImageCoordinates(
        _ observation: VNRectangleObservation,
        imageSize: CGSize
    ) -> [CGPoint] {
        // Vision uses normalized coordinates (0-1) with origin at bottom-left
        // We need to convert to image coordinates with origin at top-left

        return [
            // Top-left
            CGPoint(
                x: observation.topLeft.x * imageSize.width,
                y: (1 - observation.topLeft.y) * imageSize.height
            ),
            // Top-right
            CGPoint(
                x: observation.topRight.x * imageSize.width,
                y: (1 - observation.topRight.y) * imageSize.height
            ),
            // Bottom-right
            CGPoint(
                x: observation.bottomRight.x * imageSize.width,
                y: (1 - observation.bottomRight.y) * imageSize.height
            ),
            // Bottom-left
            CGPoint(
                x: observation.bottomLeft.x * imageSize.width,
                y: (1 - observation.bottomLeft.y) * imageSize.height
            )
        ]
    }

    /// Get bounding rectangle from observation
    /// - Parameters:
    ///   - observation: The rectangle observation
    ///   - imageSize: The size of the original image
    /// - Returns: CGRect in image coordinates
    func getBoundingRect(
        _ observation: VNRectangleObservation,
        imageSize: CGSize
    ) -> CGRect {
        let boundingBox = observation.boundingBox

        return CGRect(
            x: boundingBox.origin.x * imageSize.width,
            y: (1 - boundingBox.origin.y - boundingBox.height) * imageSize.height,
            width: boundingBox.width * imageSize.width,
            height: boundingBox.height * imageSize.height
        )
    }
}

// MARK: - Sprocket Hole Detection

extension FrameDetector {
    /// Detect sprocket holes to identify frame boundaries (advanced)
    /// - Parameter image: The captured image
    /// - Returns: Array of detected sprocket hole locations
    func detectSprocketHoles(in image: CIImage) async throws -> [CGRect] {
        // Use VNDetectRectanglesRequest with different parameters for sprocket holes
        let request = VNDetectRectanglesRequest()

        // Sprocket holes are small rectangles with specific aspect ratio
        request.minimumAspectRatio = 0.4  // Roughly square
        request.maximumAspectRatio = 0.6
        request.minimumSize = 0.005       // Very small (0.5% of image)
        request.minimumConfidence = 0.5
        request.maximumObservations = 100  // Can be many sprocket holes

        let handler = VNImageRequestHandler(ciImage: image, options: [:])

        try await handler.perform([request])

        guard let results = request.results else { return [] }

        // Convert to image coordinates
        return results.map { observation in
            getBoundingRect(observation, imageSize: image.extent.size)
        }
    }

    /// Infer frame boundaries from sprocket hole pattern
    /// - Parameter sprocketHoles: Array of detected sprocket hole rectangles
    /// - Returns: Inferred frame boundaries
    func inferFrameBoundaries(from sprocketHoles: [CGRect]) -> [CGRect] {
        // Algorithm:
        // 1. Sort sprocket holes by X position (horizontal film strip)
        // 2. Group holes into vertical columns (each column = one frame side)
        // 3. Calculate frame boundaries between columns

        guard sprocketHoles.count >= 4 else { return [] }

        // Sort by X position
        let sortedHoles = sprocketHoles.sorted { $0.minX < $1.minX }

        // Group into columns (simplified - production would use clustering)
        var columns: [[CGRect]] = []
        var currentColumn: [CGRect] = [sortedHoles[0]]
        let columnThreshold: CGFloat = 50  // Pixels

        for hole in sortedHoles.dropFirst() {
            if let lastHole = currentColumn.last {
                if abs(hole.minX - lastHole.minX) < columnThreshold {
                    currentColumn.append(hole)
                } else {
                    columns.append(currentColumn)
                    currentColumn = [hole]
                }
            }
        }
        columns.append(currentColumn)

        // Calculate frame boundaries between columns
        var frames: [CGRect] = []

        for i in 0..<(columns.count - 1) {
            let leftColumn = columns[i]
            let rightColumn = columns[i + 1]

            // Frame boundary is between the two columns
            guard let leftX = leftColumn.map({ $0.maxX }).max(),
                  let rightX = rightColumn.map({ $0.minX }).min(),
                  let topY = leftColumn.map({ $0.minY }).min(),
                  let bottomY = leftColumn.map({ $0.maxY }).max() else {
                continue
            }

            let frame = CGRect(
                x: leftX,
                y: topY,
                width: rightX - leftX,
                height: bottomY - topY
            )

            frames.append(frame)
        }

        return frames
    }
}

// MARK: - Quality Assessment

extension FrameDetector {
    /// Assess detection quality
    struct DetectionQuality {
        var confidence: Float
        var aspectRatioScore: Float  // How close to expected 2:3
        var sizeScore: Float          // How much of image is covered
        var overallScore: Float       // Combined score

        var isGoodQuality: Bool {
            overallScore > 0.7
        }

        var qualityDescription: String {
            if overallScore > 0.9 {
                return "Excellent"
            } else if overallScore > 0.7 {
                return "Good"
            } else if overallScore > 0.5 {
                return "Fair"
            } else {
                return "Poor"
            }
        }
    }

    func assessQuality(_ observation: VNRectangleObservation) -> DetectionQuality {
        let confidence = observation.confidence

        // Calculate aspect ratio score (how close to ideal 2:3 = 0.667)
        let idealAspectRatio: Float = 2.0 / 3.0
        let actualAspectRatio = Float(observation.boundingBox.width / observation.boundingBox.height)
        let aspectRatioError = abs(actualAspectRatio - idealAspectRatio) / idealAspectRatio
        let aspectRatioScore = max(0, 1.0 - aspectRatioError * 2)  // Penalize deviation

        // Calculate size score (larger frames are more likely to be correct)
        let area = Float(observation.boundingBox.width * observation.boundingBox.height)
        let sizeScore = min(1.0, area / 0.5)  // Max score when frame covers 50%+ of image

        // Combined score (weighted average)
        let overallScore = (confidence * 0.4 + aspectRatioScore * 0.4 + sizeScore * 0.2)

        return DetectionQuality(
            confidence: confidence,
            aspectRatioScore: aspectRatioScore,
            sizeScore: sizeScore,
            overallScore: overallScore
        )
    }
}

// MARK: - User Feedback

extension FrameDetector {
    /// Generate user-friendly feedback for detected frame
    /// - Parameters:
    ///   - observation: The detected rectangle
    ///   - imageSize: The image size
    /// - Returns: Feedback message and suggested action
    func generateFeedback(
        for observation: VNRectangleObservation,
        imageSize: CGSize
    ) -> (message: String, action: SuggestedAction) {
        let quality = assessQuality(observation)

        if quality.overallScore > 0.9 {
            return ("Frame detected successfully! Tap capture to scan.", .capture)
        } else if quality.overallScore > 0.7 {
            return ("Frame detected. Adjust alignment for best results.", .adjustAlignment)
        } else if quality.aspectRatioScore < 0.5 {
            return ("Frame shape doesn't match expected ratio. Rotate or reposition.", .reposition)
        } else if quality.sizeScore < 0.3 {
            return ("Frame too small. Move closer to the film.", .moveCloser)
        } else {
            return ("Having trouble detecting the frame. Try manual alignment.", .useManual)
        }
    }

    enum SuggestedAction {
        case capture
        case adjustAlignment
        case reposition
        case moveCloser
        case useManual
    }
}

// MARK: - Persistence & Learning

extension FrameDetector {
    /// Save user correction for future improvement
    /// - Parameters:
    ///   - detectedCorners: What the detector found
    ///   - correctedCorners: What the user manually set
    ///   - filmStock: Type of film (for pattern learning)
    func saveUserCorrection(
        detectedCorners: [CGPoint]?,
        correctedCorners: [CGPoint],
        filmStock: String?
    ) {
        // In production, this would save to CoreData or CloudKit
        // to improve detection over time using machine learning

        let correction = FrameDetectionCorrection(
            id: UUID(),
            timestamp: Date(),
            detectedCorners: detectedCorners,
            correctedCorners: correctedCorners,
            filmStock: filmStock
        )

        // Save to user defaults (simple implementation)
        // Production would use CoreData with proper schema
        UserDefaults.standard.set(correction.asJSON(), forKey: "frameCorrections")
    }
}

// MARK: - Supporting Types

struct FrameDetectionCorrection: Codable {
    var id: UUID
    var timestamp: Date
    var detectedCorners: [CGPoint]?
    var correctedCorners: [CGPoint]
    var filmStock: String?

    func asJSON() -> Data? {
        try? JSONEncoder().encode(self)
    }

    static func fromJSON(_ data: Data) -> FrameDetectionCorrection? {
        try? JSONDecoder().decode(FrameDetectionCorrection.self, from: data)
    }
}

extension CGPoint: Codable {
    enum CodingKeys: String, CodingKey {
        case x, y
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(x, forKey: .x)
        try container.encode(y, forKey: .y)
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let x = try container.decode(CGFloat.self, forKey: .x)
        let y = try container.decode(CGFloat.self, forKey: .y)
        self.init(x: x, y: y)
    }
}
