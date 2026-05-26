# Monetization System - Implementation Guide

This folder contains the complete monetization system for Analog Intelligence, including StoreKit 2 integration and free tier limitations.

## Files Overview

### Core Purchase System

#### `ProductIdentifiers.swift`
- Defines the Pro Unlock product ID: `com.analogintelligence.pro.unlock`
- Price: $9.99 (one-time purchase)
- Lists all Pro features with descriptions
- Contains `ProFeature` enum for feature management

#### `PurchaseState.swift`
- `@MainActor` observable class managing Pro status
- Singleton pattern: `PurchaseState.shared`
- Persists Pro status using UserDefaults
- Publishes `isPro`, `purchaseStatus`, and `availableProducts`
- Tracks purchase states: unknown, notPurchased, purchasing, purchased, failed, cancelled, pending, restored

#### `StoreKitManager.swift`
- Full StoreKit 2 implementation using async/await
- Singleton pattern: `StoreKitManager.shared`
- Key features:
  - Load products from App Store
  - Purchase Pro Unlock
  - Restore purchases
  - Transaction verification
  - Automatic transaction updates listener
  - Entitlement checking

#### `ProFeatureGate.swift`
- Helper struct for checking Pro access
- Static methods: `isPro`, `isFree`, `hasAccess(to:)`
- SwiftUI view modifiers: `.proFeatureGate()`, `.showIfPro()`, `.showIfFree()`
- Includes `ProUnlockView` - complete upgrade UI with purchase flow

### Free Tier Limitations

#### `WatermarkRenderer.swift`
- Adds watermark to exported images for free users
- Three watermark styles:
  - `addWatermark()` - Center watermark with subtitle
  - `addDiagonalWatermark()` - Diagonal pattern across image
  - `addCornerWatermark()` - Minimal corner placement
- Automatically skips watermark for Pro users
- Uses `ProFeatureGate.watermarkOpacity` for consistent opacity

#### `ResolutionLimiter.swift`
- Limits export resolution for free users
- Free tier: 1920x1080 (HD)
- Pro tier: 7680x4320 (8K - effectively unlimited)
- Features:
  - `limitResolution(of:)` - Resize images to allowed resolution
  - `calculateTargetSize()` - Maintain aspect ratio
  - `getResolutionInfo()` - Get detailed resolution info
  - `ResolutionInfoView` - SwiftUI view showing resolution limits with upgrade prompt

#### `AdManager.swift`
- Phase 1: Placeholder implementation
- Phase 2: Ready for integration with AdMob, Apple Search Ads, etc.
- Features:
  - `BannerAdView` - Bottom banner ads
  - `InterstitialAdView` - Full-screen ads
  - `FloatingAdBanner` - Dismissible floating banner
  - View modifiers: `.withBannerAd()`, `.withFloatingAdBanner()`
- Auto-hides ads for Pro users

## Integration Steps

### 1. App Store Connect Setup

1. Log in to App Store Connect
2. Go to your app → Features → In-App Purchases
3. Create a new In-App Purchase:
   - Type: **Non-Consumable**
   - Product ID: `com.analogintelligence.pro.unlock`
   - Reference Name: `Pro Unlock`
   - Price: **$9.99** (Tier 10)

4. Add localized information:
   - Display Name: `Analog Intelligence Pro`
   - Description: `Unlock all premium features including no watermark, no ads, full resolution export, AI processing, and Insights tab`

5. Submit for review or enable for sandbox testing

### 2. Xcode Configuration

1. Add StoreKit Configuration file (for testing):
   - File → New → File → StoreKit Configuration File
   - Add product: `com.analogintelligence.pro.unlock` ($9.99, Non-Consumable)

2. Enable StoreKit capability:
   - Target → Signing & Capabilities → + Capability → In-App Purchase

3. Set StoreKit configuration:
   - Product → Scheme → Edit Scheme → Run → Options
   - StoreKit Configuration: Select your .storekit file

### 3. App Integration

#### In your App file:

```swift
import SwiftUI

@main
struct AnalogIntelligenceApp: App {
    @StateObject private var purchaseState = PurchaseState.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(purchaseState)
                .task {
                    // Initialize StoreKit on app launch
                    await StoreKitManager.shared.loadProducts()
                }
        }
    }
}
```

#### In your Scan view:

```swift
struct ScanView: View {
    @StateObject private var purchaseState = PurchaseState.shared

    var body: some View {
        VStack {
            // Camera preview
            CameraPreviewView()

            // Add banner ad for free users
        }
        .withBannerAd() // Adds ad banner at bottom
    }
}
```

#### In your Gallery view:

```swift
struct GalleryView: View {
    var body: some View {
        // Grid of images
        ScrollView {
            LazyVGrid(columns: columns) {
                ForEach(images) { image in
                    ImageCell(image: image)
                }
            }
        }
        .toolbar {
            // Contact sheet is Pro-only
            if ProFeatureGate.isPro {
                ToolbarItem {
                    Button("Contact Sheet") {
                        generateContactSheet()
                    }
                }
            }
        }
    }
}
```

#### In your Insights tab:

```swift
struct InsightsView: View {
    @State private var showUpgrade = false

    var body: some View {
        Group {
            if ProFeatureGate.isPro {
                // Show insights content
                InsightsContentView()
            } else {
                // Show Pro gate
                ProFeatureGateView(feature: .insights) {
                    showUpgrade = true
                }
            }
        }
        .sheet(isPresented: $showUpgrade) {
            ProUnlockView()
        }
    }
}
```

#### When exporting images:

```swift
func exportImage(_ image: UIImage) {
    // 1. Limit resolution
    let limitedImage = ResolutionLimiter.limitResolution(of: image)

    // 2. Add watermark if free user
    let finalImage = WatermarkRenderer.addWatermark(to: limitedImage)

    // 3. Export
    UIImageWriteToSavedPhotosAlbum(finalImage, nil, nil, nil)
}
```

#### Settings view with restore purchases:

```swift
struct SettingsView: View {
    @StateObject private var purchaseState = PurchaseState.shared
    @State private var showUpgrade = false

    var body: some View {
        Form {
            Section("Subscription") {
                if purchaseState.isPro {
                    HStack {
                        Image(systemName: "crown.fill")
                            .foregroundColor(.yellow)
                        Text("Pro Active")
                    }
                } else {
                    Button("Upgrade to Pro") {
                        showUpgrade = true
                    }

                    Button("Restore Purchases") {
                        Task {
                            await StoreKitManager.shared.restorePurchases()
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $showUpgrade) {
            ProUnlockView()
        }
    }
}
```

## Feature Gating Reference

### Free Tier Access
- ✅ Scan tab (with watermark and ads)
- ✅ Gallery tab (with limitations)
- ✅ Basic adjustments (Exposure, Warmth, Contrast)
- ✅ Export to Photos (HD resolution with watermark)
- ✅ Batch scanning

### Pro Tier Exclusive
- 🔒 No watermark on exports
- 🔒 No advertisements
- 🔒 Full resolution export (up to 8K)
- 🔒 Insights tab with histogram analysis
- 🔒 AI Color Reconstruction (Phase 2)
- 🔒 AI Dust Removal (Phase 2)
- 🔒 Contact sheet generator

## Testing

### Sandbox Testing

1. Create sandbox test accounts in App Store Connect:
   - Users and Access → Sandbox Testers → +

2. Test purchase flow:
   - Sign out of your Apple ID in Settings → App Store
   - Run app in Xcode
   - Attempt to purchase Pro
   - Sign in with sandbox tester account

3. Test scenarios:
   - ✓ Successful purchase
   - ✓ Cancelled purchase
   - ✓ Restore purchases
   - ✓ Multiple purchases (should use existing)
   - ✓ Verify Pro features unlock
   - ✓ Verify free tier limitations apply

### Key Test Cases

```swift
// Test 1: Free user sees watermark
let image = UIImage(named: "test")!
let watermarked = WatermarkRenderer.addWatermark(to: image)
// Verify watermark is visible

// Test 2: Pro user doesn't see watermark
PurchaseState.shared.updateProStatus(true)
let noWatermark = WatermarkRenderer.addWatermark(to: image)
// Verify no watermark

// Test 3: Resolution limiting
let largeImage = UIImage(named: "4k_test")! // 3840x2160
let limited = ResolutionLimiter.limitResolution(of: largeImage)
// Free: Should be 1920x1080
// Pro: Should be 3840x2160

// Test 4: Feature gate
XCTAssertFalse(ProFeatureGate.hasAccess(to: .insights))
PurchaseState.shared.updateProStatus(true)
XCTAssertTrue(ProFeatureGate.hasAccess(to: .insights))
```

## Best Practices

1. **Always check Pro status before applying limitations**:
   ```swift
   if ProFeatureGate.shouldAddWatermark {
       image = WatermarkRenderer.addWatermark(to: image)
   }
   ```

2. **Use view modifiers for consistent UI**:
   ```swift
   InsightsTab()
       .showIfPro()
   ```

3. **Show upgrade prompts at appropriate times**:
   - When accessing Pro features
   - After successful exports (gentle reminder)
   - In Settings

4. **Handle purchase states gracefully**:
   ```swift
   switch purchaseState.purchaseStatus {
   case .purchasing:
       ProgressView()
   case .failed(let error):
       Text("Error: \(error)")
   case .purchased:
       Text("Success!")
   default:
       EmptyView()
   }
   ```

5. **Persist Pro status**:
   - Already handled automatically by `PurchaseState`
   - Status persists across app launches

## Phase 2 Enhancements

When ready to add real ads:

1. Add AdMob SDK to project:
   ```swift
   // Podfile or SPM
   pod 'Google-Mobile-Ads-SDK'
   ```

2. Update `AdManager.swift`:
   ```swift
   import GoogleMobileAds

   func loadAds() {
       GADMobileAds.sharedInstance().start()
       bannerView = GADBannerView(adSize: GADAdSizeBanner)
       // Configure and load
   }
   ```

3. Add AI features behind Pro gate:
   ```swift
   if ProFeatureGate.hasAccess(to: .aiColorReconstruction) {
       applyAIColorCorrection()
   }
   ```

## Support & Troubleshooting

### Common Issues

**Products not loading**:
- Verify product ID matches App Store Connect
- Check StoreKit configuration file
- Ensure sandbox tester is signed in
- Clear derived data and rebuild

**Purchase not restoring**:
- Call `StoreKitManager.shared.restorePurchases()`
- Verify transaction exists in sandbox
- Check console logs for verification errors

**Pro features not unlocking**:
- Check `PurchaseState.shared.isPro`
- Verify transaction listener is running
- Call `updateCustomerProductStatus()` manually

### Debug Logging

All managers include console logging:
- ✓ Success messages
- ✗ Error messages
- ○ Informational messages

Enable verbose logging by checking Xcode console when testing.

## License & Credits

Part of the Analog Intelligence iOS app.
Implements StoreKit 2 with modern Swift concurrency.
