//
//  ImageProcessor.swift
//  AnalogIntelligence
//
//  Main pipeline coordinator for negative scanning and image processing.
//  Orchestrates the entire conversion pipeline from negative to positive image.
//

import Foundation
import CoreImage
import UIKit
import Accelerate

/// Main coordinator for the image processing pipeline
@MainActor
class ImageProcessor: ObservableObject {

    // MARK: - Published Properties

    @Published var isProcessing = false
    @Published var processingProgress: Double = 0.0
    @Published var currentStep: ProcessingStep = .idle

    // MARK: - Pipeline Components

    private let negativeInverter = NegativeInverter()
    private let orangeMaskEstimator = OrangeMaskEstimator()
    private let colorCorrector = ColorCorrector()
    private let userAdjustments = UserAdjustments()
    private let exportManager = ExportManager()

    // MARK: - Core Image Context

    private let ciContext: CIContext = {
        let options: [CIContextOption: Any] = [
            .workingColorSpace: CGColorSpace(name: CGColorSpace.linearSRGB)!,
            .outputColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
            .useSoftwareRenderer: false
        ]
        return CIContext(options: options)
    }()

    // MARK: - Processing Steps

    enum ProcessingStep: String {
        case idle = "Idle"
        case cropping = "Cropping and Perspective Correction"
        case linearizing = "Converting to Linear RGB"
        case inverting = "Inverting Negative"
        case orangeMask = "Removing Orange Mask"
        case normalizing = "Normalizing Color Channels"
        case toneCorrection = "Applying Tone Correction"
        case userAdjustments = "Applying User Adjustments"
        case sharpening = "Sharpening"
        case exporting = "Exporting"
        case complete = "Complete"
    }

    // MARK: - Processing Configuration

    struct ProcessingConfig {
        var cropRect: CGRect?
        var perspectiveCorrection: [CGPoint]? // Four corners for perspective transform
        var filmType: FilmType = .colorNegative
        var autoOrangeMask: Bool = true
        var autoColorCorrection: Bool = true
        var sharpenAmount: Float = 0.5
    }

    enum FilmType {
        case colorNegative
        case blackAndWhite
        case slide // For future support
    }

    // MARK: - Main Processing Pipeline

    /// Process a captured negative image through the complete pipeline
    /// - Parameters:
    ///   - inputImage: The raw captured negative image
    ///   - config: Processing configuration options
    ///   - adjustments: User adjustment parameters
    ///   - isPro: Whether user has Pro subscription (affects export quality)
    /// - Returns: Processed positive image
    func processNegative(
        inputImage: CIImage,
        config: ProcessingConfig,
        adjustments: UserAdjustments.Parameters = UserAdjustments.Parameters(),
        isPro: Bool = false
    ) async throws -> CIImage {

        isProcessing = true
        processingProgress = 0.0

        defer {
            isProcessing = false
            currentStep = .complete
        }

        var processedImage = inputImage

        // Step 1: Crop and Perspective Correction
        currentStep = .cropping
        processedImage = try await applyCropAndPerspective(
            image: processedImage,
            cropRect: config.cropRect,
            perspectivePoints: config.perspectiveCorrection
        )
        processingProgress = 0.1

        // Step 2: Convert to Linear RGB
        currentStep = .linearizing
        processedImage = convertToLinearRGB(image: processedImage)
        processingProgress = 0.2

        // Step 3: Invert Negative
        currentStep = .inverting
        processedImage = try await negativeInverter.invertNegative(
            image: processedImage,
            filmType: config.filmType
        )
        processingProgress = 0.35

        // Step 4: Estimate and Remove Orange Mask (for color film)
        if config.filmType == .colorNegative && config.autoOrangeMask {
            currentStep = .orangeMask
            processedImage = try await orangeMaskEstimator.removeOrangeMask(
                image: processedImage,
                context: ciContext
            )
            processingProgress = 0.5
        }

        // Step 5: Normalize Color Channels
        if config.autoColorCorrection {
            currentStep = .normalizing
            processedImage = try await colorCorrector.normalizeChannels(
                image: processedImage,
                context: ciContext
            )
            processingProgress = 0.65
        }

        // Step 6: Apply Tone Correction
        currentStep = .toneCorrection
        processedImage = try await colorCorrector.applyToneCorrection(
            image: processedImage,
            context: ciContext
        )
        processingProgress = 0.75

        // Step 7: Apply User Adjustments
        currentStep = .userAdjustments
        processedImage = userAdjustments.applyAdjustments(
            image: processedImage,
            parameters: adjustments
        )
        processingProgress = 0.85

        // Step 8: Sharpen
        currentStep = .sharpening
        processedImage = applySharpen(
            image: processedImage,
            amount: config.sharpenAmount
        )
        processingProgress = 0.95

        // Convert back to sRGB for display/export
        processedImage = convertToSRGB(image: processedImage)

        processingProgress = 1.0

        return processedImage
    }

    // MARK: - Pipeline Steps Implementation

    /// Apply crop and perspective correction
    private func applyCropAndPerspective(
        image: CIImage,
        cropRect: CGRect?,
        perspectivePoints: [CGPoint]?
    ) async throws -> CIImage {

        var result = image

        // Apply perspective correction if points provided
        if let points = perspectivePoints, points.count == 4 {
            let perspectiveFilter = CIFilter(name: "CIPerspectiveCorrection")!
            perspectiveFilter.setValue(result, forKey: kCIInputImageKey)
            perspectiveFilter.setValue(CIVector(cgPoint: points[0]), forKey: "inputTopLeft")
            perspectiveFilter.setValue(CIVector(cgPoint: points[1]), forKey: "inputTopRight")
            perspectiveFilter.setValue(CIVector(cgPoint: points[2]), forKey: "inputBottomLeft")
            perspectiveFilter.setValue(CIVector(cgPoint: points[3]), forKey: "inputBottomRight")

            if let output = perspectiveFilter.outputImage {
                result = output
            }
        }

        // Apply crop if specified
        if let crop = cropRect {
            result = result.cropped(to: crop)
        }

        return result
    }

    /// Convert image to linear RGB color space for accurate processing
    private func convertToLinearRGB(image: CIImage) -> CIImage {
        let filter = CIFilter(name: "CILinearToSRGBToneCurve")!
        filter.setValue(image, forKey: kCIInputImageKey)
        return filter.outputImage ?? image
    }

    /// Convert image back to sRGB color space for display
    private func convertToSRGB(image: CIImage) -> CIImage {
        let filter = CIFilter(name: "CISRGBToneCurveToLinear")!
        filter.setValue(image, forKey: kCIInputImageKey)
        return filter.outputImage ?? image
    }

    /// Apply sharpening to the final image
    private func applySharpen(image: CIImage, amount: Float) -> CIImage {
        guard amount > 0 else { return image }

        let filter = CIFilter(name: "CISharpenLuminance")!
        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(amount, forKey: kCIInputSharpnessKey)

        return filter.outputImage ?? image
    }

    // MARK: - Export

    /// Export processed image with tier-based quality
    func exportImage(
        _ image: CIImage,
        isPro: Bool,
        format: ExportManager.ExportFormat = .jpeg,
        addWatermark: Bool = true
    ) async throws -> Data {

        currentStep = .exporting

        return try await exportManager.exportImage(
            image,
            context: ciContext,
            isPro: isPro,
            format: format,
            addWatermark: !isPro && addWatermark
        )
    }

    /// Export to Photos library
    func exportToPhotos(
        _ image: CIImage,
        isPro: Bool
    ) async throws {
        try await exportManager.exportToPhotos(
            image,
            context: ciContext,
            isPro: isPro
        )
    }

    // MARK: - Convenience Methods

    /// Quick preview processing (lower quality for real-time preview)
    func processPreview(
        inputImage: CIImage,
        adjustments: UserAdjustments.Parameters
    ) -> CIImage {
        // Apply only user adjustments for preview
        return userAdjustments.applyAdjustments(
            image: inputImage,
            parameters: adjustments
        )
    }

    /// Cancel current processing
    func cancelProcessing() {
        isProcessing = false
        currentStep = .idle
        processingProgress = 0.0
    }
}

// MARK: - Processing Error

enum ProcessingError: LocalizedError {
    case invalidInput
    case processingFailed(String)
    case exportFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidInput:
            return "Invalid input image"
        case .processingFailed(let reason):
            return "Processing failed: \(reason)"
        case .exportFailed(let reason):
            return "Export failed: \(reason)"
        }
    }
}
