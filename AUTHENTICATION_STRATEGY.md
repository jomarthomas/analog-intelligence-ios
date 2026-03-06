# Authentication & Monetization Strategy
## Analog Intelligence iOS App

**Last Updated:** March 4, 2026
**Status:** Strategic Planning Document

---

## Executive Summary

This document outlines the authentication and monetization strategy for Analog Intelligence, a film photography companion app. The recommended approach uses **StoreKit-based authentication** for Phase 1, leveraging Apple's native purchase system without requiring custom user accounts. This provides the simplest, most privacy-friendly path to monetization while maintaining excellent user experience.

### Key Recommendations

1. **Phase 1 (MVP):** StoreKit-only authentication with AdMob integration
2. **No custom login required** for basic Pro unlock functionality
3. **Google AdMob** for free tier monetization with strategic placement
4. **Phase 2+ (Optional):** Backend authentication for advanced features

---

## 1. StoreKit-Based Authentication (Recommended for Phase 1)

### Overview

StoreKit provides Apple's native In-App Purchase (IAP) system, which handles purchase management, receipt validation, and cross-device syncing automatically through the user's Apple ID. This is the recommended approach for initial launch.

### How StoreKit Manages Pro Purchases

```swift
// Purchase Flow Architecture
User Taps "Upgrade to Pro"
    ↓
StoreKit.Product.purchase()
    ↓
Apple Payment Sheet (Face ID/Touch ID)
    ↓
Transaction Verification
    ↓
Local Receipt Storage
    ↓
App Unlocks Pro Features
```

#### Key Components

**1. Product Configuration (App Store Connect)**
- Product ID: `com.analogintelligence.pro` (one-time purchase)
- Type: Non-Consumable IAP
- Price Tier: $9.99 USD (adjust per market)
- Localized descriptions for each region

**2. StoreKit 2 Implementation**
```swift
import StoreKit

class PurchaseManager: ObservableObject {
    @Published var isPro: Bool = false

    private let productID = "com.analogintelligence.pro"

    // Load products from App Store
    func loadProducts() async throws -> [Product] {
        try await Product.products(for: [productID])
    }

    // Purchase product
    func purchase(_ product: Product) async throws {
        let result = try await product.purchase()

        switch result {
        case .success(let verification):
            // Verify the transaction
            let transaction = try checkVerified(verification)

            // Update app state
            await updatePurchasedProducts()

            // Finish transaction
            await transaction.finish()

        case .userCancelled, .pending:
            break
        @unknown default:
            break
        }
    }

    // Check verification
    func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw PurchaseError.failedVerification
        case .verified(let safe):
            return safe
        }
    }
}
```

### Cross-Device Sync via Apple ID

**Automatic Syncing:**
- StoreKit transactions are tied to the user's Apple ID
- When user signs into iCloud on new device, purchases are automatically available
- No manual sync required by developer

**Implementation:**
```swift
// Listen for transaction updates
func observeTransactionUpdates() -> Task<Void, Never> {
    Task(priority: .background) {
        for await result in Transaction.updates {
            guard case .verified(let transaction) = result else {
                continue
            }

            // Update app state for new transaction
            await updatePurchasedProducts()
            await transaction.finish()
        }
    }
}

// Check current entitlements on app launch
func updatePurchasedProducts() async {
    for await result in Transaction.currentEntitlements {
        guard case .verified(let transaction) = result else {
            continue
        }

        if transaction.productID == productID {
            isPro = true
        }
    }
}
```

**User Experience:**
1. User purchases Pro on iPhone → `isPro = true`
2. User opens app on iPad → App checks `Transaction.currentEntitlements`
3. iPad automatically recognizes Pro purchase → `isPro = true`
4. No login or restore button needed (though restore is still provided as fallback)

### Why No Custom Login is Needed

**StoreKit handles everything:**
- User identity (Apple ID)
- Purchase verification
- Receipt management
- Cross-device sync
- Refund handling
- Family Sharing (if enabled)

**Privacy Benefits:**
- No email collection required
- No password management
- No user database to secure
- Complies with Apple's privacy standards
- Reduces GDPR compliance burden

**Developer Benefits:**
- No authentication server to build/maintain
- No backend costs for basic IAP
- Faster time to market
- Less code to maintain
- Apple handles all payment processing

### Receipt Validation

**Two Validation Approaches:**

#### 1. Device-Side Validation (StoreKit 2)
```swift
// StoreKit 2 automatically validates receipts using JWSTransaction
func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
    switch result {
    case .unverified(let unverifiedTransaction, let error):
        // Receipt failed Apple's validation
        throw PurchaseError.failedVerification
    case .verified(let transaction):
        // Receipt is cryptographically verified by Apple
        return transaction
    }
}
```

**Pros:**
- Automatic with StoreKit 2
- No server required
- Works offline after initial purchase
- Cryptographically secure (JWS signatures)

**Cons:**
- Can be bypassed by sophisticated jailbreak tools
- No server-side audit trail

#### 2. Server-Side Validation (Phase 2+)
```swift
// Send receipt to your server for validation
func validateReceiptWithServer(_ receiptData: Data) async throws {
    let response = try await URLSession.shared.upload(
        for: URLRequest(url: URL(string: "https://api.analogintelligence.com/validate")!),
        from: receiptData
    )

    // Your server calls Apple's verifyReceipt endpoint
    // Returns validated purchase information
}
```

**Pros:**
- More secure against piracy
- Server-side audit trail
- Can revoke access if needed
- Required for cross-platform purchases

**Cons:**
- Requires backend infrastructure
- Internet connection needed
- More complex implementation

**Recommendation for Phase 1:** Use device-side validation with StoreKit 2. The overhead of server-side validation is not justified for a $9.99 one-time purchase app without cross-platform needs.

---

## 2. Ad Implementation Strategy

### Google AdMob Integration

**Why AdMob:**
- Industry standard for iOS monetization
- High fill rates (% of ad requests filled)
- Competitive eCPM (revenue per 1000 impressions)
- Mediation support for maximizing revenue
- Easy integration with SwiftUI

**Setup Steps:**

1. **Create AdMob Account**
   - Sign up at https://admob.google.com
   - Add iOS app
   - Note App ID: `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`

2. **Create Ad Units**
   - Banner Ad Unit (Scan Tab): `ca-app-pub-XXXX/SCAN_BANNER`
   - Banner Ad Unit (Gallery Tab): `ca-app-pub-XXXX/GALLERY_BANNER`

3. **Install SDK**
```ruby
# Podfile
pod 'Google-Mobile-Ads-SDK'
```

4. **Implementation**
```swift
import GoogleMobileAds
import SwiftUI

// Initialize AdMob in App Delegate
class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        GADMobileAds.sharedInstance().start()
        return true
    }
}

// Banner Ad View Wrapper
struct BannerAdView: UIViewControllerRepresentable {
    let adUnitID: String

    func makeUIViewController(context: Context) -> some UIViewController {
        let viewController = UIViewController()
        let banner = GADBannerView(adSize: GADAdSizeBanner)
        banner.adUnitID = adUnitID
        banner.rootViewController = viewController
        banner.load(GADRequest())

        viewController.view.addSubview(banner)
        return viewController
    }

    func updateUIViewController(_ uiViewController: UIViewControllerType, context: Context) {}
}

// Ad Manager
class AdManager: ObservableObject {
    @Published var shouldShowAds: Bool = true

    private let purchaseManager: PurchaseManager

    init(purchaseManager: PurchaseManager) {
        self.purchaseManager = purchaseManager

        // Update ad visibility based on Pro status
        Publishers.CombineLatest(
            purchaseManager.$isPro,
            Just(true) // Add other conditions if needed
        )
        .map { isPro, _ in !isPro } // Show ads only if NOT Pro
        .assign(to: &$shouldShowAds)
    }
}
```

### Ad Placement Locations

**1. Scan Tab Banner (Bottom)**
```
┌─────────────────────────────┐
│     Camera Preview          │
│                             │
│                             │
│                             │
│    [Film Stock Dropdown]    │
│    [Shutter Button]         │
├─────────────────────────────┤
│   [Banner Ad - 320x50]      │ ← Ad here
└─────────────────────────────┘
```

**Implementation:**
```swift
struct ScanView: View {
    @EnvironmentObject var adManager: AdManager

    var body: some View {
        VStack(spacing: 0) {
            // Camera preview and controls
            CameraPreviewView()

            FilmStockPicker()

            ShutterButton()

            // Ad banner at bottom (only for free users)
            if adManager.shouldShowAds {
                BannerAdView(adUnitID: "ca-app-pub-XXXX/SCAN_BANNER")
                    .frame(height: 50)
                    .background(Color(.systemBackground))
            }
        }
    }
}
```

**2. Gallery Tab Banner (Bottom)**
```
┌─────────────────────────────┐
│  [Photo Grid]               │
│  ┌───┐ ┌───┐ ┌───┐         │
│  │   │ │   │ │   │         │
│  └───┘ └───┘ └───┘         │
│  ┌───┐ ┌───┐ ┌───┐         │
│  │   │ │   │ │   │         │
│  └───┘ └───┘ └───┘         │
├─────────────────────────────┤
│   [Banner Ad - 320x50]      │ ← Ad here
└─────────────────────────────┘
```

**Implementation:**
```swift
struct GalleryView: View {
    @EnvironmentObject var adManager: AdManager

    var body: some View {
        VStack(spacing: 0) {
            // Photo grid
            ScrollView {
                LazyVGrid(columns: columns) {
                    ForEach(photos) { photo in
                        PhotoThumbnail(photo: photo)
                    }
                }
            }

            // Ad banner at bottom (only for free users)
            if adManager.shouldShowAds {
                BannerAdView(adUnitID: "ca-app-pub-XXXX/GALLERY_BANNER")
                    .frame(height: 50)
                    .background(Color(.systemBackground))
            }
        }
    }
}
```

**Why These Placements:**
- Non-intrusive (doesn't cover content)
- Standard banner size (320x50) fits all devices
- Bottom placement = high viewability without disrupting workflow
- No ads on other tabs (Settings, Notes) to maintain clean UX

### Ad Frequency and User Experience

**Frequency Strategy:**

1. **Banner Ads Only (No Interstitials)**
   - Interstitial ads (full-screen) are too disruptive for a camera app
   - Banner ads provide consistent, predictable experience

2. **Always Visible on Free Tier**
   - Banner persists on Scan and Gallery tabs
   - Creates consistent "Pro removes this" value proposition

3. **No Ad Limits**
   - Not time-based or impression-based
   - Simple rule: Free = Ads, Pro = No Ads

**User Experience Principles:**

- **Never block camera functionality:** Ads should never interfere with taking photos
- **Quick removal:** Upgrading to Pro removes ads immediately (no app restart)
- **No "reward videos":** Doesn't fit photography app context
- **Respect creative flow:** Ads are present but not attention-grabbing

**Implementation:**
```swift
// Immediate ad removal upon purchase
class AdManager: ObservableObject {
    @Published var shouldShowAds: Bool = true

    func updateAdVisibility(isPro: Bool) {
        withAnimation {
            shouldShowAds = !isPro
        }
    }
}

// In PurchaseManager
func purchase(_ product: Product) async throws {
    // ... purchase logic ...

    // Immediately notify AdManager
    await MainActor.run {
        isPro = true
        // AdManager observes this change and hides ads
    }
}
```

### How to Disable Ads for Pro Users

**Architecture:**

```
PurchaseManager.isPro → AdManager.shouldShowAds → View Renders
       (true)                    (false)              (no ad)
```

**Complete Implementation:**

```swift
// 1. Purchase Manager tracks Pro status
class PurchaseManager: ObservableObject {
    @Published var isPro: Bool = false

    @MainActor
    func checkPurchaseStatus() async {
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result,
               transaction.productID == "com.analogintelligence.pro" {
                isPro = true
                return
            }
        }
        isPro = false
    }
}

// 2. Ad Manager derives ad visibility from Pro status
class AdManager: ObservableObject {
    @Published var shouldShowAds: Bool = true
    private var cancellables = Set<AnyCancellable>()

    init(purchaseManager: PurchaseManager) {
        purchaseManager.$isPro
            .map { !$0 } // Invert: if Pro, don't show ads
            .assign(to: &$shouldShowAds)
    }
}

// 3. Views conditionally render ads
struct ContentView: View {
    @StateObject var purchaseManager = PurchaseManager()
    @StateObject var adManager: AdManager

    init() {
        let pm = PurchaseManager()
        _purchaseManager = StateObject(wrappedValue: pm)
        _adManager = StateObject(wrappedValue: AdManager(purchaseManager: pm))
    }

    var body: some View {
        TabView {
            ScanView()
                .environmentObject(adManager)

            GalleryView()
                .environmentObject(adManager)
        }
        .task {
            await purchaseManager.checkPurchaseStatus()
        }
    }
}

// 4. Banner component checks before rendering
struct BannerAdView: UIViewControllerRepresentable {
    let adUnitID: String
    @EnvironmentObject var adManager: AdManager

    func makeUIViewController(context: Context) -> some UIViewController {
        // Only create ad view if should show ads
        guard adManager.shouldShowAds else {
            return UIViewController() // Empty view controller
        }

        let viewController = UIViewController()
        let banner = GADBannerView(adSize: GADAdSizeBanner)
        banner.adUnitID = adUnitID
        banner.rootViewController = viewController
        banner.load(GADRequest())

        viewController.view.addSubview(banner)
        return viewController
    }

    func updateUIViewController(_ uiViewController: UIViewControllerType, context: Context) {
        // Can implement dynamic ad removal here if needed
    }
}
```

**Testing Ad Removal:**

```swift
// Use test Ad Unit IDs during development
#if DEBUG
let scanBannerID = "ca-app-pub-3940256099942544/2934735716" // Test ID
#else
let scanBannerID = "ca-app-pub-XXXX/SCAN_BANNER" // Production ID
#endif

// Test scenarios:
// 1. Launch app (free) → Ads should appear
// 2. Purchase Pro → Ads should disappear immediately
// 3. Restart app (Pro) → Ads should not appear
// 4. Restore purchases → Ads should disappear
```

---

## 3. Purchase Flow

### Initial App Launch (Free Tier)

**First Launch Experience:**

```
User Opens App
    ↓
PurchaseManager.checkPurchaseStatus() runs
    ↓
No Pro purchase found
    ↓
isPro = false
    ↓
AdManager.shouldShowAds = true
    ↓
User sees ads on Scan/Gallery tabs
```

**Implementation:**
```swift
struct AnalogIntelligenceApp: App {
    @StateObject var purchaseManager = PurchaseManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(purchaseManager)
                .task {
                    // Check purchase status on app launch
                    await purchaseManager.checkPurchaseStatus()

                    // Start observing transaction updates
                    await purchaseManager.observeTransactionUpdates()
                }
        }
    }
}
```

**Free Tier Features:**
- Full camera functionality
- Film stock database (limited to basic stocks)
- Photo gallery (with ads)
- Basic editing tools
- Notes for each photo

**Pro Upgrade Prompts:**
- Banner on Settings tab: "Upgrade to Pro - Remove Ads & Unlock Premium Film Stocks"
- Non-intrusive reminder after 10 photos taken
- "Upgrade to Pro" button in Settings

### Pro Upgrade Process

**User Flow:**

```
1. User taps "Upgrade to Pro" button
    ↓
2. App loads product from StoreKit
    ↓
3. Payment sheet appears (Face ID/Touch ID)
    ↓
4. User authenticates and confirms purchase
    ↓
5. Transaction verification
    ↓
6. Update app state (isPro = true)
    ↓
7. Ads disappear immediately
    ↓
8. Pro features unlock
    ↓
9. Success message shown
```

**UI Implementation:**

```swift
struct UpgradeView: View {
    @EnvironmentObject var purchaseManager: PurchaseManager
    @State private var product: Product?
    @State private var isPurchasing = false
    @State private var error: PurchaseError?

    var body: some View {
        VStack(spacing: 24) {
            // Hero section
            VStack(spacing: 16) {
                Image(systemName: "star.circle.fill")
                    .font(.system(size: 80))
                    .foregroundColor(.yellow)

                Text("Upgrade to Pro")
                    .font(.largeTitle)
                    .bold()

                Text("Remove ads and unlock premium features")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            // Features list
            VStack(alignment: .leading, spacing: 12) {
                FeatureRow(icon: "eye.slash", text: "Remove all ads")
                FeatureRow(icon: "film", text: "Access 100+ premium film stocks")
                FeatureRow(icon: "wand.and.stars", text: "Advanced color grading tools")
                FeatureRow(icon: "icloud", text: "Sync across all your devices")
                FeatureRow(icon: "lock.shield", text: "Support indie development")
            }
            .padding()
            .background(Color(.secondarySystemBackground))
            .cornerRadius(12)

            // Purchase button
            if let product = product {
                Button(action: {
                    Task { await purchaseProduct(product) }
                }) {
                    HStack {
                        if isPurchasing {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        } else {
                            Text("Purchase for \(product.displayPrice)")
                                .bold()
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.accentColor)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(isPurchasing)
            } else {
                ProgressView()
            }

            // Restore purchases button
            Button("Restore Purchases") {
                Task { await restorePurchases() }
            }
            .font(.subheadline)
            .foregroundColor(.secondary)

            // Terms
            Text("One-time purchase. No subscription required.")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .task {
            await loadProduct()
        }
        .alert(error?.localizedDescription ?? "Purchase Error",
               isPresented: Binding(
                   get: { error != nil },
                   set: { if !$0 { error = nil } }
               )
        ) {
            Button("OK", role: .cancel) {}
        }
    }

    func loadProduct() async {
        do {
            let products = try await purchaseManager.loadProducts()
            product = products.first
        } catch {
            self.error = .failedToLoad
        }
    }

    func purchaseProduct(_ product: Product) async {
        isPurchasing = true
        defer { isPurchasing = false }

        do {
            try await purchaseManager.purchase(product)
            // Success - view will automatically dismiss due to isPro change
        } catch {
            self.error = .purchaseFailed
        }
    }

    func restorePurchases() async {
        isPurchasing = true
        defer { isPurchasing = false }

        await purchaseManager.checkPurchaseStatus()

        if !purchaseManager.isPro {
            error = .noPurchasesToRestore
        }
    }
}

struct FeatureRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(.accentColor)
                .frame(width: 24)
            Text(text)
            Spacer()
        }
    }
}
```

### Receipt Validation

**StoreKit 2 Automatic Validation:**

```swift
// Verification happens automatically
func purchase(_ product: Product) async throws {
    let result = try await product.purchase()

    switch result {
    case .success(let verification):
        // This verification result contains cryptographically signed data
        switch verification {
        case .verified(let transaction):
            // Apple has verified this transaction is legitimate
            // The JWS signature is valid
            await updatePurchasedProducts()
            await transaction.finish()

        case .unverified(let transaction, let error):
            // Transaction failed Apple's cryptographic verification
            // Could be:
            // - Jailbroken device tampering
            // - Invalid signature
            // - Corrupted receipt
            throw PurchaseError.failedVerification
        }

    case .userCancelled:
        throw PurchaseError.cancelled

    case .pending:
        // Transaction is pending (e.g., Ask to Buy for kids)
        throw PurchaseError.pending

    @unknown default:
        throw PurchaseError.unknown
    }
}
```

**What Gets Validated:**
- Transaction signature (JWS)
- Transaction timestamp
- Product ID matches
- Bundle ID matches
- Device ID matches
- Apple's private key signature

**When Validation Happens:**
- During purchase
- On app launch (checking entitlements)
- When restoring purchases
- During transaction updates

### Restore Purchases

**Why Restore is Needed:**

Even though StoreKit syncs automatically, some scenarios require manual restore:
1. User deleted and reinstalled app
2. User signed out of iCloud and back in
3. Transaction sync hasn't completed yet
4. User switched Apple IDs

**Implementation:**

```swift
class PurchaseManager: ObservableObject {
    @Published var isPro: Bool = false

    // Restore purchases (check current entitlements)
    @MainActor
    func restorePurchases() async throws {
        // Sync with App Store
        try await AppStore.sync()

        // Check current entitlements
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result,
               transaction.productID == "com.analogintelligence.pro" {
                isPro = true
                return
            }
        }

        // No Pro purchase found
        throw PurchaseError.noPurchasesToRestore
    }
}
```

**UI for Restore:**

```swift
struct SettingsView: View {
    @EnvironmentObject var purchaseManager: PurchaseManager
    @State private var showingRestoreAlert = false
    @State private var restoreMessage = ""

    var body: some View {
        List {
            if !purchaseManager.isPro {
                Section {
                    Button("Upgrade to Pro") {
                        // Show upgrade sheet
                    }

                    Button("Restore Purchases") {
                        Task {
                            await restorePurchases()
                        }
                    }
                }
            } else {
                Section {
                    HStack {
                        Text("Status")
                        Spacer()
                        Text("Pro")
                            .foregroundColor(.green)
                    }
                }
            }
        }
        .alert("Restore Purchases", isPresented: $showingRestoreAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(restoreMessage)
        }
    }

    func restorePurchases() async {
        do {
            try await purchaseManager.restorePurchases()
            restoreMessage = "Successfully restored Pro purchase!"
        } catch PurchaseError.noPurchasesToRestore {
            restoreMessage = "No purchases to restore. If you purchased Pro, make sure you're signed into the same Apple ID."
        } catch {
            restoreMessage = "Failed to restore purchases. Please try again."
        }
        showingRestoreAlert = true
    }
}
```

### Edge Cases

#### 1. Refunds

**What Happens:**
- User requests refund through App Store
- Apple approves refund
- Transaction is revoked

**StoreKit 2 Handling:**
```swift
// Transaction.updates stream will emit revoked transaction
func observeTransactionUpdates() -> Task<Void, Never> {
    Task(priority: .background) {
        for await result in Transaction.updates {
            guard case .verified(let transaction) = result else {
                continue
            }

            // Check if transaction was revoked
            if let revocationDate = transaction.revocationDate {
                // User got refund - revoke Pro access
                await MainActor.run {
                    isPro = false
                }
            }

            await transaction.finish()
        }
    }
}
```

**Behavior:**
- Pro access is immediately revoked
- Ads reappear
- Premium features lock
- User can re-purchase if desired

#### 2. Subscription Management (Future)

If you later add a subscription option:

**Subscription Types:**
- Monthly: `com.analogintelligence.pro.monthly`
- Yearly: `com.analogintelligence.pro.yearly`

**Additional Logic Needed:**
```swift
// Check subscription status
func checkSubscriptionStatus() async {
    for await result in Transaction.currentEntitlements {
        guard case .verified(let transaction) = result else { continue }

        // Check if subscription is active
        if transaction.productType == .autoRenewable {
            // Check expiration
            if let expirationDate = transaction.expirationDate,
               expirationDate > Date() {
                isPro = true
                return
            }
        }
    }
    isPro = false
}
```

#### 3. Family Sharing

**Enable Family Sharing:**
- Set in App Store Connect: Product → Family Sharing → Enable
- Purchase is shared with up to 5 family members

**Implementation:**
```swift
// No code changes needed! StoreKit handles this automatically
// Each family member's device will see the purchase in Transaction.currentEntitlements
```

#### 4. Ask to Buy (Kids Accounts)

**Scenario:**
- Child tries to purchase Pro
- Request sent to parent for approval
- Transaction state = `.pending`

**Handling:**
```swift
func purchase(_ product: Product) async throws {
    let result = try await product.purchase()

    switch result {
    case .pending:
        // Show message to user
        await MainActor.run {
            showPendingApprovalMessage = true
        }

    // ... other cases
    }
}

// Later, when parent approves:
// Transaction.updates will emit approved transaction
// observeTransactionUpdates() will catch it and unlock Pro
```

#### 5. Offline Purchases

**Scenario:**
- User has no internet connection
- Tries to purchase

**Behavior:**
- StoreKit requires internet for purchases
- Will show error: "Cannot connect to App Store"
- No special handling needed - Apple handles this

**After Purchase Offline:**
- Receipts are cached locally
- Validation works offline after initial purchase
- `Transaction.currentEntitlements` uses cached data

#### 6. Purchase During Transaction Update

**Scenario:**
- App is still processing previous transaction
- User tries to purchase again

**Prevention:**
```swift
class PurchaseManager: ObservableObject {
    @Published var isPurchasing: Bool = false

    func purchase(_ product: Product) async throws {
        guard !isPurchasing else {
            throw PurchaseError.alreadyPurchasing
        }

        isPurchasing = true
        defer { isPurchasing = false }

        // ... purchase logic
    }
}
```

#### 7. App Transfer/Acquisition

**Scenario:**
- You sell app to another developer
- New developer has different Team ID

**Impact:**
- Existing users keep their purchases (tied to original app)
- New users purchase from new developer
- No code changes needed

---

## 4. Optional: Backend Authentication (Phase 2+)

### When You'd Need a Backend

**Phase 1 (StoreKit Only) is Sufficient For:**
- iOS-only app
- Simple Pro unlock (no user data sync)
- Small team (1-2 developers)
- Basic receipt validation acceptable

**Phase 2+ (Backend Required) Scenarios:**

#### 1. Cross-Platform Support
**Problem:** User purchases on iOS, wants access on web or Android
**Solution:** Backend tracks purchases across platforms

```swift
// iOS purchase triggers backend sync
func purchase(_ product: Product) async throws {
    // ... StoreKit purchase logic ...

    // Send receipt to backend
    if let receiptData = await getAppStoreReceiptData() {
        try await validateReceiptWithBackend(receiptData)
    }
}

// Backend API
POST /api/v1/users/validate-receipt
{
    "receipt_data": "base64_encoded_receipt",
    "platform": "ios",
    "device_id": "UUID"
}

Response:
{
    "user_id": "user_12345",
    "is_pro": true,
    "expires_at": null, // null for non-consumable
    "platforms": ["ios", "web", "android"]
}
```

#### 2. Server-Side Features
**Examples:**
- Cloud photo storage
- AI processing (film stock identification)
- Social features (sharing photos)
- Analytics dashboard
- Community features

**Architecture:**
```
iOS App → Backend API → Database
                    ↓
                Cloud Storage
                    ↓
                ML Services
```

#### 3. Enhanced Security
**Problem:** Concern about piracy via jailbreak
**Solution:** Server-side receipt validation + regular checks

```swift
// Periodic validation
class PurchaseManager: ObservableObject {
    func periodicValidation() {
        Timer.publish(every: 86400, on: .main, in: .common) // Daily
            .autoconnect()
            .sink { _ in
                Task {
                    await self.validateWithBackend()
                }
            }
            .store(in: &cancellables)
    }

    func validateWithBackend() async {
        guard let receiptData = await getAppStoreReceiptData() else {
            return
        }

        let response = try? await api.validateReceipt(receiptData)

        if response?.isPro != true {
            // Backend says not Pro - revoke access
            await MainActor.run {
                isPro = false
            }
        }
    }
}
```

#### 4. User Data Sync
**Examples:**
- Custom film stock presets
- Editing templates
- Notes database
- Photo metadata

**Implementation:**
```swift
// User logs in (email + password or Sign in with Apple)
struct LoginView: View {
    @State private var email = ""
    @State private var password = ""

    func login() async {
        let response = try await api.login(email: email, password: password)

        // Save auth token
        KeychainHelper.save(token: response.authToken)

        // Sync Pro status from backend
        purchaseManager.isPro = response.isPro

        // Sync user data
        await syncManager.syncFromBackend()
    }
}
```

### User Account System

**Architecture Options:**

#### Option A: Apple Sign-In Only (Recommended)
**Pros:**
- Most privacy-friendly
- No password management
- Required by Apple if you offer other social logins
- Seamless UX

**Cons:**
- Apple-ecosystem only (no Android)
- Requires backend to map Apple IDs to user accounts

**Implementation:**
```swift
import AuthenticationServices

class AuthManager: ObservableObject {
    @Published var userID: String?
    @Published var isAuthenticated = false

    func signInWithApple() {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email, .fullName]

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.performRequests()
    }

    // Handle response
    func handleSignIn(authorization: ASAuthorization) async {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            return
        }

        // Send to backend
        let response = try await api.authenticateWithApple(
            userIdentifier: credential.user,
            identityToken: credential.identityToken,
            authorizationCode: credential.authorizationCode
        )

        // Save token
        KeychainHelper.save(token: response.authToken)

        await MainActor.run {
            userID = response.userID
            isAuthenticated = true
        }
    }
}

// Backend endpoint
POST /api/v1/auth/apple
{
    "user_identifier": "001234.abc...",
    "identity_token": "eyJhbGc...",
    "authorization_code": "c1a2b..."
}

Response:
{
    "auth_token": "jwt_token_here",
    "user_id": "user_12345",
    "is_pro": true
}
```

#### Option B: Email + Password
**Pros:**
- Works on any platform
- Full control over auth flow

**Cons:**
- Password management burden
- More complex security requirements
- GDPR compliance overhead

**Implementation:**
```swift
class AuthManager: ObservableObject {
    func signUp(email: String, password: String) async throws {
        // Validate email format
        guard email.contains("@") else {
            throw AuthError.invalidEmail
        }

        // Validate password strength
        guard password.count >= 8 else {
            throw AuthError.weakPassword
        }

        // Send to backend
        let response = try await api.signUp(email: email, password: password)

        // Save token
        KeychainHelper.save(token: response.authToken)

        await MainActor.run {
            userID = response.userID
            isAuthenticated = true
        }
    }

    func signIn(email: String, password: String) async throws {
        let response = try await api.signIn(email: email, password: password)

        KeychainHelper.save(token: response.authToken)

        await MainActor.run {
            userID = response.userID
            isAuthenticated = true
        }
    }
}
```

### Cross-Platform Support

**Unified Purchase System:**

```
User purchases on iOS
    ↓
iOS app validates with Apple
    ↓
iOS app sends receipt to backend
    ↓
Backend validates with Apple's servers
    ↓
Backend marks user as Pro in database
    ↓
User logs into web app
    ↓
Web app checks backend for Pro status
    ↓
User has Pro on web
```

**Implementation:**

**1. Backend API (Node.js example)**
```javascript
// Purchase validation endpoint
app.post('/api/v1/purchases/validate', async (req, res) => {
    const { receipt_data, platform } = req.body;
    const user_id = req.user.id; // From auth token

    if (platform === 'ios') {
        // Validate with Apple
        const appleResponse = await fetch('https://buy.itunes.apple.com/verifyReceipt', {
            method: 'POST',
            body: JSON.stringify({
                'receipt-data': receipt_data,
                'password': process.env.APPLE_SHARED_SECRET
            })
        });

        const result = await appleResponse.json();

        if (result.status === 0) {
            // Valid receipt
            await db.purchases.create({
                user_id,
                platform: 'ios',
                product_id: result.receipt.in_app[0].product_id,
                transaction_id: result.receipt.in_app[0].transaction_id,
                purchase_date: result.receipt.in_app[0].purchase_date_ms,
                is_active: true
            });

            // Update user Pro status
            await db.users.update(user_id, { is_pro: true });

            res.json({ success: true, is_pro: true });
        } else {
            res.status(400).json({ error: 'Invalid receipt' });
        }
    }
});

// Check Pro status (called by web/Android)
app.get('/api/v1/users/me', async (req, res) => {
    const user_id = req.user.id;

    const user = await db.users.findById(user_id);
    const activePurchase = await db.purchases.findActive(user_id);

    res.json({
        user_id,
        email: user.email,
        is_pro: user.is_pro,
        purchase_platform: activePurchase?.platform,
        platforms: ['ios', 'web'] // Platforms where Pro is available
    });
});
```

**2. iOS App Integration**
```swift
class PurchaseManager: ObservableObject {
    let api: APIClient

    func purchase(_ product: Product) async throws {
        // 1. Purchase via StoreKit
        let result = try await product.purchase()

        guard case .success(let verification) = result else {
            return
        }

        let transaction = try checkVerified(verification)

        // 2. Update local state
        await MainActor.run {
            isPro = true
        }

        // 3. Sync with backend (if user is logged in)
        if let receiptData = await getAppStoreReceiptData() {
            try? await api.validatePurchase(
                receiptData: receiptData,
                platform: "ios"
            )
        }

        await transaction.finish()
    }
}
```

**3. Web App (React example)**
```javascript
function ProStatus() {
    const [isPro, setIsPro] = useState(false);

    useEffect(() => {
        fetch('/api/v1/users/me', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        })
        .then(res => res.json())
        .then(data => {
            setIsPro(data.is_pro);
        });
    }, []);

    return (
        <div>
            {isPro ? (
                <span>Pro Account (purchased on iOS)</span>
            ) : (
                <button>Upgrade to Pro</button>
            )}
        </div>
    );
}
```

### Server-Side Receipt Validation

**Apple's verifyReceipt API:**

**Endpoint:** `https://buy.itunes.apple.com/verifyReceipt` (production)
**Sandbox:** `https://sandbox.itunes.apple.com/verifyReceipt` (testing)

**Request:**
```json
{
    "receipt-data": "base64_encoded_receipt_string",
    "password": "your_shared_secret_from_app_store_connect",
    "exclude-old-transactions": true
}
```

**Response (Success):**
```json
{
    "status": 0,
    "environment": "Production",
    "receipt": {
        "bundle_id": "com.analogintelligence.app",
        "application_version": "1.0",
        "in_app": [
            {
                "product_id": "com.analogintelligence.pro",
                "transaction_id": "1000000123456789",
                "purchase_date_ms": "1234567890000",
                "quantity": "1",
                "is_trial_period": "false"
            }
        ]
    }
}
```

**Status Codes:**
- `0`: Valid receipt
- `21000`: Malformed request
- `21002`: Receipt data malformed
- `21003`: Receipt authentication error
- `21004`: Wrong shared secret
- `21005`: Receipt server unavailable
- `21007`: Sandbox receipt sent to production (retry with sandbox)
- `21008`: Production receipt sent to sandbox (retry with production)

**Implementation (Node.js):**
```javascript
async function validateAppleReceipt(receiptData) {
    const requestBody = {
        'receipt-data': receiptData,
        'password': process.env.APPLE_SHARED_SECRET,
        'exclude-old-transactions': true
    };

    // Try production first
    let response = await fetch('https://buy.itunes.apple.com/verifyReceipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    let result = await response.json();

    // If status 21007, try sandbox
    if (result.status === 21007) {
        response = await fetch('https://sandbox.itunes.apple.com/verifyReceipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        result = await response.json();
    }

    if (result.status === 0) {
        // Valid receipt
        const purchases = result.receipt.in_app;
        const proPurchase = purchases.find(p =>
            p.product_id === 'com.analogintelligence.pro'
        );

        return {
            valid: true,
            productID: proPurchase?.product_id,
            transactionID: proPurchase?.transaction_id,
            purchaseDate: new Date(parseInt(proPurchase?.purchase_date_ms))
        };
    } else {
        return {
            valid: false,
            error: `Apple validation failed with status ${result.status}`
        };
    }
}
```

**Security Best Practices:**
1. Always validate receipts on your server (never client-side only)
2. Store shared secret in environment variables (never commit to code)
3. Handle retry logic for status 21007/21008
4. Cache validation results to reduce API calls
5. Re-validate periodically (e.g., daily)

---

## 5. Privacy & Security

### How User Data is Handled

#### Phase 1 (StoreKit Only) - Minimal Data Collection

**Data Collected:**
- None explicitly by you
- Apple collects purchase data (tied to Apple ID)
- AdMob collects ad targeting data

**Data Storage:**
- Photos: Stored locally on device only
- Purchase receipts: Stored in iOS keychain by StoreKit
- Film stock preferences: UserDefaults (local only)
- Notes: Core Data (local only)

**Privacy Benefits:**
- No email addresses collected
- No user accounts
- No cloud sync (no data leaves device)
- No analytics tracking
- No crash reporting (unless you add it)

**Privacy Manifest (Required by Apple):**

Create `PrivacyInfo.xcprivacy`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <!-- No data collection in Phase 1 -->
    </array>
    <key>NSPrivacyTrackingDomains</key>
    <array>
        <!-- AdMob domains -->
        <string>googleads.g.doubleclick.net</string>
        <string>pagead2.googlesyndication.com</string>
    </array>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string> <!-- App functionality -->
            </array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>C617.1</string> <!-- Photo gallery -->
            </array>
        </dict>
    </array>
</dict>
</plist>
```

#### Phase 2 (Backend) - Additional Data

**New Data Collected:**
- Email address (if email/password auth)
- Apple ID identifier (if Sign in with Apple)
- Photo metadata (if cloud sync enabled)
- Device identifiers (for multi-device support)

**Privacy Policy Requirements:**
- Clear explanation of data collection
- How data is used
- How long data is retained
- User's rights (deletion, export)
- Third-party services (AdMob, hosting provider)

**Data Minimization:**
```swift
// Only collect what you need
struct UserAccount {
    let id: String
    let authMethod: AuthMethod // apple_id or email
    let isPro: Bool
    let createdAt: Date

    // DON'T collect:
    // - Full name (unless needed)
    // - Location (not needed)
    // - Photos (keep local unless user opts-in to sync)
    // - Usage analytics (not needed)
}
```

### Apple's Privacy Requirements

#### 1. App Privacy Labels (App Store Connect)

**You Must Declare:**

**Data Used to Track You:**
- AdMob collects identifiers for advertising tracking
- Declare: "Identifiers" → "Advertising Data"

**Data Linked to You:**
- If Phase 2 with accounts:
  - Email address
  - Purchase history

**Data Not Linked to You:**
- Photos (stored locally)
- Film stock preferences

**App Store Labels:**
```
Data Used to Track You:
- Identifiers (for advertising)

Data Linked to You:
- Purchases (for Pro status)

Data Not Linked to You:
- Photos and Videos (stored locally)
- Usage Data (film stock selections)
```

#### 2. App Tracking Transparency (ATT)

**Required for AdMob:**

```swift
import AppTrackingTransparency

class AppDelegate: UIApplicationDelegate {
    func applicationDidBecomeActive(_ application: UIApplication) {
        // Request tracking permission after app launch
        if #available(iOS 14, *) {
            ATTrackingManager.requestTrackingAuthorization { status in
                switch status {
                case .authorized:
                    // User allowed tracking - AdMob can use IDFA
                    print("Tracking authorized")
                case .denied, .restricted, .notDetermined:
                    // User denied - AdMob uses limited ads
                    print("Tracking not authorized")
                @unknown default:
                    break
                }
            }
        }
    }
}
```

**Info.plist Entry:**
```xml
<key>NSUserTrackingUsageDescription</key>
<string>This allows us to show you personalized ads and support free access to the app.</string>
```

**User Experience:**
```
[App launches]
    ↓
[System dialog appears]
"Analog Intelligence would like to track your
activity across other companies' apps and websites."

[Allow] [Ask App Not to Track]
    ↓
[User chooses]
    ↓
AdMob adjusts ad personalization accordingly
```

#### 3. Camera Privacy

**Info.plist Entry:**
```xml
<key>NSCameraUsageDescription</key>
<string>Analog Intelligence needs camera access to scan and photograph film cameras.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Access your photo library to save scanned images and view your film photography collection.</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>Save scanned images to your photo library.</string>
```

#### 4. Privacy-First Principles

**Apply These Rules:**
1. **Don't collect data you don't need**
2. **Keep data local when possible** (photos, notes)
3. **Use Apple Sign-In** if you add accounts
4. **Let users export/delete data**
5. **Be transparent** about what you collect

### GDPR Compliance for Ads

#### What GDPR Requires

**For Users in EU/EEA/UK:**
1. Consent before collecting personal data
2. Right to access data
3. Right to deletion
4. Right to data portability
5. Clear privacy policy

#### AdMob GDPR Compliance

**Google handles most GDPR requirements, but you must:**

**1. Collect Consent**

Use Google's UMP (User Messaging Platform):

```swift
import GoogleMobileAds
import UserMessagingPlatform

class ConsentManager {
    static func requestConsentInfoUpdate() {
        let parameters = UMPRequestParameters()

        // Set tag for under age of consent
        parameters.tagForUnderAgeOfConsent = false

        // Request consent information
        UMPConsentInformation.sharedInstance.requestConsentInfoUpdate(
            with: parameters
        ) { error in
            if let error = error {
                print("Consent info update failed: \(error.localizedDescription)")
            } else {
                // Consent info updated
                let formStatus = UMPConsentInformation.sharedInstance.formStatus

                if formStatus == .available {
                    loadConsentForm()
                }
            }
        }
    }

    static func loadConsentForm() {
        UMPConsentForm.load { form, error in
            if let form = form {
                // Present form if needed
                if UMPConsentInformation.sharedInstance.consentStatus == .required {
                    form.present(from: UIApplication.shared.windows.first?.rootViewController) { error in
                        // Consent form dismissed
                        // Can now show ads
                    }
                }
            }
        }
    }
}

// Call on app launch
func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
) -> Bool {
    // Request consent before initializing AdMob
    ConsentManager.requestConsentInfoUpdate()

    // Initialize AdMob after consent
    GADMobileAds.sharedInstance().start()

    return true
}
```

**2. Provide Privacy Policy**

Create privacy policy at: `https://analogintelligence.com/privacy`

**Must Include:**
- What data is collected (ad identifiers)
- Why it's collected (to show ads, support free tier)
- Who it's shared with (Google AdMob)
- How users can opt-out (device settings)
- How to delete data (uninstall app)
- Contact information

**Template:**
```markdown
# Privacy Policy

## Data Collection
Analog Intelligence collects minimal data to provide core functionality:

- **Purchase Information**: Your Pro upgrade status is managed by Apple
  through StoreKit and tied to your Apple ID.

- **Advertising Data**: For users on the free tier, Google AdMob collects
  device identifiers for ad personalization. You can opt-out in iOS Settings >
  Privacy > Tracking.

- **Local Data**: Photos, film stock preferences, and notes are stored
  locally on your device and never uploaded to our servers.

## Data Sharing
- **Apple**: Purchase receipts for Pro unlock verification
- **Google AdMob**: Device identifiers for ad serving (free tier only)

We do not sell your data to third parties.

## Your Rights
- **Access**: Contact us to request your data
- **Deletion**: Uninstall the app to delete all local data
- **Opt-out**: Disable ad tracking in iOS Settings
- **Portability**: Export your data (Phase 2 feature)

## Contact
Email: privacy@analogintelligence.com
```

**3. Link Privacy Policy in App**

```swift
struct SettingsView: View {
    var body: some View {
        List {
            Section("Legal") {
                Link("Privacy Policy",
                     destination: URL(string: "https://analogintelligence.com/privacy")!)

                Link("Terms of Service",
                     destination: URL(string: "https://analogintelligence.com/terms")!)
            }
        }
    }
}
```

**4. Honor User Preferences**

```swift
// Check if user disabled ad personalization
class AdManager: ObservableObject {
    @Published var shouldShowAds: Bool = true

    func updateAdConfiguration() {
        let consentStatus = UMPConsentInformation.sharedInstance.consentStatus

        // If user denied tracking, show non-personalized ads
        if consentStatus == .obtained {
            // Show personalized ads
        } else {
            // Show non-personalized ads (lower revenue but GDPR compliant)
        }
    }
}
```

#### Non-EU Users

**For Users Outside EU:**
- GDPR doesn't apply
- Still show ATT prompt (Apple requirement)
- Can use standard AdMob without UMP
- Still recommended to have privacy policy

#### CCPA (California Privacy Law)

**Requirements:**
- Similar to GDPR for California users
- UMP SDK handles this automatically
- Privacy policy must mention CCPA rights

---

## Implementation Checklist

### Phase 1 (StoreKit + AdMob) - MVP

**Week 1: StoreKit Integration**
- [ ] Create IAP product in App Store Connect
- [ ] Implement `PurchaseManager` with StoreKit 2
- [ ] Add purchase UI (upgrade sheet)
- [ ] Test purchase flow in sandbox
- [ ] Implement restore purchases
- [ ] Add "Pro" badge in Settings when unlocked

**Week 2: AdMob Integration**
- [ ] Create AdMob account and app
- [ ] Create banner ad units (Scan, Gallery)
- [ ] Install Google Mobile Ads SDK
- [ ] Implement `BannerAdView` wrapper
- [ ] Implement `AdManager` tied to Pro status
- [ ] Add ad views to Scan and Gallery tabs
- [ ] Test ad display with test IDs

**Week 3: Privacy & Polish**
- [ ] Request ATT permission
- [ ] Implement UMP consent flow (GDPR)
- [ ] Create `PrivacyInfo.xcprivacy` manifest
- [ ] Write privacy policy (publish on web)
- [ ] Add privacy policy link in Settings
- [ ] Configure App Privacy labels in App Store Connect
- [ ] Test full flow: Free → Ads → Purchase → No Ads

**Week 4: Testing & Launch**
- [ ] Test all edge cases (refunds, restore, offline)
- [ ] TestFlight beta with 10+ users
- [ ] Monitor crash reports
- [ ] Verify ads and purchases work in production
- [ ] Submit to App Store

### Phase 2 (Backend + Accounts) - Future

**Only Implement If Needed:**
- [ ] Set up backend server (Node.js/Python)
- [ ] Implement server-side receipt validation
- [ ] Build user account system (Sign in with Apple)
- [ ] Create API endpoints for purchase validation
- [ ] Add cross-platform purchase checking
- [ ] Implement data sync (film stocks, notes)
- [ ] Add cloud photo storage (optional)
- [ ] Update privacy policy for new data collection

---

## Recommended Tech Stack

### Phase 1
- **Purchase Management:** StoreKit 2 (native iOS)
- **Ad Network:** Google AdMob
- **Local Storage:** Core Data (photos), UserDefaults (preferences)
- **Analytics:** None (for privacy) or Apple's built-in analytics only

### Phase 2
- **Backend:** Node.js + Express (or Python + FastAPI)
- **Database:** PostgreSQL (for user accounts, purchases)
- **Authentication:** Sign in with Apple + JWT
- **Hosting:** Railway, Fly.io, or DigitalOcean
- **Receipt Validation:** Apple's verifyReceipt API
- **Cloud Storage:** AWS S3 or Cloudflare R2 (if needed)

---

## Revenue Projections

### Assumptions
- **Price:** $9.99 one-time purchase
- **Conversion Rate:** 2-5% (typical for productivity apps)
- **Ad Revenue:** $0.50-2.00 per user per month (varies by geography)
- **User Base:** 10,000 monthly active users (conservative)

### Scenario Analysis

**Conservative (2% conversion):**
- 10,000 users
- 200 Pro purchases = $1,998 revenue
- 9,800 free users × $0.50 ad revenue = $4,900/month
- **Total: ~$6,900/month**

**Moderate (3.5% conversion):**
- 10,000 users
- 350 Pro purchases = $3,497 revenue
- 9,650 free users × $1.00 ad revenue = $9,650/month
- **Total: ~$13,147/month**

**Optimistic (5% conversion):**
- 10,000 users
- 500 Pro purchases = $4,995 revenue
- 9,500 free users × $2.00 ad revenue = $19,000/month
- **Total: ~$24,000/month**

**Notes:**
- Ad revenue drops significantly if many users disable tracking (ATT)
- Conversion rate increases with better onboarding and value proposition
- One-time purchase means most revenue from new users (not recurring)
- Consider subscription model in future for recurring revenue

---

## Key Recommendations Summary

### For Phase 1 (Launch)

1. **Use StoreKit-only authentication**
   - No backend needed
   - No user accounts needed
   - Simplest implementation
   - Best for privacy

2. **Implement Google AdMob**
   - Banner ads only (not interstitials)
   - Bottom of Scan and Gallery tabs
   - Disabled automatically for Pro users

3. **One-time purchase model**
   - $9.99 Pro unlock (non-consumable IAP)
   - Removes ads + unlocks premium features
   - Syncs automatically via Apple ID

4. **Privacy-first approach**
   - Minimal data collection
   - Local-only photo storage
   - ATT compliance for ads
   - Clear privacy policy

5. **Test thoroughly**
   - StoreKit sandbox environment
   - AdMob test ad units
   - Edge cases (refunds, restore)
   - TestFlight beta

### For Phase 2 (Future Growth)

1. **Consider backend only if:**
   - Need cross-platform support (web, Android)
   - Want cloud photo sync
   - Need enhanced piracy protection
   - Planning social features

2. **Use Sign in with Apple**
   - Best privacy compliance
   - Easiest UX
   - Required by Apple if offering other social logins

3. **Implement server-side receipt validation**
   - More secure
   - Audit trail
   - Cross-platform purchase tracking

4. **Subscription option**
   - For recurring revenue
   - Monthly/yearly tiers
   - Include cloud storage, advanced features

---

## Questions & Considerations

### Before Launch
- [ ] What's your target conversion rate (Pro purchases)?
- [ ] Will you offer trials or discounts?
- [ ] Will you enable Family Sharing?
- [ ] What countries will you launch in initially?
- [ ] Do you have a privacy policy URL ready?

### For Future Phases
- [ ] Do you plan to expand to Android or web?
- [ ] Will you need cloud photo storage?
- [ ] Do you want social/sharing features?
- [ ] Is server-side validation worth the cost?
- [ ] Would a subscription model work better?

---

## Resources

### Apple Documentation
- [StoreKit 2 Documentation](https://developer.apple.com/documentation/storekit)
- [In-App Purchase Guide](https://developer.apple.com/in-app-purchase/)
- [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)

### Google AdMob
- [AdMob iOS Quickstart](https://developers.google.com/admob/ios/quick-start)
- [UMP SDK (GDPR)](https://developers.google.com/admob/ump/ios/quick-start)

### Privacy & Compliance
- [Apple's Privacy Policy Template](https://www.apple.com/legal/privacy/en-ww/)
- [GDPR Overview](https://gdpr.eu/)
- [CCPA Compliance](https://oag.ca.gov/privacy/ccpa)

### Testing
- [StoreKit Testing in Xcode](https://developer.apple.com/documentation/xcode/setting-up-storekit-testing-in-xcode)
- [TestFlight Beta Testing](https://developer.apple.com/testflight/)

---

**Document Version:** 1.0
**Last Updated:** March 4, 2026
**Maintained By:** Development Team
**Next Review:** After Phase 1 launch
