//
//  ResolutionLimiter.swift
//  Analog Intelligence
//
//  Limit export resolution for free tier users
//

import Foundation
import UIKit
import CoreGraphics

/// Manages resolution limitations for free tier users
class ResolutionLimiter {
    /// Maximum resolution for free tier users (1920x1080 HD)
    static let freeMaxResolution = CGSize(width: 1920, height: 1080)

    /// Maximum resolution for Pro users (effectively unlimited - 8K)
    static let proMaxResolution = CGSize(width: 7680, height: 4320)

    /// Get the maximum allowed resolution based on user tier
    static func maxResolution() -> CGSize {
        if ProFeatureGate.isPro {
            return proMaxResolution
        } else {
            return freeMaxResolution
        }
    }

    /// Check if an image exceeds the user's allowed resolution
    /// - Parameter imageSize: The size of the image to check
    /// - Returns: True if the image exceeds allowed resolution
    static func exceedsAllowedResolution(_ imageSize: CGSize) -> Bool {
        let maxRes = maxResolution()
        return imageSize.width > maxRes.width || imageSize.height > maxRes.height
    }

    /// Resize image to fit within allowed resolution limits
    /// - Parameters:
    ///   - image: The input image
    ///   - maintainAspectRatio: Whether to maintain the original aspect ratio (default: true)
    /// - Returns: Resized image if necessary, or original if within limits
    static func limitResolution(of image: UIImage, maintainAspectRatio: Bool = true) -> UIImage {
        let maxRes = maxResolution()

        // Pro users get full resolution
        if ProFeatureGate.isPro {
            return image
        }

        let imageSize = image.size

        // If image is already within limits, return it
        if imageSize.width <= maxRes.width && imageSize.height <= maxRes.height {
            return image
        }

        // Calculate target size
        let targetSize = calculateTargetSize(
            from: imageSize,
            maxSize: maxRes,
            maintainAspectRatio: maintainAspectRatio
        )

        // Resize the image
        return resizeImage(image, to: targetSize)
    }

    /// Calculate the target size for an image within resolution limits
    /// - Parameters:
    ///   - originalSize: The original image size
    ///   - maxSize: The maximum allowed size
    ///   - maintainAspectRatio: Whether to maintain the original aspect ratio
    /// - Returns: The calculated target size
    static func calculateTargetSize(
        from originalSize: CGSize,
        maxSize: CGSize,
        maintainAspectRatio: Bool
    ) -> CGSize {
        if !maintainAspectRatio {
            return maxSize
        }

        // Calculate aspect ratios
        let widthRatio = maxSize.width / originalSize.width
        let heightRatio = maxSize.height / originalSize.height

        // Use the smaller ratio to ensure image fits within maxSize
        let ratio = min(widthRatio, heightRatio)

        return CGSize(
            width: originalSize.width * ratio,
            height: originalSize.height * ratio
        )
    }

    /// Resize an image to a target size with high quality
    /// - Parameters:
    ///   - image: The input image
    ///   - targetSize: The desired output size
    /// - Returns: Resized image
    static func resizeImage(_ image: UIImage, to targetSize: CGSize) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: targetSize)

        let resizedImage = renderer.image { context in
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }

        return resizedImage
    }

    /// Get a user-friendly description of the current resolution limit
    /// - Returns: String describing the resolution limit
    static func resolutionLimitDescription() -> String {
        if ProFeatureGate.isPro {
            return "Full Resolution (up to 8K)"
        } else {
            return "Limited to \(Int(freeMaxResolution.width))x\(Int(freeMaxResolution.height)) (HD)"
        }
    }

    /// Get detailed information about resolution limiting
    /// - Parameter imageSize: The size of the image being exported
    /// - Returns: Information about whether limiting will occur
    static func getResolutionInfo(for imageSize: CGSize) -> ResolutionInfo {
        let maxRes = maxResolution()
        let willBeLimited = exceedsAllowedResolution(imageSize)

        let finalSize: CGSize
        if willBeLimited {
            finalSize = calculateTargetSize(
                from: imageSize,
                maxSize: maxRes,
                maintainAspectRatio: true
            )
        } else {
            finalSize = imageSize
        }

        return ResolutionInfo(
            originalSize: imageSize,
            maxAllowedSize: maxRes,
            finalSize: finalSize,
            willBeLimited: willBeLimited,
            isPro: ProFeatureGate.isPro
        )
    }

    /// Format a size as a resolution string (e.g., "1920x1080")
    static func formatResolution(_ size: CGSize) -> String {
        return "\(Int(size.width))x\(Int(size.height))"
    }

    /// Format a size as megapixels (e.g., "2.1 MP")
    static func formatMegapixels(_ size: CGSize) -> String {
        let megapixels = (size.width * size.height) / 1_000_000
        return String(format: "%.1f MP", megapixels)
    }
}

/// Information about resolution limiting for an export
struct ResolutionInfo {
    /// The original image size
    let originalSize: CGSize

    /// The maximum allowed size for the user's tier
    let maxAllowedSize: CGSize

    /// The final export size (after limiting if necessary)
    let finalSize: CGSize

    /// Whether the image will be limited
    let willBeLimited: Bool

    /// Whether the user has Pro access
    let isPro: Bool

    /// User-friendly description
    var description: String {
        if isPro {
            return "Exporting at full resolution: \(ResolutionLimiter.formatResolution(finalSize)) (\(ResolutionLimiter.formatMegapixels(finalSize)))"
        } else if willBeLimited {
            return "Free tier export limited to \(ResolutionLimiter.formatResolution(maxAllowedSize)). Original: \(ResolutionLimiter.formatResolution(originalSize)). Upgrade to Pro for full resolution."
        } else {
            return "Exporting at \(ResolutionLimiter.formatResolution(finalSize)) (\(ResolutionLimiter.formatMegapixels(finalSize)))"
        }
    }

    /// Short description
    var shortDescription: String {
        if willBeLimited {
            return "Limited to HD (Upgrade for full resolution)"
        } else {
            return ResolutionLimiter.formatResolution(finalSize)
        }
    }
}

// MARK: - SwiftUI Integration

import SwiftUI

/// A view that displays resolution information with upgrade prompt if needed
struct ResolutionInfoView: View {
    let info: ResolutionInfo
    let onUpgrade: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: info.willBeLimited ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                    .foregroundColor(info.willBeLimited ? .orange : .green)

                Text(info.shortDescription)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if info.willBeLimited {
                Button {
                    onUpgrade()
                } label: {
                    HStack {
                        Image(systemName: "crown.fill")
                        Text("Upgrade to Pro for full resolution")
                    }
                    .font(.caption)
                    .foregroundColor(.blue)
                }
            }
        }
        .padding(8)
        .background(Color(.systemGray6))
        .cornerRadius(8)
    }
}

#Preview {
    VStack(spacing: 16) {
        // Example: Image within limits
        ResolutionInfoView(
            info: ResolutionInfo(
                originalSize: CGSize(width: 1920, height: 1080),
                maxAllowedSize: CGSize(width: 1920, height: 1080),
                finalSize: CGSize(width: 1920, height: 1080),
                willBeLimited: false,
                isPro: false
            ),
            onUpgrade: {}
        )

        // Example: Image that will be limited
        ResolutionInfoView(
            info: ResolutionInfo(
                originalSize: CGSize(width: 4032, height: 3024),
                maxAllowedSize: CGSize(width: 1920, height: 1080),
                finalSize: CGSize(width: 1440, height: 1080),
                willBeLimited: true,
                isPro: false
            ),
            onUpgrade: {}
        )

        // Example: Pro user
        ResolutionInfoView(
            info: ResolutionInfo(
                originalSize: CGSize(width: 4032, height: 3024),
                maxAllowedSize: CGSize(width: 7680, height: 4320),
                finalSize: CGSize(width: 4032, height: 3024),
                willBeLimited: false,
                isPro: true
            ),
            onUpgrade: {}
        )
    }
    .padding()
}
