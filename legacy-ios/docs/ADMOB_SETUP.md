# Google AdMob Setup Guide

Complete guide for integrating Google AdMob SDK into Analog Intelligence iOS app.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Create AdMob Account](#create-admob-account)
4. [Register Your App](#register-your-app)
5. [Install Google Mobile Ads SDK](#install-google-mobile-ads-sdk)
6. [Configure Info.plist](#configure-infoplist)
7. [Initialize AdMob SDK](#initialize-admob-sdk)
8. [Configure Ad Unit IDs](#configure-ad-unit-ids)
9. [Testing Ads](#testing-ads)
10. [Production Deployment](#production-deployment)
11. [Troubleshooting](#troubleshooting)

---

## Overview

Analog Intelligence uses Google AdMob to display banner ads to free tier users. Ads are automatically hidden when users purchase Pro.

**Ad Placements:**
- ScanView: Banner at bottom (free tier only)
- GalleryView: Banner at bottom (free tier only)

**Ad Types Implemented:**
- Banner Ads (adaptive size)

**Future Consideration:**
- Interstitial ads (optional)
- Rewarded ads (optional - could unlock temporary features)

---

## Prerequisites

- Xcode 14.0 or later
- iOS 14.0+ deployment target
- Active Apple Developer account
- Google account

---

## Create AdMob Account

### 1. Sign Up for AdMob

1. Go to [Google AdMob](https://admob.google.com/)
2. Click "Sign Up" or "Get Started"
3. Sign in with your Google account
4. Accept the AdMob Terms of Service

### 2. Complete Account Setup

1. Select account type: **Individual** or **Business**
2. Enter account information:
   - Country/region
   - Time zone
   - Currency
3. Accept AdMob program policies
4. Verify your account via email

---

## Register Your App

### 1. Add Your iOS App

1. From AdMob dashboard, click **Apps** → **Add App**
2. Select **iOS** platform
3. Choose **Yes** if app is published, or **No** if it's new
4. Enter app information:
   - **App Name:** Analog Intelligence
   - **Bundle ID:** `com.analogintelligence.app` (use your actual bundle ID)
   - **App Store URL:** (if published)

### 2. App Registration Confirmation

After registration, you'll receive:
- **App ID:** `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`

**IMPORTANT:** Save this App ID - you'll need it for Info.plist

---

## Create Ad Units

### 1. Create Banner Ad Unit

1. In AdMob, select your app
2. Click **Ad Units** → **Add Ad Unit**
3. Select **Banner** ad format
4. Configure banner settings:
   - **Ad unit name:** "Scan View Banner" (or descriptive name)
   - **Ad type:** Display ads
   - **Ad size:** Smart banner (adaptive)
5. Click **Create Ad Unit**

### 2. Save Ad Unit IDs

You'll receive an **Ad Unit ID** for each placement:
- Format: `ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY`
- Example: `ca-app-pub-3940256099942544/2934735716` (test ID)

**Create separate ad units for:**
- Scan View Banner
- Gallery View Banner

**Why separate units?** Track performance per placement and optimize independently.

---

## Install Google Mobile Ads SDK

Choose **one** installation method:

### Option A: Swift Package Manager (Recommended)

1. In Xcode, select **File** → **Add Packages...**
2. Enter package URL:
   ```
   https://github.com/googleads/swift-package-manager-google-mobile-ads.git
   ```
3. Select version: **Latest** (or specify minimum: 10.0.0)
4. Click **Add Package**
5. Select target: **AnalogIntelligence**
6. Click **Add Package**

### Option B: CocoaPods

1. Create/edit `Podfile` in project root:
   ```ruby
   platform :ios, '14.0'
   use_frameworks!

   target 'AnalogIntelligence' do
     pod 'Google-Mobile-Ads-SDK', '~> 10.0'
   end
   ```

2. Install pods:
   ```bash
   pod install
   ```

3. **Important:** From now on, use `AnalogIntelligence.xcworkspace` instead of `.xcodeproj`

### Option C: Manual Framework Integration

1. Download SDK from [Google Mobile Ads SDK Releases](https://developers.google.com/admob/ios/download)
2. Drag `GoogleMobileAds.xcframework` to Xcode project
3. In target settings → **General** → **Frameworks, Libraries, and Embedded Content**
4. Ensure framework is set to **Embed & Sign**

---

## Configure Info.plist

### 1. Add GADApplicationIdentifier

Open `Info.plist` and add:

```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY</string>
```

**Replace** `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY` with your actual **App ID** from AdMob dashboard.

**Example:**
```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-3940256099942544~1458002511</string>
```

### 2. Add App Transport Security (ATS) Configuration

Add ATS settings to allow AdMob to load ads:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
    <key>NSAllowsArbitraryLoadsForMedia</key>
    <true/>
    <key>NSAllowsArbitraryLoadsInWebContent</key>
    <true/>
</dict>
```

### 3. Add App Tracking Transparency (ATT) Description

For iOS 14+, add ATT usage description:

```xml
<key>NSUserTrackingUsageDescription</key>
<string>This app uses advertising ID to provide personalized ads and measure ad performance.</string>
```

**Customize** the message to fit your app's privacy policy.

### 4. Add SKAdNetwork Identifiers

AdMob requires SKAdNetwork IDs for attribution. Add to Info.plist:

```xml
<key>SKAdNetworkItems</key>
<array>
    <!-- Google AdMob -->
    <dict>
        <key>SKAdNetworkIdentifier</key>
        <string>cstr6suwn9.skadnetwork</string>
    </dict>
    <!-- Add more ad network IDs as needed -->
    <!-- Full list: https://developers.google.com/admob/ios/3p-sdk-support -->
</array>
```

**Full SKAdNetwork list:** Download from [Google's documentation](https://developers.google.com/admob/ios/3p-sdk-support)

### 5. Complete Info.plist Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- ... other keys ... -->

    <!-- AdMob App ID -->
    <key>GADApplicationIdentifier</key>
    <string>ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY</string>

    <!-- App Transport Security -->
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsArbitraryLoads</key>
        <true/>
        <key>NSAllowsArbitraryLoadsForMedia</key>
        <true/>
        <key>NSAllowsArbitraryLoadsInWebContent</key>
        <true/>
    </dict>

    <!-- App Tracking Transparency -->
    <key>NSUserTrackingUsageDescription</key>
    <string>This app uses advertising ID to provide personalized ads and measure ad performance.</string>

    <!-- SKAdNetwork IDs -->
    <key>SKAdNetworkItems</key>
    <array>
        <dict>
            <key>SKAdNetworkIdentifier</key>
            <string>cstr6suwn9.skadnetwork</string>
        </dict>
        <!-- Add more IDs from Google's list -->
    </array>
</dict>
</plist>
```

---

## Initialize AdMob SDK

### 1. Update App Entry Point

Edit `AnalogIntelligenceApp.swift` (or your main App struct):

```swift
import SwiftUI
import GoogleMobileAds

@main
struct AnalogIntelligenceApp: App {
    init() {
        // Initialize AdMob SDK on app launch
        AdMobManager.shared.initializeSDK()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

### 2. Request App Tracking Transparency (Optional but Recommended)

For better ad performance, request tracking permission:

```swift
import SwiftUI
import GoogleMobileAds
import AppTrackingTransparency

@main
struct AnalogIntelligenceApp: App {
    @StateObject private var adMobManager = AdMobManager.shared

    init() {
        // Initialize AdMob SDK
        AdMobManager.shared.initializeSDK()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    // Request tracking permission after app appears
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                        adMobManager.requestTrackingAuthorization()
                    }
                }
        }
    }
}
```

---

## Configure Ad Unit IDs

### 1. Open AdMobManager.swift

Locate the ad unit ID properties:

```swift
/// Test Banner Ad Unit ID (shows test ads)
private let testBannerAdUnitID = "ca-app-pub-3940256099942544/2934735716"

/// Production Banner Ad Unit ID
private let productionBannerAdUnitID = "YOUR_BANNER_AD_UNIT_ID_HERE"
```

### 2. Replace Production Ad Unit ID

Update with your actual Ad Unit ID from AdMob:

```swift
/// Production Banner Ad Unit ID
private let productionBannerAdUnitID = "ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY"
```

### 3. Build Configuration

The app automatically uses:
- **Test ads** in DEBUG builds
- **Production ads** in RELEASE builds

Verify in `AdMobManager.swift`:

```swift
var currentBannerAdUnitID: String {
    #if DEBUG
    return testBannerAdUnitID
    #else
    return productionBannerAdUnitID
    #endif
}
```

---

## Testing Ads

### 1. Uncomment SDK Code

In the following files, uncomment the AdMob SDK code:

**AdMobManager.swift:**
```swift
// UNCOMMENT after adding SDK:
import GoogleMobileAds

// In initializeSDK():
GADMobileAds.sharedInstance().start { status in
    // ...
}
```

**BannerAdView.swift:**
```swift
// UNCOMMENT after adding SDK:
import GoogleMobileAds

// In AdMobBannerViewRepresentable:
let bannerView = GADBannerView()
// ... rest of implementation
```

### 2. Test on Device or Simulator

1. Build and run app
2. Navigate to Scan or Gallery view
3. Verify test ads appear at bottom
4. Check console for AdMob logs:
   ```
   ✓ [AdMob] SDK initialized successfully
   📱 [AdMobBanner] Loading ad with unit ID: ca-app-pub-3940256099942544/2934735716
   ✓ [AdMobBanner] Ad loaded successfully
   ```

### 3. Add Test Device IDs (Optional)

To always show test ads on your device:

1. Run app and check console for device ID:
   ```
   <Google> To get test ads on this device, set: GADMobileAds.sharedInstance.requestConfiguration.testDeviceIdentifiers = @[ @"DEVICE_ID_HERE" ];
   ```

2. Add to `AdMobBannerViewRepresentable`:
   ```swift
   GADMobileAds.sharedInstance().requestConfiguration.testDeviceIdentifiers = ["YOUR_DEVICE_ID"]
   ```

### 4. Verify Ad Behavior

Test the following scenarios:

- [ ] Ads appear for free tier users
- [ ] Ads are hidden for Pro users
- [ ] Ads load without errors
- [ ] Ad clicks work correctly
- [ ] App handles ad load failures gracefully

---

## Production Deployment

### Pre-Launch Checklist

Before submitting to App Store:

- [ ] **Replace test ad unit IDs** with production IDs in `AdMobManager.swift`
- [ ] **Update Info.plist** with actual AdMob App ID
- [ ] **Test on RELEASE build** to verify production ads load
- [ ] **Remove test device IDs** from code
- [ ] **Verify ATT prompt** appears on first launch (iOS 14+)
- [ ] **Test Pro purchase** - confirm ads hide immediately
- [ ] **Review AdMob policies** - ensure compliance
- [ ] **Configure ad filters** in AdMob dashboard (block inappropriate ads)
- [ ] **Set up ad mediation** (optional - for better fill rates)
- [ ] **Enable COPPA compliance** if targeting children
- [ ] **Review and update privacy policy** with ad disclosure

### App Store Review Considerations

1. **Privacy Nutrition Label**
   - Declare advertising data collection
   - List: Device ID, Usage Data, Advertising Data

2. **Privacy Policy**
   - Disclose third-party ad networks
   - Explain data collection for ads
   - Link in app and App Store listing

3. **Ad Content**
   - AdMob uses content filtering
   - Configure in AdMob dashboard → Blocking Controls
   - Block sensitive categories if needed

### Monitoring Performance

After launch, monitor in AdMob dashboard:

1. **Impressions** - Number of ad views
2. **Click-through rate (CTR)** - Ad engagement
3. **eCPM** - Effective cost per thousand impressions
4. **Fill rate** - Percentage of successful ad requests
5. **Revenue** - Earnings from ads

**Optimization Tips:**
- Test different ad placements
- Use adaptive banner sizes
- Enable mediation for better fill rates
- Monitor and block low-performing ad networks

---

## Advanced Features (Optional)

### 1. Interstitial Ads

Show full-screen ads at natural transition points:

**When to show:**
- After user completes scanning a full roll
- After exporting batch of images
- Periodically (e.g., every 5th scan)

**Implementation:**
1. Create interstitial ad unit in AdMob
2. Add interstitial logic to `AdMobManager.swift`
3. Load ads in advance, show at appropriate times

### 2. Rewarded Ads

Allow users to watch ads for rewards:

**Possible rewards:**
- Temporary Pro feature access (e.g., 1 high-res export)
- Remove watermark for single image
- Unlock AI processing for one image

**Implementation:**
1. Create rewarded ad unit in AdMob
2. Add rewarded ad logic to `AdMobManager.swift`
3. Implement reward tracking and redemption

### 3. Ad Mediation

Increase revenue by using multiple ad networks:

**Benefits:**
- Higher fill rates
- Better eCPM through competition
- Fallback options if one network fails

**Setup:**
1. In AdMob, go to Mediation
2. Add mediation groups
3. Configure waterfall or bidding
4. Add adapter SDKs (e.g., Meta, AppLovin)

---

## Troubleshooting

### Ads Not Showing

**Check:**
- [ ] AdMob SDK installed correctly
- [ ] GADApplicationIdentifier in Info.plist
- [ ] Ad unit ID is correct
- [ ] Network connection available
- [ ] User is on free tier (not Pro)
- [ ] Console shows no errors

**Common Issues:**

1. **"Ad failed to load" error**
   - Check ad unit ID is correct
   - Verify Info.plist GADApplicationIdentifier
   - Check network connection
   - Review AdMob account status

2. **Test ads not showing**
   - Ensure using test ad unit IDs
   - Add device as test device in AdMob
   - Wait a few minutes after creating ad units

3. **Production ads not showing**
   - New ad units take time to serve ads (up to 24 hours)
   - Check payment/tax info in AdMob
   - Verify app is approved in AdMob
   - Check ad inventory availability

### SDK Errors

**"GADApplicationIdentifier not found"**
- Add GADApplicationIdentifier to Info.plist
- Verify it matches your AdMob App ID

**"Ad request successful, but no ad returned"**
- Low ad inventory (common with new apps)
- Geographic location has low fill rate
- Enable test ads to verify implementation

**"Invalid ad unit ID"**
- Check ad unit ID for typos
- Verify it matches AdMob dashboard
- Ensure using correct format: `ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY`

### Performance Issues

**Slow ad loading:**
- Pre-load ads in advance
- Use adaptive banner sizes
- Check network latency

**High memory usage:**
- Implement proper ad lifecycle management
- Release ad views when not visible
- Monitor with Xcode Instruments

### Policy Violations

If you receive policy violation notices:

1. Review email from AdMob with violation details
2. Check AdMob dashboard for specific issues
3. Update content/code to comply
4. Submit appeal if violation was error

**Common violations:**
- Ad placement too close to clickable elements
- Ads obscuring app content
- Encouraging accidental clicks
- Inappropriate ad content

---

## Resources

### Official Documentation
- [AdMob iOS Quick Start](https://developers.google.com/admob/ios/quick-start)
- [Banner Ads Guide](https://developers.google.com/admob/ios/banner)
- [AdMob Best Practices](https://support.google.com/admob/answer/6128877)
- [Policy Center](https://support.google.com/admob/answer/6128877)

### SDK References
- [Google Mobile Ads SDK on GitHub](https://github.com/googleads/swift-package-manager-google-mobile-ads)
- [API Reference](https://developers.google.com/admob/ios/api/reference/Classes/GADBannerView)
- [Release Notes](https://developers.google.com/admob/ios/rel-notes)

### Support
- [AdMob Help Center](https://support.google.com/admob)
- [AdMob Community Forum](https://groups.google.com/g/google-admob-ads-sdk)
- [Stack Overflow - AdMob iOS](https://stackoverflow.com/questions/tagged/google-mobile-ads)

### Related Files in Project
- `/Purchases/AdMobManager.swift` - AdMob SDK integration
- `/Purchases/BannerAdView.swift` - Banner ad UI component
- `/Purchases/AdManager.swift` - Ad management wrapper
- `/Purchases/ProFeatureGate.swift` - Pro status checking
- `/UI/Scan/ScanView.swift` - Banner ad placement
- `/UI/Gallery/GalleryView.swift` - Banner ad placement

---

## Next Steps

After completing AdMob setup:

1. Test thoroughly on DEBUG and RELEASE builds
2. Submit app to App Store with ads enabled
3. Monitor ad performance in AdMob dashboard
4. Optimize placements based on metrics
5. Consider adding interstitial/rewarded ads for additional revenue
6. Implement ad mediation for better fill rates
7. A/B test ad placements and formats

---

**Questions or Issues?**

If you encounter problems during setup:
1. Check console logs for error messages
2. Review this guide's troubleshooting section
3. Consult official AdMob documentation
4. Search Stack Overflow for similar issues
5. Contact AdMob support for account-specific issues

---

**Last Updated:** March 2026
**AdMob SDK Version:** 10.0+
**iOS Deployment Target:** 14.0+
