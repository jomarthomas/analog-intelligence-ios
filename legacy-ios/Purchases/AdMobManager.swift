//
//  AdMobManager.swift
//  Analog Intelligence
//
//  Google AdMob SDK integration for banner ads
//  Manages ad loading, display, and lifecycle events
//
//  SETUP REQUIRED:
//  1. Add Google Mobile Ads SDK via CocoaPods or SPM
//  2. Add GADApplicationIdentifier to Info.plist
//  3. Replace test ad unit IDs with production IDs before release
//

import Foundation
import SwiftUI

// IMPORTANT: Uncomment these imports after adding Google Mobile Ads SDK
// import GoogleMobileAds

/// Manages Google AdMob integration for the app
@MainActor
class AdMobManager: NSObject, ObservableObject {
    /// Singleton instance
    static let shared = AdMobManager()

    /// Whether AdMob SDK has been initialized
    @Published private(set) var isInitialized: Bool = false

    /// Current ad loading state
    @Published var adState: AdLoadState = .notLoaded

    /// Reference to purchase state to check Pro status
    private let purchaseState = PurchaseState.shared

    // MARK: - Test Ad Unit IDs
    // These are Google's official test ad unit IDs - they will show test ads
    // IMPORTANT: Replace these with your production Ad Unit IDs before releasing to App Store

    /// Test Banner Ad Unit ID (shows test ads)
    /// Production: Replace with your ad unit ID from AdMob console
    private let testBannerAdUnitID = "ca-app-pub-3940256099942544/2934735716"

    /// Production Banner Ad Unit ID
    /// TODO: Get this from AdMob console after setting up your app
    /// Format: "ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY"
    private let productionBannerAdUnitID = "YOUR_BANNER_AD_UNIT_ID_HERE"

    /// Current ad unit ID (switches based on build configuration)
    var currentBannerAdUnitID: String {
        #if DEBUG
        return testBannerAdUnitID
        #else
        // In production, check if production ID is configured
        if productionBannerAdUnitID == "YOUR_BANNER_AD_UNIT_ID_HERE" {
            print("⚠️ [AdMob] WARNING: Using test ad unit ID in production build!")
            print("⚠️ [AdMob] Replace productionBannerAdUnitID with your actual Ad Unit ID")
            return testBannerAdUnitID
        }
        return productionBannerAdUnitID
        #endif
    }

    // MARK: - Initialization

    private override init() {
        super.init()
        print("📱 [AdMob] Manager initialized")
    }

    /// Initialize the Google Mobile Ads SDK
    /// Call this early in app lifecycle (typically in App.init or AppDelegate)
    func initializeSDK() {
        guard !isInitialized else {
            print("📱 [AdMob] SDK already initialized")
            return
        }

        print("📱 [AdMob] Initializing Google Mobile Ads SDK...")

        // UNCOMMENT when Google Mobile Ads SDK is added:
        /*
        GADMobileAds.sharedInstance().start { status in
            Task { @MainActor in
                self.isInitialized = true
                print("✓ [AdMob] SDK initialized successfully")
                print("📱 [AdMob] Initialization status: \(status.adapterStatusesByClassName)")
            }
        }
        */

        // TEMPORARY: Simulate initialization for development without SDK
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.isInitialized = true
            print("⚠️ [AdMob] SIMULATED initialization (SDK not yet added)")
            print("⚠️ [AdMob] Add Google Mobile Ads SDK to see real ads")
        }
    }

    /// Request app tracking transparency (required for personalized ads)
    /// Call this before showing ads, typically after app launch
    func requestTrackingAuthorization() {
        #if !targetEnvironment(simulator)
        // UNCOMMENT when implementing ATT:
        /*
        import AppTrackingTransparency

        if #available(iOS 14, *) {
            ATTrackingManager.requestTrackingAuthorization { status in
                Task { @MainActor in
                    switch status {
                    case .authorized:
                        print("✓ [AdMob] Tracking authorized - personalized ads enabled")
                    case .denied:
                        print("○ [AdMob] Tracking denied - non-personalized ads only")
                    case .restricted:
                        print("○ [AdMob] Tracking restricted")
                    case .notDetermined:
                        print("○ [AdMob] Tracking not determined")
                    @unknown default:
                        break
                    }
                }
            }
        }
        */
        #endif

        print("📱 [AdMob] Tracking authorization requested")
    }

    // MARK: - Ad Loading State

    /// Check if ads should be shown based on Pro status
    var shouldShowAds: Bool {
        return !purchaseState.isPro
    }

    /// Update ad visibility when Pro status changes
    func updateAdVisibility() {
        if !shouldShowAds {
            adState = .hidden
            print("✓ [AdMob] Ads hidden - user has Pro")
        } else {
            print("📱 [AdMob] Ads should be shown - free tier user")
        }
    }
}

// MARK: - Ad Load State

/// Represents the current state of ad loading
enum AdLoadState: Equatable {
    case notLoaded
    case loading
    case loaded
    case failed(String)
    case hidden

    var canShowAd: Bool {
        return self == .loaded
    }

    var isLoading: Bool {
        return self == .loading
    }
}

// MARK: - Banner Ad Delegate Protocol

/// Protocol for handling banner ad events
protocol AdMobBannerDelegate: AnyObject {
    func bannerDidLoad()
    func bannerDidFail(error: String)
    func bannerDidRecordImpression()
    func bannerDidRecordClick()
    func bannerWillPresentScreen()
    func bannerDidDismissScreen()
}

// MARK: - Ad Size Helpers

extension AdMobManager {
    /// Get adaptive banner size for the current device
    /// - Parameter width: Width of the container
    /// - Returns: Adaptive banner size
    func adaptiveBannerSize(width: CGFloat) -> CGSize {
        // Standard banner sizes:
        // - Banner: 320x50
        // - Large Banner: 320x100
        // - Medium Rectangle: 300x250
        // - Full Banner: 468x60
        // - Leaderboard: 728x90
        // - Smart Banner: Full width x 50/90 (adaptive)

        // For Analog Intelligence, we use adaptive banners
        // These automatically adjust to device width

        // UNCOMMENT when SDK is added:
        /*
        let frame = CGRect(x: 0, y: 0, width: width, height: 0)
        return GADCurrentOrientationAnchoredAdaptiveBannerAdSizeWithWidth(width).size
        */

        // Fallback: Standard banner size
        return CGSize(width: width, height: 50)
    }

    /// Standard banner height
    var standardBannerHeight: CGFloat {
        return 50
    }

    /// Large banner height
    var largeBannerHeight: CGFloat {
        return 100
    }
}

// MARK: - Analytics & Tracking

extension AdMobManager {
    /// Log ad impression event
    func logAdImpression(adUnitID: String) {
        print("📊 [AdMob] Ad impression recorded: \(adUnitID)")
        // TODO: Add analytics tracking here if needed
        // Example: Analytics.logEvent("ad_impression", parameters: ["ad_unit": adUnitID])
    }

    /// Log ad click event
    func logAdClick(adUnitID: String) {
        print("📊 [AdMob] Ad clicked: \(adUnitID)")
        // TODO: Add analytics tracking here if needed
        // Example: Analytics.logEvent("ad_click", parameters: ["ad_unit": adUnitID])
    }

    /// Log ad load failure
    func logAdFailure(adUnitID: String, error: String) {
        print("❌ [AdMob] Ad failed to load: \(adUnitID) - \(error)")
        // TODO: Add analytics tracking here if needed
        // Example: Analytics.logEvent("ad_load_failed", parameters: ["ad_unit": adUnitID, "error": error])
    }
}

// MARK: - Testing Helpers

extension AdMobManager {
    /// Check if using test ads
    var isUsingTestAds: Bool {
        #if DEBUG
        return true
        #else
        return currentBannerAdUnitID == testBannerAdUnitID
        #endif
    }

    /// Get configuration info for debugging
    var configurationInfo: String {
        """
        AdMob Configuration:
        - SDK Initialized: \(isInitialized)
        - Should Show Ads: \(shouldShowAds)
        - Using Test Ads: \(isUsingTestAds)
        - Banner Ad Unit ID: \(currentBannerAdUnitID)
        - Ad State: \(adState)
        """
    }

    /// Print configuration for debugging
    func printConfiguration() {
        print("📱 [AdMob] \(configurationInfo)")
    }
}
