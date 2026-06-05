//
//  OrangeMaskEstimator.swift
//  AnalogIntelligence
//
//  Estimates and removes the orange mask from color film negatives.
//  Color negative film has an orange base mask that needs to be corrected.
//

import Foundation
import CoreImage
import Accelerate

/// Estimates and removes orange mask from color negatives
class OrangeMaskEstimator {

    // MARK: - Orange Mask Removal

    /// Remove orange mask from inverted color negative
    /// - Parameters:
    ///   - image: Inverted color negative image
    ///   - context: Core Image context for rendering
    /// - Returns: Image with orange mask removed
    func removeOrangeMask(
        image: CIImage,
        context: CIContext
    ) async throws -> CIImage {

        // Estimate the orange mask color
        let maskColor = await estimateOrangeMask(image: image, context: context)

        // Remove the mask using color matrix
        return removeMaskColor(image: image, maskColor: maskColor)
    }

    // MARK: - Orange Mask Estimation

    /// Estimate the orange mask color by analyzing the image
    /// The orange mask typically appears in the shadow areas after inversion
    func estimateOrangeMask(
        image: CIImage,
        context: CIContext
    ) async -> OrangeMaskColor {

        // Sample the darkest regions which contain the most mask influence
        let samples = sampleDarkRegions(image: image, context: context)

        // Calculate average color of sampled regions
        let averageColor = calculateAverageColor(samples: samples)

        // Extract orange mask characteristics
        return extractMaskParameters(from: averageColor)
    }

    // MARK: - Dark Region Sampling

    /// Sample the darkest regions of the image to analyze orange mask
    private func sampleDarkRegions(
        image: CIImage,
        context: CIContext
    ) -> [CIColor] {

        var samples: [CIColor] = []

        // Create a downsampled version for analysis
        let scale: CGFloat = 0.1 // Use 10% scale for faster processing
        let extent = image.extent
        let sampleSize = CGSize(
            width: extent.width * scale,
            height: extent.height * scale
        )

        guard let resizedImage = resizeImage(image, to: sampleSize) else {
            return samples
        }

        // Render to bitmap for analysis
        let width = Int(sampleSize.width)
        let height = Int(sampleSize.height)
        let bytesPerPixel = 4
        let bytesPerRow = width * bytesPerPixel
        var pixelData = [UInt8](repeating: 0, count: width * height * bytesPerPixel)

        context.render(
            resizedImage,
            toBitmap: &pixelData,
            rowBytes: bytesPerRow,
            bounds: CGRect(origin: .zero, size: sampleSize),
            format: .RGBA8,
            colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
        )

        // Sample dark regions (lowest 20% luminance)
        let sampleCount = 100
        var darkPixels: [(r: UInt8, g: UInt8, b: UInt8)] = []

        for y in 0..<height {
            for x in 0..<width {
                let index = (y * width + x) * bytesPerPixel
                let r = pixelData[index]
                let g = pixelData[index + 1]
                let b = pixelData[index + 2]

                // Calculate luminance
                let luminance = 0.299 * Float(r) + 0.587 * Float(g) + 0.114 * Float(b)

                // Collect dark pixels
                if luminance < 51 { // Threshold for dark regions (20% of 255)
                    darkPixels.append((r, g, b))
                }
            }
        }

        // Sort by luminance and take darkest samples
        darkPixels.sort { pixel1, pixel2 in
            let lum1 = 0.299 * Float(pixel1.r) + 0.587 * Float(pixel1.g) + 0.114 * Float(pixel1.b)
            let lum2 = 0.299 * Float(pixel2.r) + 0.587 * Float(pixel2.g) + 0.114 * Float(pixel2.b)
            return lum1 < lum2
        }

        // Take representative samples
        let sampleStep = max(1, darkPixels.count / sampleCount)
        for i in stride(from: 0, to: darkPixels.count, by: sampleStep) {
            let pixel = darkPixels[i]
            samples.append(CIColor(
                red: CGFloat(pixel.r) / 255.0,
                green: CGFloat(pixel.g) / 255.0,
                blue: CGFloat(pixel.b) / 255.0
            ))
        }

        return samples
    }

    // MARK: - Color Analysis

    /// Calculate average color from samples
    private func calculateAverageColor(samples: [CIColor]) -> CIColor {
        guard !samples.isEmpty else {
            return CIColor(red: 1.0, green: 0.65, blue: 0.4) // Default orange
        }

        var totalRed: CGFloat = 0
        var totalGreen: CGFloat = 0
        var totalBlue: CGFloat = 0

        for sample in samples {
            totalRed += sample.red
            totalGreen += sample.green
            totalBlue += sample.blue
        }

        let count = CGFloat(samples.count)
        return CIColor(
            red: totalRed / count,
            green: totalGreen / count,
            blue: totalBlue / count
        )
    }

    /// Extract orange mask parameters from average color
    private func extractMaskParameters(from color: CIColor) -> OrangeMaskColor {

        // Calculate the orange mask density in each channel
        // Orange mask typically has high red, medium green, low blue

        let red = Float(color.red)
        let green = Float(color.green)
        let blue = Float(color.blue)

        // Normalize to determine mask strength
        let maxChannel = max(red, green, blue)
        let minChannel = min(red, green, blue)
        let range = maxChannel - minChannel

        // Calculate mask parameters
        return OrangeMaskColor(
            redDensity: red,
            greenDensity: green,
            blueDensity: blue,
            strength: range > 0.1 ? range : 0.3 // Default strength if low contrast
        )
    }

    // MARK: - Mask Removal

    /// Remove the estimated mask color from the image
    private func removeMaskColor(
        image: CIImage,
        maskColor: OrangeMaskColor
    ) -> CIImage {

        // Use color matrix to compensate for orange mask
        guard let matrixFilter = CIFilter(name: "CIColorMatrix") else {
            return image
        }

        matrixFilter.setValue(image, forKey: kCIInputImageKey)

        // Calculate compensation factors
        // Orange mask affects channels differently - compensate by adjusting gains
        let redCompensation = 1.0 / max(maskColor.redDensity, 0.1)
        let greenCompensation = 1.0 / max(maskColor.greenDensity, 0.1)
        let blueCompensation = 1.0 / max(maskColor.blueDensity, 0.1)

        // Normalize compensations relative to blue (typically least affected)
        let normFactor = blueCompensation
        let redGain = CGFloat(redCompensation / normFactor)
        let greenGain = CGFloat(greenCompensation / normFactor)
        let blueGain = CGFloat(1.0)

        // Apply color matrix
        matrixFilter.setValue(
            CIVector(x: redGain, y: 0, z: 0, w: 0),
            forKey: "inputRVector"
        )
        matrixFilter.setValue(
            CIVector(x: 0, y: greenGain, z: 0, w: 0),
            forKey: "inputGVector"
        )
        matrixFilter.setValue(
            CIVector(x: 0, y: 0, z: blueGain, w: 0),
            forKey: "inputBVector"
        )
        matrixFilter.setValue(
            CIVector(x: 0, y: 0, z: 0, w: 1),
            forKey: "inputAVector"
        )

        // Apply slight bias to remove residual color cast
        let bias = -0.05 * CGFloat(maskColor.strength)
        matrixFilter.setValue(
            CIVector(x: bias, y: bias, z: 0, w: 0),
            forKey: "inputBiasVector"
        )

        return matrixFilter.outputImage ?? image
    }

    // MARK: - Advanced Orange Mask Removal with Accelerate

    /// Remove orange mask using Accelerate framework for maximum performance
    func removeMaskAccelerate(
        cgImage: CGImage,
        maskColor: OrangeMaskColor
    ) throws -> CGImage {

        let width = cgImage.width
        let height = cgImage.height

        // Create buffers
        var sourceBuffer = vImage_Buffer()
        var format = vImage_CGImageFormat(
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            colorSpace: nil,
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.first.rawValue),
            version: 0,
            decode: nil,
            renderingIntent: .defaultIntent
        )

        var error = vImageBuffer_InitWithCGImage(
            &sourceBuffer,
            &format,
            nil,
            cgImage,
            vImage_Flags(kvImageNoFlags)
        )

        guard error == kvImageNoError else {
            throw ProcessingError.processingFailed("Failed to initialize source buffer")
        }

        defer {
            sourceBuffer.data.deallocate()
        }

        var destBuffer = vImage_Buffer()
        error = vImageBuffer_Init(
            &destBuffer,
            vImagePixelCount(height),
            vImagePixelCount(width),
            format.bitsPerPixel,
            vImage_Flags(kvImageNoFlags)
        )

        guard error == kvImageNoError else {
            throw ProcessingError.processingFailed("Failed to initialize destination buffer")
        }

        defer {
            destBuffer.data.deallocate()
        }

        // Apply per-channel multiplication for mask removal
        let matrix = [
            Int16(1.0 / max(maskColor.redDensity, 0.1) * 256),
            Int16(0),
            Int16(0),
            Int16(0),
            Int16(0),
            Int16(1.0 / max(maskColor.greenDensity, 0.1) * 256),
            Int16(0),
            Int16(0),
            Int16(0),
            Int16(0),
            Int16(1.0 / max(maskColor.blueDensity, 0.1) * 256),
            Int16(0),
            Int16(0),
            Int16(0),
            Int16(0),
            Int16(256) // Alpha unchanged
        ]

        error = vImageMatrixMultiply_ARGB8888(
            &sourceBuffer,
            &destBuffer,
            matrix,
            256,
            nil,
            nil,
            vImage_Flags(kvImageNoFlags)
        )

        guard error == kvImageNoError else {
            throw ProcessingError.processingFailed("Failed to apply matrix")
        }

        guard let outputImage = vImageCreateCGImageFromBuffer(
            &destBuffer,
            &format,
            nil,
            nil,
            vImage_Flags(kvImageNoFlags),
            &error
        )?.takeRetainedValue() else {
            throw ProcessingError.processingFailed("Failed to create output image")
        }

        return outputImage
    }

    // MARK: - Utility

    /// Resize image for faster processing
    private func resizeImage(_ image: CIImage, to size: CGSize) -> CIImage? {
        let scale = min(size.width / image.extent.width, size.height / image.extent.height)

        guard let filter = CIFilter(name: "CILanczosScaleTransform") else {
            return nil
        }

        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(scale, forKey: kCIInputScaleKey)
        filter.setValue(1.0, forKey: kCIInputAspectRatioKey)

        return filter.outputImage
    }

    // MARK: - Supporting Types

    struct OrangeMaskColor {
        var redDensity: Float
        var greenDensity: Float
        var blueDensity: Float
        var strength: Float

        /// Default orange mask for typical color negative film
        static let `default` = OrangeMaskColor(
            redDensity: 1.0,
            greenDensity: 0.65,
            blueDensity: 0.4,
            strength: 0.6
        )
    }
}
