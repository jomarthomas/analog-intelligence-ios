//
//  ProductIdentifiers.swift
//  Analog Intelligence
//
//  Product identifiers for StoreKit integration
//

import Foundation

/// Product identifiers for in-app purchases
enum ProductIdentifiers {
    /// Pro Unlock - One-time purchase at $9.99
    /// Unlocks all premium features:
    /// - No watermark on exports
    /// - No ads
    /// - Full resolution export
    /// - AI processing (Phase 2)
    /// - Insights tab access
    /// - Contact sheet generator
    static let proUnlock = "com.analogintelligence.pro.unlock"

    /// All available product IDs
    static let allProducts: Set<String> = [proUnlock]
}

/// Feature availability based on Pro status
enum ProFeature {
    case insights
    case aiColorReconstruction
    case aiDustRemoval
    case contactSheetGenerator
    case fullResolutionExport
    case noWatermark
    case noAds

    var displayName: String {
        switch self {
        case .insights:
            return "Insights Tab"
        case .aiColorReconstruction:
            return "AI Color Reconstruction"
        case .aiDustRemoval:
            return "AI Dust Removal"
        case .contactSheetGenerator:
            return "Contact Sheet Generator"
        case .fullResolutionExport:
            return "Full Resolution Export"
        case .noWatermark:
            return "No Watermark"
        case .noAds:
            return "Ad-Free Experience"
        }
    }

    var description: String {
        switch self {
        case .insights:
            return "Analyze exposure data across your entire roll with histogram charts and clipping detection"
        case .aiColorReconstruction:
            return "Advanced AI-powered color correction for accurate film reproduction"
        case .aiDustRemoval:
            return "Automatically detect and remove dust and scratches from scanned images"
        case .contactSheetGenerator:
            return "Create professional contact sheets from your scanned rolls"
        case .fullResolutionExport:
            return "Export images at maximum resolution without quality limitations"
        case .noWatermark:
            return "Remove watermarks from all exported images"
        case .noAds:
            return "Enjoy an ad-free scanning experience"
        }
    }
}
