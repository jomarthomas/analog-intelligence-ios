//
//  ProUnlockView.swift
//  AnalogIntelligence
//
//  Pro upgrade promotional view
//

import SwiftUI

/// View promoting Pro upgrade with features list
struct ProUnlockView: View {
    @StateObject private var storeManager = StoreKitManager.shared
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
                            .font(.title.weight(.bold))

                        Text("Unlock the full potential of your film scanning")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top)

                    // Features list
                    VStack(alignment: .leading, spacing: 16) {
                        ProFeatureRow(
                            icon: "photo.fill",
                            title: "Full Resolution Export",
                            description: "Export at maximum quality without limitations"
                        )

                        ProFeatureRow(
                            icon: "wand.and.stars",
                            title: "AI Processing",
                            description: "Advanced color reconstruction and dust removal"
                        )

                        ProFeatureRow(
                            icon: "chart.bar.fill",
                            title: "Insights Tab",
                            description: "Detailed exposure analysis and histogram data"
                        )

                        ProFeatureRow(
                            icon: "photo.on.rectangle.angled",
                            title: "Contact Sheet Generator",
                            description: "Create professional contact sheets from your rolls"
                        )

                        ProFeatureRow(
                            icon: "nosign",
                            title: "No Ads or Watermarks",
                            description: "Clean, distraction-free experience"
                        )
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(12)

                    // Pricing
                    if !purchaseState.isPro {
                        VStack(spacing: 16) {
                            Text("$9.99")
                                .font(.system(size: 48, weight: .bold))

                            Text("One-time purchase")
                                .font(.subheadline)
                                .foregroundColor(.secondary)

                            Button {
                                purchasePro()
                            } label: {
                                if purchaseState.purchaseStatus.isLoading {
                                    ProgressView()
                                        .tint(.white)
                                        .frame(maxWidth: .infinity)
                                        .padding()
                                } else {
                                    Label("Unlock Pro", systemImage: "cart.fill")
                                        .font(.headline)
                                        .foregroundColor(.white)
                                        .frame(maxWidth: .infinity)
                                        .padding()
                                }
                            }
                            .background(Color.blue)
                            .cornerRadius(12)
                            .disabled(purchaseState.purchaseStatus.isLoading)

                            Button("Restore Purchases") {
                                restorePurchases()
                            }
                            .font(.subheadline)
                            .foregroundColor(.blue)
                        }
                    } else {
                        VStack(spacing: 12) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 48))
                                .foregroundColor(.green)

                            Text("You're a Pro User!")
                                .font(.title3.weight(.semibold))

                            Text("Thank you for your support")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        .padding()
                    }
                }
                .padding()
            }
            .navigationTitle("Upgrade to Pro")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .alert("Error", isPresented: Binding(
            get: { purchaseState.errorMessage != nil },
            set: { if !$0 { purchaseState.clearError() } }
        )) {
            Button("OK", role: .cancel) {
                purchaseState.clearError()
            }
        } message: {
            Text(purchaseState.errorMessage ?? "")
        }
    }

    private func purchasePro() {
        Task {
            await storeManager.purchaseProUnlock()
        }
    }

    private func restorePurchases() {
        Task {
            await storeManager.restorePurchases()
        }
    }
}

/// Individual feature row
struct ProFeatureRow: View {
    let icon: String
    let title: String
    let description: String

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(.blue)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)

                Text(description)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
    }
}

#Preview {
    ProUnlockView()
}
