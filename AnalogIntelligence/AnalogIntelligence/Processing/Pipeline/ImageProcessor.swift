//
//  ImageProcessor.swift
//  AnalogIntelligence
//
//  Created by Analog Intelligence
//

import UIKit
import CoreImage
import Accelerate

class ImageProcessor {
    private let context = CIContext()

    /// Process negative image through the complete pipeline
    func processNegative(_ image: UIImage) -> UIImage? {
        guard let ciImage = CIImage(image: image) else { return nil }

        // 1. Convert to linear RGB
        let linearImage = convertToLinearRGB(ciImage)

        // 2. Invert negative
        let invertedImage = invertNegative(linearImage)

        // 3. Estimate and remove orange mask
        let maskRemovedImage = removeOrangeMask(invertedImage)

        // 4. Normalize color channels
        let normalizedImage = normalizeColorChannels(maskRemovedImage)

        // 5. Apply tone correction
        let toneCorrectedImage = applyToneCorrection(normalizedImage)

        // 6. Sharpen
        let sharpenedImage = applySharpen(toneCorrectedImage)

        // Convert back to UIImage
        guard let cgImage = context.createCGImage(sharpenedImage, from: sharpenedImage.extent) else {
            return nil
        }

        return UIImage(cgImage: cgImage)
    }

    /// Apply manual adjustments (exposure, warmth, contrast)
    func applyAdjustments(to image: UIImage, exposure: Double, warmth: Double, contrast: Double) -> UIImage? {
        guard let ciImage = CIImage(image: image) else { return nil }

        var processedImage = ciImage

        // Apply exposure
        if exposure != 0 {
            if let filter = CIFilter(name: "CIExposureAdjust") {
                filter.setValue(processedImage, forKey: kCIInputImageKey)
                filter.setValue(exposure, forKey: kCIInputEVKey)
                if let output = filter.outputImage {
                    processedImage = output
                }
            }
        }

        // Apply warmth (temperature adjustment)
        if warmth != 0 {
            if let filter = CIFilter(name: "CITemperatureAndTint") {
                filter.setValue(processedImage, forKey: kCIInputImageKey)
                let temperature = CIVector(x: warmth * 6500, y: 0) // Scale warmth
                filter.setValue(temperature, forKey: "inputNeutral")
                if let output = filter.outputImage {
                    processedImage = output
                }
            }
        }

        // Apply contrast
        if contrast != 0 {
            if let filter = CIFilter(name: "CIColorControls") {
                filter.setValue(processedImage, forKey: kCIInputImageKey)
                filter.setValue(1.0 + contrast, forKey: kCIInputContrastKey)
                if let output = filter.outputImage {
                    processedImage = output
                }
            }
        }

        guard let cgImage = context.createCGImage(processedImage, from: processedImage.extent) else {
            return nil
        }

        return UIImage(cgImage: cgImage)
    }

    // MARK: - Private Processing Steps

    private func convertToLinearRGB(_ image: CIImage) -> CIImage {
        guard let filter = CIFilter(name: "CILinearToSRGBToneCurve") else { return image }
        filter.setValue(image, forKey: kCIInputImageKey)
        return filter.outputImage ?? image
    }

    private func invertNegative(_ image: CIImage) -> CIImage {
        guard let filter = CIFilter(name: "CIColorInvert") else { return image }
        filter.setValue(image, forKey: kCIInputImageKey)
        return filter.outputImage ?? image
    }

    private func removeOrangeMask(_ image: CIImage) -> CIImage {
        // Estimate orange mask color and remove it
        // This is a simplified version - real implementation would analyze the image
        guard let filter = CIFilter(name: "CIColorMatrix") else { return image }
        filter.setValue(image, forKey: kCIInputImageKey)

        // Adjust for typical orange mask (approximate values)
        let rVector = CIVector(x: 1.2, y: 0, z: 0, w: 0)
        let gVector = CIVector(x: 0, y: 1.1, z: 0, w: 0)
        let bVector = CIVector(x: 0, y: 0, z: 0.95, w: 0)
        let aVector = CIVector(x: 0, y: 0, z: 0, w: 1)
        let biasVector = CIVector(x: 0, y: 0, z: 0, w: 0)

        filter.setValue(rVector, forKey: "inputRVector")
        filter.setValue(gVector, forKey: "inputGVector")
        filter.setValue(bVector, forKey: "inputBVector")
        filter.setValue(aVector, forKey: "inputAVector")
        filter.setValue(biasVector, forKey: "inputBiasVector")

        return filter.outputImage ?? image
    }

    private func normalizeColorChannels(_ image: CIImage) -> CIImage {
        // Normalize each color channel
        guard let filter = CIFilter(name: "CIColorControls") else { return image }
        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(1.0, forKey: kCIInputSaturationKey)
        return filter.outputImage ?? image
    }

    private func applyToneCorrection(_ image: CIImage) -> CIImage {
        // Apply tone curve for better contrast
        guard let filter = CIFilter(name: "CIToneCurve") else { return image }
        filter.setValue(image, forKey: kCIInputImageKey)

        // Set typical tone curve points
        filter.setValue(CIVector(x: 0, y: 0), forKey: "inputPoint0")
        filter.setValue(CIVector(x: 0.25, y: 0.25), forKey: "inputPoint1")
        filter.setValue(CIVector(x: 0.5, y: 0.5), forKey: "inputPoint2")
        filter.setValue(CIVector(x: 0.75, y: 0.75), forKey: "inputPoint3")
        filter.setValue(CIVector(x: 1, y: 1), forKey: "inputPoint4")

        return filter.outputImage ?? image
    }

    private func applySharpen(_ image: CIImage) -> CIImage {
        guard let filter = CIFilter(name: "CISharpenLuminance") else { return image }
        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(0.4, forKey: kCIInputSharpnessKey)
        return filter.outputImage ?? image
    }
}
