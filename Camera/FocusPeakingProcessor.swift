//
//  FocusPeakingProcessor.swift
//  Analog Intelligence
//
//  Real-time focus peaking visualization using edge detection
//

import Foundation
import CoreImage
import AVFoundation
import Accelerate

/// Processes video frames to overlay focus peaking highlights
@MainActor
class FocusPeakingProcessor {
    private let ciContext: CIContext
    private var cachedEdgeFilter: CIFilter?
    private var cachedColorFilter: CIFilter?

    // Configuration
    var threshold: Float = 0.3  // 0.0-1.0, higher = more sensitive
    var peakingColor: UIColor = .red
    var opacity: Float = 0.8

    init() {
        // Use GPU for maximum performance
        ciContext = CIContext(options: [
            .useSoftwareRenderer: false,
            .priorityRequestLow: false  // High priority
        ])
    }

    /// Process video frame and overlay focus peaking highlights
    /// - Parameters:
    ///   - pixelBuffer: Raw camera frame
    /// - Returns: Frame with focus peaking overlay
    func addFocusPeaking(to pixelBuffer: CVPixelBuffer) -> CIImage {
        let inputImage = CIImage(cvPixelBuffer: pixelBuffer)

        // 1. Convert to grayscale (luminance channel)
        guard let grayscale = convertToGrayscale(inputImage) else {
            return inputImage
        }

        // 2. Detect edges (high-frequency details = in focus)
        guard let edges = detectEdges(grayscale) else {
            return inputImage
        }

        // 3. Threshold to highlight only sharp edges
        guard let thresholdedEdges = applyThreshold(to: edges) else {
            return inputImage
        }

        // 4. Colorize edges
        guard let coloredEdges = colorize(thresholdedEdges) else {
            return inputImage
        }

        // 5. Composite over original frame
        return composite(overlay: coloredEdges, background: inputImage)
    }

    // MARK: - Processing Stages

    private func convertToGrayscale(_ image: CIImage) -> CIImage? {
        // Use CIColorMatrix for fast grayscale conversion (ITU-R BT.709 weights)
        guard let filter = CIFilter(name: "CIColorMatrix") else { return nil }

        filter.setValue(image, forKey: kCIInputImageKey)

        // Luminance weights: 0.2126*R + 0.7152*G + 0.0722*B
        filter.setValue(
            CIVector(x: 0.2126, y: 0.7152, z: 0.0722, w: 0),
            forKey: "inputRVector"
        )
        filter.setValue(
            CIVector(x: 0.2126, y: 0.7152, z: 0.0722, w: 0),
            forKey: "inputGVector"
        )
        filter.setValue(
            CIVector(x: 0.2126, y: 0.7152, z: 0.0722, w: 0),
            forKey: "inputBVector"
        )
        filter.setValue(
            CIVector(x: 0, y: 0, z: 0, w: 1),
            forKey: "inputAVector"
        )

        return filter.outputImage
    }

    private func detectEdges(_ image: CIImage) -> CIImage? {
        // Reuse filter if possible for performance
        if cachedEdgeFilter == nil {
            cachedEdgeFilter = CIFilter(name: "CIEdges")
        }

        guard let filter = cachedEdgeFilter else { return nil }

        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(CGFloat(threshold * 10.0), forKey: "inputIntensity")

        return filter.outputImage
    }

    private func applyThreshold(to image: CIImage) -> CIImage? {
        // Use color controls to create a binary mask
        // High contrast effectively creates threshold
        guard let filter = CIFilter(name: "CIColorControls") else { return nil }

        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(-0.5, forKey: "inputBrightness")  // Darken overall
        filter.setValue(5.0, forKey: "inputContrast")     // Extreme contrast = binary
        filter.setValue(0.0, forKey: "inputSaturation")   // Remove any color

        return filter.outputImage
    }

    private func colorize(_ image: CIImage) -> CIImage? {
        // Reuse filter if possible for performance
        if cachedColorFilter == nil {
            cachedColorFilter = CIFilter(name: "CIFalseColor")
        }

        guard let filter = cachedColorFilter else { return nil }

        filter.setValue(image, forKey: kCIInputImageKey)

        // Color0 = edges (peaking color)
        let ciPeakingColor = CIColor(color: peakingColor.withAlphaComponent(CGFloat(opacity)))
        filter.setValue(ciPeakingColor, forKey: "inputColor0")

        // Color1 = background (transparent)
        filter.setValue(CIColor.clear, forKey: "inputColor1")

        return filter.outputImage
    }

    private func composite(overlay: CIImage, background: CIImage) -> CIImage {
        guard let compositeFilter = CIFilter(name: "CISourceOverCompositing") else {
            return background
        }

        compositeFilter.setValue(overlay, forKey: kCIInputImageKey)
        compositeFilter.setValue(background, forKey: kCIInputBackgroundImageKey)

        return compositeFilter.outputImage ?? background
    }
}

// MARK: - Accelerate-Based Alternative (Higher Performance)

extension FocusPeakingProcessor {
    /// High-performance focus peaking using Accelerate framework
    /// - Parameter pixelBuffer: Raw camera frame
    /// - Returns: Frame with focus peaking overlay
    func addFocusPeakingAccelerate(to pixelBuffer: CVPixelBuffer) -> CIImage? {
        // Lock pixel buffer for CPU access
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else {
            return nil
        }

        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)

        // Create vImage buffer from pixel buffer
        var sourceBuffer = vImage_Buffer(
            data: baseAddress,
            height: vImagePixelCount(height),
            width: vImagePixelCount(width),
            rowBytes: bytesPerRow
        )

        // Allocate destination buffer for edge detection
        let destData = UnsafeMutableRawPointer.allocate(
            byteCount: bytesPerRow * height,
            alignment: 16
        )
        defer { destData.deallocate() }

        var destBuffer = vImage_Buffer(
            data: destData,
            height: vImagePixelCount(height),
            width: vImagePixelCount(width),
            rowBytes: bytesPerRow
        )

        // Apply Sobel edge detection (horizontal + vertical)
        // This is MUCH faster than Core Image for this operation

        var error: vImage_Error

        // Horizontal Sobel kernel
        var horizontalKernel: [Int16] = [
            -1, 0, 1,
            -2, 0, 2,
            -1, 0, 1
        ]

        // Vertical Sobel kernel
        var verticalKernel: [Int16] = [
            -1, -2, -1,
             0,  0,  0,
             1,  2,  1
        ]

        // Apply Sobel (simplified for ARGB8888)
        // In production, you'd combine horizontal and vertical gradients
        error = vImageConvolve_ARGB8888(
            &sourceBuffer,
            &destBuffer,
            nil,
            0, 0,
            &horizontalKernel,
            3, 3,
            1,
            nil,
            vImage_Flags(kvImageEdgeExtend)
        )

        guard error == kvImageNoError else {
            return nil
        }

        // Convert back to CIImage
        guard let cgImage = createCGImage(from: &destBuffer, width: width, height: height) else {
            return nil
        }

        return CIImage(cgImage: cgImage)
    }

    private func createCGImage(from buffer: UnsafeMutablePointer<vImage_Buffer>, width: Int, height: Int) -> CGImage? {
        let bitsPerComponent = 8
        let bitsPerPixel = 32
        let bytesPerRow = width * 4

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue)

        guard let providerRef = CGDataProvider(
            dataInfo: nil,
            data: buffer.pointee.data,
            size: height * bytesPerRow,
            releaseData: { _, _, _ in }
        ) else {
            return nil
        }

        return CGImage(
            width: width,
            height: height,
            bitsPerComponent: bitsPerComponent,
            bitsPerPixel: bitsPerPixel,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: bitmapInfo,
            provider: providerRef,
            decode: nil,
            shouldInterpolate: false,
            intent: .defaultIntent
        )
    }
}

// MARK: - Configuration Presets

extension FocusPeakingProcessor {
    enum Sensitivity {
        case low      // Only very sharp edges
        case medium   // Balanced
        case high     // Aggressive, more false positives

        var threshold: Float {
            switch self {
            case .low: return 0.5
            case .medium: return 0.3
            case .high: return 0.1
            }
        }
    }

    enum Color {
        case red
        case green
        case blue
        case yellow
        case magenta

        var uiColor: UIColor {
            switch self {
            case .red: return .red
            case .green: return .green
            case .blue: return .blue
            case .yellow: return .yellow
            case .magenta: return .magenta
            }
        }
    }

    func configure(sensitivity: Sensitivity, color: Color, opacity: Float = 0.8) {
        self.threshold = sensitivity.threshold
        self.peakingColor = color.uiColor
        self.opacity = opacity
    }
}
