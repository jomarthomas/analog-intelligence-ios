# AdMob Integration - Quick Start Guide

This is a quick reference for integrating the AdMob code that has been created. For complete setup instructions, see [ADMOB_SETUP.md](ADMOB_SETUP.md).

---

## Files Created

The following files have been created for AdMob integration:

1. **`/Purchases/AdMobManager.swift`**
   - Core AdMob SDK integration
   - Banner ad loading and lifecycle management
   - Test and production ad unit ID configuration
   - Analytics and tracking helpers

2. **`/Purchases/BannerAdView.swift`** (Updated)
   - UIViewRepresentable wrapper for GADBannerView
   - Adaptive banner sizing
   - Pro status integration (hides ads for Pro users)
   - Delegate methods for ad events

3. **`/Purchases/AdManager.swift`** (Updated)
   - Backward-compatible wrapper around AdMobManager
   - Integration point for future interstitial/rewarded ads

4. **`ADMOB_SETUP.md`**
   - Complete setup documentation
   - AdMob account creation
   - SDK installation instructions
   - Production deployment checklist

5. **`Info.plist.example`**
   - Example Info.plist configuration
   - Required AdMob keys
   - SKAdNetwork identifiers
   - App Tracking Transparency setup

---

## Current State

### What's Ready
- ✅ AdMob integration code structure
- ✅ Banner ad views for ScanView and GalleryView
- ✅ Pro status checking (ads hidden for Pro users)
- ✅ Test ad unit IDs configured
- ✅ Comprehensive documentation

### What's Commented Out
The following code is **commented out** until you add the Google Mobile Ads SDK:

- AdMob SDK initialization in `AdMobManager.swift`
- GADBannerView creation in `BannerAdView.swift`
- Delegate methods in `AdMobBannerViewRepresentable.Coordinator`

### What Shows Now
- **Free users:** Placeholder banner with text "AdMob Banner (Add SDK to show real ads)"
- **Pro users:** No banner (correctly hidden)

---

## Integration Steps

### Step 1: Add Google Mobile Ads SDK

Choose one method:

#### Option A: Swift Package Manager (Recommended)
1. In Xcode: File → Add Packages...
2. URL: `https://github.com/googleads/swift-package-manager-google-mobile-ads.git`
3. Version: Latest (10.0.0+)
4. Add to target: AnalogIntelligence

#### Option B: CocoaPods
```ruby
# Podfile
platform :ios, '14.0'
use_frameworks!

target 'AnalogIntelligence' do
  pod 'Google-Mobile-Ads-SDK', '~> 10.0'
end
```

Run: `pod install`

---

### Step 2: Configure Info.plist

Add the following keys to your `Info.plist`:

```xml
<!-- AdMob App ID (replace with your actual ID) -->
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY</string>

<!-- App Transport Security -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>

<!-- App Tracking Transparency -->
<key>NSUserTrackingUsageDescription</key>
<string>This app uses advertising ID to provide personalized ads and measure ad performance.</string>
```

**See `Info.plist.example` for complete configuration including SKAdNetwork IDs.**

---

### Step 3: Initialize AdMob SDK

Update `AnalogIntelligenceApp.swift`:

```swift
import SwiftUI

@main
struct AnalogIntelligenceApp: App {
    init() {
        // Initialize AdMob on app launch
        AdMobManager.shared.initializeSDK()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
```

**Optional:** Add App Tracking Transparency request:

```swift
import SwiftUI
import AppTrackingTransparency

@main
struct AnalogIntelligenceApp: App {
    @StateObject private var adMobManager = AdMobManager.shared

    init() {
        AdMobManager.shared.initializeSDK()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .onAppear {
                    // Request tracking permission (iOS 14+)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                        adMobManager.requestTrackingAuthorization()
                    }
                }
        }
    }
}
```

---

### Step 4: Uncomment AdMob SDK Code

After adding the SDK, uncomment the following:

#### In `AdMobManager.swift`:

**Line ~13:** Uncomment import
```swift
import GoogleMobileAds
```

**Lines ~66-74:** Uncomment SDK initialization
```swift
GADMobileAds.sharedInstance().start { status in
    Task { @MainActor in
        self.isInitialized = true
        print("✓ [AdMob] SDK initialized successfully")
        print("📱 [AdMob] Initialization status: \(status.adapterStatusesByClassName)")
    }
}
```

**Lines ~99-120:** Uncomment ATT request (optional)
```swift
import AppTrackingTransparency

if #available(iOS 14, *) {
    ATTrackingManager.requestTrackingAuthorization { status in
        // ...
    }
}
```

#### In `BannerAdView.swift`:

**Line ~14:** Uncomment import
```swift
import GoogleMobileAds
```

**Lines ~60-97:** Uncomment GADBannerView creation
```swift
// Create banner view
let bannerView = GADBannerView()
bannerView.adUnitID = adMobManager.currentBannerAdUnitID
// ... rest of implementation
```

**Lines ~141-183:** Uncomment delegate methods
```swift
func bannerViewDidReceiveAd(_ bannerView: GADBannerView) {
    // ...
}

func bannerView(_ bannerView: GADBannerView, didFailToReceiveAdWithError error: Error) {
    // ...
}
// ... other delegate methods
```

---

### Step 5: Get AdMob App ID and Ad Unit IDs

1. **Create AdMob Account**
   - Go to [admob.google.com](https://admob.google.com)
   - Sign up with Google account

2. **Register Your App**
   - Add iOS app
   - Get **App ID** (format: `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`)

3. **Create Ad Units**
   - Create "Banner" ad unit for Scan View
   - Create "Banner" ad unit for Gallery View
   - Get **Ad Unit IDs** (format: `ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY`)

4. **Update Configuration**
   - Add App ID to `Info.plist` → `GADApplicationIdentifier`
   - Add Ad Unit ID to `AdMobManager.swift` → `productionBannerAdUnitID`

**For detailed instructions, see [ADMOB_SETUP.md](ADMOB_SETUP.md) sections 3-4.**

---

### Step 6: Test Integration

1. **Build and Run**
   - Test on device or simulator
   - You should see **test ads** (DEBUG build uses test ad unit IDs)

2. **Verify Console Logs**
   ```
   ✓ [AdMob] SDK initialized successfully
   📱 [AdMobBanner] Loading ad with unit ID: ca-app-pub-3940256099942544/2934735716
   ✓ [AdMobBanner] Ad loaded successfully
   ```

3. **Test Scenarios**
   - ✅ Ads appear at bottom of ScanView (free users)
   - ✅ Ads appear at bottom of GalleryView (free users)
   - ✅ Ads are hidden when Pro is purchased
   - ✅ Ads load without errors

---

### Step 7: Production Preparation

Before releasing to App Store:

1. **Replace Test Ad Unit IDs**
   - In `AdMobManager.swift`
   - Update `productionBannerAdUnitID` with your actual Ad Unit ID

2. **Update Info.plist**
   - Add your actual AdMob App ID
   - Add all SKAdNetwork IDs from [Google's list](https://developers.google.com/admob/ios/3p-sdk-support)

3. **Test on RELEASE Build**
   - Create Archive build
   - Verify production ads load
   - Test on TestFlight

4. **Update Privacy Policy**
   - Disclose third-party ad networks
   - Explain data collection for ads

5. **Configure App Store Privacy Label**
   - Declare advertising data collection
   - List: Device ID, Usage Data, Advertising Data

**See [ADMOB_SETUP.md](ADMOB_SETUP.md) section 10 for complete checklist.**

---

## Current Ad Placements

### ScanView (Free Tier Only)
- **Location:** Bottom of screen
- **Type:** Banner (adaptive size)
- **Code:** Lines 166-169 in `/UI/Scan/ScanView.swift`

```swift
if !purchaseState.isPro {
    BannerAdView()
        .padding(.bottom)
}
```

### GalleryView (Free Tier Only)
- **Location:** Bottom of screen
- **Type:** Banner (adaptive size)
- **Status:** ✅ Ready (BannerAdView can be added)

**To add banner to GalleryView:**

Update `/UI/Gallery/GalleryView.swift`:

```swift
var body: some View {
    NavigationView {
        VStack(spacing: 0) {
            // Existing content
            ZStack {
                // ... existing ZStack content
            }

            // Add banner ad at bottom
            if !purchaseState.isPro {
                BannerAdView()
            }
        }
        .navigationTitle("Gallery")
        // ... rest of configuration
    }
}
```

---

## Troubleshooting

### Ads Not Showing After SDK Installation

**Check:**
1. SDK installed correctly (check Xcode project navigator)
2. Imports uncommented (`import GoogleMobileAds`)
3. GADApplicationIdentifier in Info.plist
4. Console shows no errors
5. Network connection available

### Common Errors

**"GADApplicationIdentifier not found"**
- Add to Info.plist with your AdMob App ID

**"Invalid ad unit ID"**
- Verify format: `ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY`
- Check for typos

**Test ads not showing**
- Wait a few minutes after creating ad units
- Verify using correct test ad unit ID
- Check network connection

**For more troubleshooting, see [ADMOB_SETUP.md](ADMOB_SETUP.md) section 11.**

---

## Configuration Summary

### Test Configuration (DEBUG builds)
- **Ad Unit ID:** `ca-app-pub-3940256099942544/2934735716` (Google's test ID)
- **Shows:** Test banner ads
- **Purpose:** Development and testing

### Production Configuration (RELEASE builds)
- **Ad Unit ID:** Your production ID from AdMob
- **Shows:** Real ads (after AdMob approval)
- **Purpose:** App Store release

### Build Configuration Logic
```swift
var currentBannerAdUnitID: String {
    #if DEBUG
    return testBannerAdUnitID  // Test ads
    #else
    return productionBannerAdUnitID  // Real ads
    #endif
}
```

---

## Next Steps

1. ✅ **Complete:** AdMob code integration
2. ⏭️ **Next:** Add Google Mobile Ads SDK to project
3. ⏭️ **Next:** Create AdMob account and get IDs
4. ⏭️ **Next:** Configure Info.plist
5. ⏭️ **Next:** Uncomment SDK code
6. ⏭️ **Next:** Test with test ads
7. ⏭️ **Next:** Replace with production IDs
8. ⏭️ **Next:** Submit to App Store

---

## Additional Resources

- **Complete Setup Guide:** [ADMOB_SETUP.md](ADMOB_SETUP.md)
- **Info.plist Example:** [Info.plist.example](Info.plist.example)
- **AdMob Documentation:** https://developers.google.com/admob/ios/quick-start
- **SKAdNetwork IDs:** https://developers.google.com/admob/ios/3p-sdk-support

---

## Questions?

If you encounter issues:
1. Check console logs for error messages
2. Review [ADMOB_SETUP.md](ADMOB_SETUP.md) troubleshooting section
3. Verify all configuration steps completed
4. Search [Stack Overflow - AdMob iOS](https://stackoverflow.com/questions/tagged/google-mobile-ads)
5. Contact [AdMob Support](https://support.google.com/admob)

---

**Created:** March 2026
**AdMob SDK Version:** 10.0+
**iOS Deployment Target:** 14.0+
