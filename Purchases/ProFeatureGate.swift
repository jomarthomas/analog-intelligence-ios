//
//  ProFeatureGate.swift
//  Analog Intelligence
//
//  Helper to check and gate Pro feature access
//

import Foundation
import SwiftUI

/// Helper for checking Pro access and gating features
struct ProFeatureGate {
    private static let proDefaultsKey = "com.analogintelligence.isPro"

    /// Check if user has Pro access
    static var isPro: Bool {
        UserDefaults.standard.bool(forKey: proDefaultsKey)
    }

    /// Check if user is on free tier
    static var isFree: Bool {
        !isPro
    }

    /// Check if a specific feature is available
    static func hasAccess(to feature: ProFeature) -> Bool {
        // All Pro features require Pro status
        return isPro
    }

    /// Get the appropriate export resolution based on user tier
    static func maxExportResolution() -> CGSize? {
        if isPro {
            // Pro users get full resolution (no limit)
            return nil
        } else {
            // Free users limited to 1920x1080 (HD)
            return CGSize(width: 1920, height: 1080)
        }
    }

    /// Check if watermark should be added
    static var shouldAddWatermark: Bool {
        isFree
    }

    /// Check if ads should be shown
    static var shouldShowAds: Bool {
        isFree
    }

    /// Get watermark opacity (0.0 - 1.0)
    static var watermarkOpacity: Double {
        isFree ? 0.3 : 0.0
    }

    /// Get list of features available to free users
    static var freeFeatures: [String] {
        [
            "Scan negatives",
            "Basic adjustments (Exposure, Warmth, Contrast)",
            "Gallery view",
            "Export to Photos (limited resolution)",
            "Batch scanning"
        ]
    }

    /// Get list of features exclusive to Pro users
    static var proFeatures: [ProFeature] {
        [
            .noWatermark,
            .noAds,
            .fullResolutionExport,
            .insights,
            .aiColorReconstruction,
            .aiDustRemoval,
            .contactSheetGenerator
        ]
    }

    /// Get a user-friendly message for when a Pro feature is accessed by a free user
    static func proRequiredMessage(for feature: ProFeature) -> String {
        "Unlock \(feature.displayName) with Analog Intelligence Pro for just $9.99"
    }
}

// MARK: - SwiftUI View Modifiers

extension View {
    /// Apply a Pro feature gate that shows an upgrade prompt if user is on free tier
    func proFeatureGate(
        feature: ProFeature,
        onUpgrade: @escaping () -> Void = {}
    ) -> some View {
        self.disabled(ProFeatureGate.isFree)
            .overlay {
                if ProFeatureGate.isFree {
                    Button {
                        onUpgrade()
                    } label: {
                        VStack(spacing: 8) {
                            Image(systemName: "lock.fill")
                                .font(.title)
                            Text("Pro Feature")
                                .font(.headline)
                            Text(feature.displayName)
                                .font(.subheadline)
                                .multilineTextAlignment(.center)
                        }
                        .foregroundColor(.white)
                        .padding()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.black.opacity(0.8))
                    }
                }
            }
    }

    /// Conditionally show content based on Pro status
    @ViewBuilder
    func showIfPro() -> some View {
        if ProFeatureGate.isPro {
            self
        }
    }

    /// Conditionally show content for free users
    @ViewBuilder
    func showIfFree() -> some View {
        if ProFeatureGate.isFree {
            self
        }
    }
}

// MARK: - Pro Unlock View

/// A view that displays Pro features and purchase option
struct ProUnlockView: View {
    @StateObject private var purchaseState = PurchaseState.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    VStack(spacing: 12) {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.yellow)

                        Text("Analog Intelligence Pro")
                            .font(.title)
                            .bold()

                        Text("Unlock the full power of professional film scanning")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top)

                    // Features List
                    VStack(alignment: .leading, spacing: 16) {
                        ForEach(ProFeatureGate.proFeatures, id: \.displayName) { feature in
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                                    .font(.title3)

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(feature.displayName)
                                        .font(.headline)

                                    Text(feature.description)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(12)

                    // Purchase Button
                    if let price = purchaseState.proUnlockPrice {
                        Button {
                            Task {
                                await StoreKitManager.shared.purchaseProUnlock()
                            }
                        } label: {
                            HStack {
                                Text("Unlock Pro")
                                    .bold()
                                Spacer()
                                Text(price)
                                    .bold()
                            }
                            .foregroundColor(.white)
                            .padding()
                            .background(Color.blue)
                            .cornerRadius(12)
                        }
                        .disabled(purchaseState.purchaseStatus.isLoading)
                    } else {
                        ProgressView()
                    }

                    // Restore Button
                    Button {
                        Task {
                            await StoreKitManager.shared.restorePurchases()
                        }
                    } label: {
                        Text("Restore Purchases")
                            .font(.footnote)
                            .foregroundColor(.blue)
                    }
                    .disabled(purchaseState.purchaseStatus.isLoading)

                    // Status Message
                    if purchaseState.purchaseStatus != .notPurchased && purchaseState.purchaseStatus != .unknown {
                        Text(purchaseState.purchaseStatus.displayMessage)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }

                    // Error Message
                    if let error = purchaseState.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                    }

                    // Fine Print
                    Text("One-time purchase. No subscriptions. Unlock once, own forever.")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.top)
                }
                .padding()
            }
            .navigationTitle("Upgrade")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .onChange(of: purchaseState.isPro) { _, isPro in
            if isPro {
                // Auto-dismiss when purchase completes
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    dismiss()
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    ProUnlockView()
}
