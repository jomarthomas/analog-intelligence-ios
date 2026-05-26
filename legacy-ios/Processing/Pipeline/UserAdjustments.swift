//
//  UserAdjustments.swift
//  AnalogIntelligence
//
//  Handles user-controlled adjustments (exposure, warmth, contrast).
//  Provides real-time preview of adjustments via sliders.
//

import Foundation
import CoreImage
import SwiftUI

/// User-controlled image adjustments
class UserAdjustments: ObservableObject {

    // MARK: - Adjustment Parameters

    struct Parameters: Equatable {
        var exposure: Float = 0.0        // Range: -2.0 to +2.0 EV
        var warmth: Float = 0.0          // Range: -1.0 (cool) to +1.0 (warm)
        var contrast: Float = 0.0        // Range: -1.0 to +1.0
        var saturation: Float = 0.0      // Range: -1.0 to +1.0
        var highlights: Float = 0.0      // Range: -1.0 to +1.0
        var shadows: Float = 0.0         // Range: -1.0 to +1.0
        var vibrance: Float = 0.0        // Range: -1.0 to +1.0

        /// Reset all parameters to defaults
        mutating func reset() {
            exposure = 0.0
            warmth = 0.0
            contrast = 0.0
            saturation = 0.0
            highlights = 0.0
            shadows = 0.0
            vibrance = 0.0
        }

        /// Check if parameters are at default values
        var isDefault: Bool {
            return exposure == 0.0 &&
                   warmth == 0.0 &&
                   contrast == 0.0 &&
                   saturation == 0.0 &&
                   highlights == 0.0 &&
                   shadows == 0.0 &&
                   vibrance == 0.0
        }
    }

    // MARK: - Published Properties

    @Published var currentParameters = Parameters()

    // MARK: - Apply Adjustments

    /// Apply all user adjustments to an image
    /// - Parameters:
    ///   - image: Input image
    ///   - parameters: Adjustment parameters
    /// - Returns: Adjusted image
    func applyAdjustments(
        image: CIImage,
        parameters: Parameters
    ) -> CIImage {

        var result = image

        // Apply adjustments in optimal order for best quality

        // 1. Exposure (affects overall brightness)
        if parameters.exposure != 0.0 {
            result = applyExposure(image: result, value: parameters.exposure)
        }

        // 2. Highlights and Shadows (tonal adjustments)
        if parameters.highlights != 0.0 || parameters.shadows != 0.0 {
            result = applyHighlightsShadows(
                image: result,
                highlights: parameters.highlights,
                shadows: parameters.shadows
            )
        }

        // 3. Contrast
        if parameters.contrast != 0.0 {
            result = applyContrast(image: result, value: parameters.contrast)
        }

        // 4. Temperature/Warmth
        if parameters.warmth != 0.0 {
            result = applyWarmth(image: result, value: parameters.warmth)
        }

        // 5. Saturation
        if parameters.saturation != 0.0 {
            result = applySaturation(image: result, value: parameters.saturation)
        }

        // 6. Vibrance (selective saturation)
        if parameters.vibrance != 0.0 {
            result = applyVibrance(image: result, value: parameters.vibrance)
        }

        return result
    }

    // MARK: - Individual Adjustment Filters

    /// Apply exposure adjustment
    private func applyExposure(image: CIImage, value: Float) -> CIImage {
        guard let filter = CIFilter(name: "CIExposureAdjust") else {
            return image
        }

        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(value, forKey: kCIInputEVKey)

        return filter.outputImage ?? image
    }

    /// Apply contrast adjustment
    private func applyContrast(image: CIImage, value: Float) -> CIImage {
        guard let filter = CIFilter(name: "CIColorControls") else {
            return image
        }

        // Map -1...+1 to 0.5...1.5 for contrast
        let contrast = 1.0 + value

        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(contrast, forKey: kCIInputContrastKey)

        return filter.outputImage ?? image
    }

    /// Apply warmth/temperature adjustment
    private func applyWarmth(image: CIImage, value: Float) -> CIImage {
        guard let filter = CIFilter(name: "CITemperatureAndTint") else {
            return image
        }

        // Map warmth to temperature
        // Positive = warmer (more orange/yellow)
        // Negative = cooler (more blue)
        let temperature = 6500 + (value * 2000) // 4500K to 8500K

        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(CIVector(x: CGFloat(temperature), y: 0), forKey: "inputNeutral")
        filter.setValue(CIVector(x: 6500, y: 0), forKey: "inputTargetNeutral")

        return filter.outputImage ?? image
    }

    /// Apply saturation adjustment
    private func applySaturation(image: CIImage, value: Float) -> CIImage {
        guard let filter = CIFilter(name: "CIColorControls") else {
            return image
        }

        // Map -1...+1 to 0...2 for saturation
        let saturation = 1.0 + value

        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(saturation, forKey: kCIInputSaturationKey)

        return filter.outputImage ?? image
    }

    /// Apply vibrance adjustment (selective saturation boost)
    private func applyVibrance(image: CIImage, value: Float) -> CIImage {
        guard let filter = CIFilter(name: "CIVibrance") else {
            return image
        }

        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(value, forKey: "inputAmount")

        return filter.outputImage ?? image
    }

    /// Apply highlights and shadows adjustment
    private func applyHighlightsShadows(
        image: CIImage,
        highlights: Float,
        shadows: Float
    ) -> CIImage {
        guard let filter = CIFilter(name: "CIHighlightShadowAdjust") else {
            return image
        }

        // Map -1...+1 to adjustment range
        // Negative values brighten highlights/shadows
        // Positive values darken highlights/shadows
        let highlightAmount = 1.0 - highlights
        let shadowAmount = shadows

        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(highlightAmount, forKey: "inputHighlightAmount")
        filter.setValue(shadowAmount, forKey: "inputShadowAmount")

        return filter.outputImage ?? image
    }

    // MARK: - Preset Adjustments

    /// Predefined adjustment presets
    enum Preset: String, CaseIterable, Identifiable {
        case none = "None"
        case bright = "Bright"
        case warm = "Warm"
        case cool = "Cool"
        case punchy = "Punchy"
        case vintage = "Vintage"
        case muted = "Muted"

        var id: String { rawValue }

        /// Get parameters for this preset
        var parameters: Parameters {
            switch self {
            case .none:
                return Parameters()

            case .bright:
                return Parameters(
                    exposure: 0.3,
                    contrast: -0.1,
                    shadows: 0.2
                )

            case .warm:
                return Parameters(
                    warmth: 0.4,
                    saturation: 0.1,
                    highlights: -0.1
                )

            case .cool:
                return Parameters(
                    warmth: -0.4,
                    saturation: 0.1,
                    vibrance: 0.2
                )

            case .punchy:
                return Parameters(
                    contrast: 0.3,
                    saturation: 0.2,
                    vibrance: 0.3
                )

            case .vintage:
                return Parameters(
                    warmth: 0.3,
                    contrast: -0.2,
                    saturation: -0.2,
                    highlights: -0.2
                )

            case .muted:
                return Parameters(
                    contrast: -0.1,
                    saturation: -0.3,
                    vibrance: -0.2
                )
            }
        }
    }

    /// Apply a preset to current parameters
    func applyPreset(_ preset: Preset) {
        currentParameters = preset.parameters
    }

    // MARK: - Smart Auto Adjustments

    /// Automatically analyze image and suggest optimal adjustments
    func suggestAutoAdjustments(for image: CIImage, context: CIContext) -> Parameters {

        // Analyze image characteristics
        let analysis = analyzeImage(image: image, context: context)

        var params = Parameters()

        // Auto-exposure based on brightness
        if analysis.averageBrightness < 0.3 {
            params.exposure = 0.5 * (0.5 - analysis.averageBrightness)
        } else if analysis.averageBrightness > 0.7 {
            params.exposure = -0.3 * (analysis.averageBrightness - 0.5)
        }

        // Auto-contrast based on dynamic range
        if analysis.dynamicRange < 0.5 {
            params.contrast = 0.3
        }

        // Auto-saturation based on color richness
        if analysis.saturation < 0.4 {
            params.vibrance = 0.3
        }

        // Adjust highlights if clipping detected
        if analysis.highlightClipping > 0.05 {
            params.highlights = -0.4
        }

        // Adjust shadows if too dark
        if analysis.shadowClipping > 0.05 {
            params.shadows = 0.4
        }

        return params
    }

    /// Analyze image characteristics
    private func analyzeImage(image: CIImage, context: CIContext) -> ImageAnalysis {

        var analysis = ImageAnalysis()

        // Calculate average brightness using area average
        if let avgFilter = CIFilter(name: "CIAreaAverage") {
            avgFilter.setValue(image, forKey: kCIInputImageKey)
            avgFilter.setValue(CIVector(cgRect: image.extent), forKey: kCIInputExtentKey)

            if let avgOutput = avgFilter.outputImage {
                var bitmap = [UInt8](repeating: 0, count: 4)
                context.render(
                    avgOutput,
                    toBitmap: &bitmap,
                    rowBytes: 4,
                    bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
                    format: .RGBA8,
                    colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
                )

                let r = Float(bitmap[0]) / 255.0
                let g = Float(bitmap[1]) / 255.0
                let b = Float(bitmap[2]) / 255.0

                analysis.averageBrightness = 0.299 * r + 0.587 * g + 0.114 * b

                // Calculate saturation
                let max = Swift.max(r, g, b)
                let min = Swift.min(r, g, b)
                analysis.saturation = max > 0 ? (max - min) / max : 0
            }
        }

        // Analyze histogram for dynamic range and clipping
        if let histFilter = CIFilter(name: "CIAreaHistogram") {
            histFilter.setValue(image, forKey: kCIInputImageKey)
            histFilter.setValue(CIVector(cgRect: image.extent), forKey: "inputExtent")
            histFilter.setValue(256, forKey: "inputCount")

            if let histOutput = histFilter.outputImage {
                var histData = [UInt8](repeating: 0, count: 256 * 4)
                context.render(
                    histOutput,
                    toBitmap: &histData,
                    rowBytes: 256 * 4,
                    bounds: histOutput.extent,
                    format: .RGBA8,
                    colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
                )

                // Calculate clipping
                var totalPixels: Float = 0
                var shadowPixels: Float = 0
                var highlightPixels: Float = 0

                for bin in 0..<256 {
                    let count = Float(histData[bin * 4]) +
                                Float(histData[bin * 4 + 1]) +
                                Float(histData[bin * 4 + 2])
                    totalPixels += count

                    if bin < 5 {
                        shadowPixels += count
                    }
                    if bin > 250 {
                        highlightPixels += count
                    }
                }

                if totalPixels > 0 {
                    analysis.shadowClipping = shadowPixels / totalPixels
                    analysis.highlightClipping = highlightPixels / totalPixels
                }

                // Dynamic range
                var firstNonZero = 0
                var lastNonZero = 255

                for bin in 0..<256 {
                    let count = histData[bin * 4] + histData[bin * 4 + 1] + histData[bin * 4 + 2]
                    if count > 0 && firstNonZero == 0 {
                        firstNonZero = bin
                    }
                }

                for bin in stride(from: 255, through: 0, by: -1) {
                    let count = histData[bin * 4] + histData[bin * 4 + 1] + histData[bin * 4 + 2]
                    if count > 0 {
                        lastNonZero = bin
                        break
                    }
                }

                analysis.dynamicRange = Float(lastNonZero - firstNonZero) / 255.0
            }
        }

        return analysis
    }

    // MARK: - Supporting Types

    struct ImageAnalysis {
        var averageBrightness: Float = 0.5
        var saturation: Float = 0.5
        var dynamicRange: Float = 1.0
        var shadowClipping: Float = 0.0
        var highlightClipping: Float = 0.0
    }
}

// MARK: - SwiftUI Slider Helpers

extension UserAdjustments {

    /// Binding for exposure slider
    var exposureBinding: Binding<Double> {
        Binding(
            get: { Double(self.currentParameters.exposure) },
            set: { self.currentParameters.exposure = Float($0) }
        )
    }

    /// Binding for warmth slider
    var warmthBinding: Binding<Double> {
        Binding(
            get: { Double(self.currentParameters.warmth) },
            set: { self.currentParameters.warmth = Float($0) }
        )
    }

    /// Binding for contrast slider
    var contrastBinding: Binding<Double> {
        Binding(
            get: { Double(self.currentParameters.contrast) },
            set: { self.currentParameters.contrast = Float($0) }
        )
    }

    /// Binding for saturation slider
    var saturationBinding: Binding<Double> {
        Binding(
            get: { Double(self.currentParameters.saturation) },
            set: { self.currentParameters.saturation = Float($0) }
        )
    }
}
