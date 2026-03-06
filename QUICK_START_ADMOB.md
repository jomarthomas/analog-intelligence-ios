# AdMob Quick Start - 5 Minute Guide

Get AdMob ads working in your app in just 5 steps.

---

## Status: Code Ready ✅

All AdMob integration code is complete. You just need to add the SDK and configure IDs.

---

## 5-Step Quick Start

### Step 1: Add SDK (via Swift Package Manager)

```
1. Xcode → File → Add Packages...
2. Paste: https://github.com/googleads/swift-package-manager-google-mobile-ads.git
3. Click Add Package
```

---

### Step 2: Configure Info.plist

Add these keys to `Info.plist` (see Info.plist.example for full config):

```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-3940256099942544~1458002511</string>

<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>

<key>NSUserTrackingUsageDescription</key>
<string>This app uses advertising ID to provide personalized ads.</string>
```

Note: The App ID above is Google's test ID. Replace later with your production ID.

---

### Step 3: Initialize AdMob

Update `AnalogIntelligenceApp.swift`:

```swift
import SwiftUI

@main
struct AnalogIntelligenceApp: App {
    init() {
        AdMobManager.shared.initializeSDK()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
```

---

### Step 4: Uncomment SDK Code

#### In `Purchases/AdMobManager.swift`:

**Line 13:**
```swift
import GoogleMobileAds  // UNCOMMENT THIS
```

**Lines 66-74:**
```swift
// UNCOMMENT THIS BLOCK:
GADMobileAds.sharedInstance().start { status in
    Task { @MainActor in
        self.isInitialized = true
        print("✓ [AdMob] SDK initialized successfully")
    }
}
```

#### In `Purchases/BannerAdView.swift`:

**Line 14:**
```swift
import GoogleMobileAds  // UNCOMMENT THIS
```

**Lines 60-97:** Uncomment entire GADBannerView creation block

**Lines 141-183:** Uncomment all delegate methods

---

### Step 5: Test

1. Build and run (DEBUG uses test ads automatically)
2. Navigate to Scan tab → see test banner ad
3. Navigate to Gallery tab → see test banner ad
4. Check console for:
   ```
   ✓ [AdMob] SDK initialized successfully
   ✓ [AdMobBanner] Ad loaded successfully
   ```

---

## That's It!

You should now see test ads in your app.

---

## Before App Store Release

### Get Your AdMob IDs

1. Go to [admob.google.com](https://admob.google.com)
2. Register your app
3. Get **App ID** and **Ad Unit IDs**
4. Replace in:
   - Info.plist → `GADApplicationIdentifier`
   - AdMobManager.swift → `productionBannerAdUnitID`

### Add SKAdNetwork IDs

Copy all SKAdNetwork IDs from `Info.plist.example` to your `Info.plist`

---

## Ad Placements

Ads are already placed in:
- ✅ ScanView (bottom)
- ✅ GalleryView (bottom)

Ads automatically hide for Pro users.

---

## Need More Help?

- **Complete guide:** [ADMOB_SETUP.md](ADMOB_SETUP.md)
- **Integration steps:** [ADMOB_INTEGRATION_STEPS.md](ADMOB_INTEGRATION_STEPS.md)
- **Summary:** [ADMOB_SUMMARY.md](ADMOB_SUMMARY.md)

---

## Test vs Production

| Build | Ad Unit ID | Shows |
|-------|------------|-------|
| DEBUG | Test ID (automatic) | Test ads |
| RELEASE | Production ID | Real ads |

App automatically switches based on build configuration.

---

## Troubleshooting

**Ads not showing?**
- Check console for errors
- Verify GADApplicationIdentifier in Info.plist
- Make sure you uncommented all SDK code
- Wait a few minutes for ad network

**"Invalid ad unit ID"?**
- Using test ID is fine for DEBUG
- Check format: `ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY`

---

Total time: ~5-10 minutes
