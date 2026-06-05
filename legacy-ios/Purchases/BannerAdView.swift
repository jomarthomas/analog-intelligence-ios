//
//  BannerAdView.swift
//  AnalogIntelligence
//
//  Google AdMob banner ad view for free tier users
//  Displays adaptive banner ads at the bottom of scan and gallery views
//
//  SETUP REQUIRED:
//  1. Add Google Mobile Ads SDK to project
//  2. Initialize AdMobManager in app startup
//  3. Configure Ad Unit IDs in AdMobManager
//

import SwiftUI

// IMPORTANT: Uncomment after adding Google Mobile Ads SDK
// import GoogleMobileAds

/// Banner ad view with Google AdMob integration
struct BannerAdView: View {
    @StateObject private var purchaseState = PurchaseState.shared
    @StateObject private var adMobManager = AdMobManager.shared

    var body: some View {
        Group {
            if !purchaseState.isPro {
                VStack(spacing: 0) {
                    Divider()
                        .background(Color.gray.opacity(0.3))

                    // AdMob Banner Container
                    AdMobBannerViewRepresentable()
                        .frame(height: adMobManager.standardBannerHeight)
                        .background(AnalogTheme.backgroundCard)
                }
            }
        }
        .onAppear {
            adMobManager.updateAdVisibility()
        }
        .onChange(of: purchaseState.isPro) { _, isPro in
            if isPro {
                print("✓ [BannerAdView] Pro purchased - hiding ads")
                adMobManager.updateAdVisibility()
            }
        }
    }
}

// MARK: - AdMob Banner View Representable

/// UIViewRepresentable wrapper for GADBannerView
struct AdMobBannerViewRepresentable: UIViewRepresentable {
    @StateObject private var adMobManager = AdMobManager.shared
    @StateObject private var purchaseState = PurchaseState.shared

    func makeUIView(context: Context) -> UIView {
        let containerView = UIView()
        containerView.backgroundColor = .clear

        // Don't load ads for Pro users
        guard !purchaseState.isPro else {
            print("○ [AdMobBanner] Pro user - not loading ads")
            return containerView
        }

        // UNCOMMENT when Google Mobile Ads SDK is added:
        /*
        // Create banner view
        let bannerView = GADBannerView()
        bannerView.adUnitID = adMobManager.currentBannerAdUnitID

        // Get the root view controller
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let rootViewController = windowScene.windows.first?.rootViewController {
            bannerView.rootViewController = rootViewController
        }

        // Set delegate
        bannerView.delegate = context.coordinator

        // Configure adaptive banner size
        let frame = containerView.frame
        let viewWidth = frame.size.width > 0 ? frame.size.width : UIScreen.main.bounds.width
        bannerView.adSize = GADCurrentOrientationAnchoredAdaptiveBannerAdSizeWithWidth(viewWidth)

        // Add to container
        containerView.addSubview(bannerView)
        bannerView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            bannerView.centerXAnchor.constraint(equalTo: containerView.centerXAnchor),
            bannerView.centerYAnchor.constraint(equalTo: containerView.centerYAnchor),
            bannerView.widthAnchor.constraint(equalTo: containerView.widthAnchor),
            bannerView.heightAnchor.constraint(equalToConstant: bannerView.adSize.size.height)
        ])

        // Load ad request
        let request = GADRequest()

        // Optional: Add test device IDs for debugging
        // GADMobileAds.sharedInstance().requestConfiguration.testDeviceIdentifiers = ["YOUR_TEST_DEVICE_ID"]

        adMobManager.adState = .loading
        bannerView.load(request)

        print("📱 [AdMobBanner] Loading ad with unit ID: \(adMobManager.currentBannerAdUnitID)")
        */

        // TEMPORARY: Show placeholder while SDK is not added
        let placeholderLabel = UILabel()
        placeholderLabel.text = "AdMob Banner (Add SDK to show real ads)"
        placeholderLabel.textAlignment = .center
        placeholderLabel.font = .systemFont(ofSize: 11, weight: .semibold)
        placeholderLabel.textColor = .systemGray
        placeholderLabel.backgroundColor = .systemGray6

        containerView.addSubview(placeholderLabel)
        placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            placeholderLabel.leadingAnchor.constraint(equalTo: containerView.leadingAnchor),
            placeholderLabel.trailingAnchor.constraint(equalTo: containerView.trailingAnchor),
            placeholderLabel.topAnchor.constraint(equalTo: containerView.topAnchor),
            placeholderLabel.bottomAnchor.constraint(equalTo: containerView.bottomAnchor)
        ])

        print("⚠️ [AdMobBanner] Showing placeholder - Add Google Mobile Ads SDK to show real ads")

        return containerView
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        // Hide ads if user purchases Pro
        if purchaseState.isPro {
            uiView.isHidden = true
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(adMobManager: adMobManager)
    }

    // MARK: - Coordinator (GADBannerViewDelegate)

    class Coordinator: NSObject {
        let adMobManager: AdMobManager

        init(adMobManager: AdMobManager) {
            self.adMobManager = adMobManager
        }

        // UNCOMMENT when Google Mobile Ads SDK is added:
        /*
        // Ad successfully loaded
        func bannerViewDidReceiveAd(_ bannerView: GADBannerView) {
            Task { @MainActor in
                adMobManager.adState = .loaded
                adMobManager.logAdImpression(adUnitID: bannerView.adUnitID ?? "unknown")
                print("✓ [AdMobBanner] Ad loaded successfully")
            }
        }

        // Ad failed to load
        func bannerView(_ bannerView: GADBannerView, didFailToReceiveAdWithError error: Error) {
            Task { @MainActor in
                let errorMessage = error.localizedDescription
                adMobManager.adState = .failed(errorMessage)
                adMobManager.logAdFailure(
                    adUnitID: bannerView.adUnitID ?? "unknown",
                    error: errorMessage
                )
                print("❌ [AdMobBanner] Failed to load ad: \(errorMessage)")
            }
        }

        // Ad recorded an impression
        func bannerViewDidRecordImpression(_ bannerView: GADBannerView) {
            adMobManager.logAdImpression(adUnitID: bannerView.adUnitID ?? "unknown")
            print("📊 [AdMobBanner] Impression recorded")
        }

        // User clicked on ad
        func bannerViewDidRecordClick(_ bannerView: GADBannerView) {
            adMobManager.logAdClick(adUnitID: bannerView.adUnitID ?? "unknown")
            print("👆 [AdMobBanner] Ad clicked")
        }

        // Ad will present full screen content
        func bannerViewWillPresentScreen(_ bannerView: GADBannerView) {
            print("📱 [AdMobBanner] Will present full screen")
        }

        // Ad did dismiss full screen content
        func bannerViewDidDismissScreen(_ bannerView: GADBannerView) {
            print("📱 [AdMobBanner] Did dismiss full screen")
        }
        */
    }
}

// MARK: - Legacy Placeholder View (deprecated)

/// Simple banner ad placeholder (legacy - use AdMobBannerViewRepresentable instead)
struct BannerAdPlaceholder: View {
    var body: some View {
        HStack {
            Text("SPONSORED AD")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AnalogTheme.textSecondary)
                .tracking(1)

            Spacer()

            Image(systemName: "rectangle.inset.filled")
                .font(.system(size: 18))
                .foregroundColor(AnalogTheme.textTertiary)
        }
        .padding(.horizontal, AnalogTheme.paddingMedium)
        .padding(.vertical, 12)
        .background(AnalogTheme.backgroundCard)
    }
}

// MARK: - Preview

#Preview {
    VStack {
        Spacer()
        BannerAdView()
    }
    .background(Color.black)
}
