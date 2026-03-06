//
//  WatermarkRenderer.swift
//  Analog Intelligence
//
//  Add watermark to exported images for free tier users
//

import Foundation
import CoreImage
import CoreGraphics
import UIKit

/// Renders watermark on images for free tier users
class WatermarkRenderer {
    /// Add watermark to an image
    /// - Parameters:
    ///   - image: The input image to watermark
    ///   - opacity: Watermark opacity (0.0 - 1.0)
    /// - Returns: Image with watermark applied, or original if Pro user
    static func addWatermark(to image: UIImage, opacity: Double = 0.3) -> UIImage {
        // Check if user has Pro access
        if ProFeatureGate.isPro {
            return image
        }

        // Use the configured watermark opacity
        let watermarkOpacity = ProFeatureGate.watermarkOpacity

        // Create watermark text
        let watermarkText = "ANALOG INTELLIGENCE"
        let subtitleText = "Scanned with Analog Intelligence - Get Pro to remove watermark"

        // Calculate positions and sizes
        let imageSize = image.size
        let renderer = UIGraphicsImageRenderer(size: imageSize)

        let watermarkedImage = renderer.image { context in
            // Draw original image
            image.draw(at: .zero)

            // Configure text attributes for main watermark
            let paragraphStyle = NSMutableParagraphStyle()
            paragraphStyle.alignment = .center

            let fontSize = imageSize.width * 0.05 // 5% of image width
            let mainAttributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: fontSize),
                .foregroundColor: UIColor.white.withAlphaComponent(watermarkOpacity),
                .paragraphStyle: paragraphStyle,
                .kern: fontSize * 0.1 // Letter spacing
            ]

            // Draw main watermark (centered)
            let mainTextSize = watermarkText.size(withAttributes: mainAttributes)
            let mainRect = CGRect(
                x: (imageSize.width - mainTextSize.width) / 2,
                y: (imageSize.height - mainTextSize.height) / 2,
                width: mainTextSize.width,
                height: mainTextSize.height
            )

            // Draw shadow/outline for better visibility
            context.cgContext.saveGState()
            context.cgContext.setShadow(
                offset: CGSize(width: 2, height: 2),
                blur: 4,
                color: UIColor.black.withAlphaComponent(watermarkOpacity * 0.8).cgColor
            )
            watermarkText.draw(in: mainRect, withAttributes: mainAttributes)
            context.cgContext.restoreGState()

            // Configure text attributes for subtitle
            let subtitleFontSize = imageSize.width * 0.015 // 1.5% of image width
            let subtitleAttributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: subtitleFontSize),
                .foregroundColor: UIColor.white.withAlphaComponent(watermarkOpacity * 0.8),
                .paragraphStyle: paragraphStyle
            ]

            // Draw subtitle at bottom
            let subtitleSize = subtitleText.size(withAttributes: subtitleAttributes)
            let subtitleRect = CGRect(
                x: (imageSize.width - subtitleSize.width) / 2,
                y: imageSize.height - subtitleSize.height - (imageSize.height * 0.02), // 2% margin from bottom
                width: subtitleSize.width,
                height: subtitleSize.height
            )

            context.cgContext.saveGState()
            context.cgContext.setShadow(
                offset: CGSize(width: 1, height: 1),
                blur: 2,
                color: UIColor.black.withAlphaComponent(watermarkOpacity * 0.8).cgColor
            )
            subtitleText.draw(in: subtitleRect, withAttributes: subtitleAttributes)
            context.cgContext.restoreGState()
        }

        return watermarkedImage
    }

    /// Add diagonal watermark pattern (alternative style)
    /// - Parameters:
    ///   - image: The input image to watermark
    ///   - opacity: Watermark opacity (0.0 - 1.0)
    /// - Returns: Image with diagonal watermark pattern applied
    static func addDiagonalWatermark(to image: UIImage, opacity: Double = 0.2) -> UIImage {
        // Check if user has Pro access
        if ProFeatureGate.isPro {
            return image
        }

        let watermarkOpacity = ProFeatureGate.watermarkOpacity
        let watermarkText = "ANALOG INTELLIGENCE"

        let imageSize = image.size
        let renderer = UIGraphicsImageRenderer(size: imageSize)

        let watermarkedImage = renderer.image { context in
            // Draw original image
            image.draw(at: .zero)

            // Configure text attributes
            let fontSize = imageSize.width * 0.04
            let attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: fontSize),
                .foregroundColor: UIColor.white.withAlphaComponent(watermarkOpacity * 0.6)
            ]

            let textSize = watermarkText.size(withAttributes: attributes)

            // Draw diagonal pattern
            context.cgContext.saveGState()

            // Rotate context for diagonal text
            context.cgContext.translateBy(x: imageSize.width / 2, y: imageSize.height / 2)
            context.cgContext.rotate(by: -.pi / 4) // -45 degrees

            // Draw multiple instances across the image
            let spacing = textSize.width * 1.5
            let rows = Int(imageSize.height / spacing) + 2
            let cols = Int(imageSize.width / spacing) + 2

            for row in -rows...rows {
                for col in -cols...cols {
                    let x = CGFloat(col) * spacing
                    let y = CGFloat(row) * spacing

                    context.cgContext.saveGState()
                    context.cgContext.setShadow(
                        offset: CGSize(width: 1, height: 1),
                        blur: 2,
                        color: UIColor.black.withAlphaComponent(watermarkOpacity * 0.5).cgColor
                    )
                    watermarkText.draw(
                        at: CGPoint(x: x - textSize.width / 2, y: y - textSize.height / 2),
                        withAttributes: attributes
                    )
                    context.cgContext.restoreGState()
                }
            }

            context.cgContext.restoreGState()
        }

        return watermarkedImage
    }

    /// Add corner watermark (minimal style)
    /// - Parameters:
    ///   - image: The input image to watermark
    ///   - position: Corner position for watermark
    ///   - opacity: Watermark opacity (0.0 - 1.0)
    /// - Returns: Image with corner watermark applied
    static func addCornerWatermark(
        to image: UIImage,
        position: WatermarkPosition = .bottomRight,
        opacity: Double = 0.5
    ) -> UIImage {
        // Check if user has Pro access
        if ProFeatureGate.isPro {
            return image
        }

        let watermarkOpacity = ProFeatureGate.watermarkOpacity
        let watermarkText = "ANALOG INTELLIGENCE"

        let imageSize = image.size
        let renderer = UIGraphicsImageRenderer(size: imageSize)

        let watermarkedImage = renderer.image { context in
            // Draw original image
            image.draw(at: .zero)

            // Configure text attributes
            let fontSize = imageSize.width * 0.025
            let attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: fontSize, weight: .medium),
                .foregroundColor: UIColor.white.withAlphaComponent(watermarkOpacity)
            ]

            let textSize = watermarkText.size(withAttributes: attributes)
            let margin = imageSize.width * 0.02

            // Calculate position based on corner
            let rect: CGRect
            switch position {
            case .topLeft:
                rect = CGRect(x: margin, y: margin, width: textSize.width, height: textSize.height)
            case .topRight:
                rect = CGRect(x: imageSize.width - textSize.width - margin, y: margin, width: textSize.width, height: textSize.height)
            case .bottomLeft:
                rect = CGRect(x: margin, y: imageSize.height - textSize.height - margin, width: textSize.width, height: textSize.height)
            case .bottomRight:
                rect = CGRect(x: imageSize.width - textSize.width - margin, y: imageSize.height - textSize.height - margin, width: textSize.width, height: textSize.height)
            case .center:
                rect = CGRect(
                    x: (imageSize.width - textSize.width) / 2,
                    y: (imageSize.height - textSize.height) / 2,
                    width: textSize.width,
                    height: textSize.height
                )
            }

            // Draw with shadow
            context.cgContext.saveGState()
            context.cgContext.setShadow(
                offset: CGSize(width: 1, height: 1),
                blur: 3,
                color: UIColor.black.withAlphaComponent(watermarkOpacity * 0.8).cgColor
            )
            watermarkText.draw(in: rect, withAttributes: attributes)
            context.cgContext.restoreGState()
        }

        return watermarkedImage
    }
}
