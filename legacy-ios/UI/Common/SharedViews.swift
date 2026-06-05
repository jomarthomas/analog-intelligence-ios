import SwiftUI

struct ProUpgradeView: View {
    var body: some View {
        ProUnlockView()
    }
}

struct SettingsView: View {
    @Binding var isProUser: Bool
    @StateObject private var purchaseState = PurchaseState.shared
    @StateObject private var preferencesManager = PreferencesManager.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            Form {
                Section("Account") {
                    HStack {
                        Label("Current Tier", systemImage: purchaseState.isPro ? "crown.fill" : "person")
                        Spacer()
                        Text(purchaseState.isPro ? "Pro" : "Free")
                            .foregroundColor(.secondary)
                    }

                    if !purchaseState.isPro {
                        Button {
                            Task { await StoreKitManager.shared.purchaseProUnlock() }
                        } label: {
                            Label("Unlock Pro", systemImage: "sparkles")
                        }
                    }

                    Button("Restore Purchases") {
                        Task { await StoreKitManager.shared.restorePurchases() }
                    }
                }

                Section("Capture") {
                    Picker("Default Format", selection: Binding(
                        get: { preferencesManager.preferences.defaultCaptureFormat },
                        set: { preferencesManager.updatePreference(\.defaultCaptureFormat, value: $0) }
                    )) {
                        ForEach(CaptureFormat.allCases, id: \.self) { format in
                            Text(format.displayName).tag(format)
                        }
                    }

                    Toggle("Auto Lock Calibration", isOn: Binding(
                        get: { preferencesManager.preferences.autoLockCalibration },
                        set: { preferencesManager.updatePreference(\.autoLockCalibration, value: $0) }
                    ))
                }

                Section("Export") {
                    Picker("Default Export Format", selection: Binding(
                        get: { preferencesManager.preferences.defaultExportFormat },
                        set: { preferencesManager.updatePreference(\.defaultExportFormat, value: $0) }
                    )) {
                        ForEach(ExportFormat.allCases, id: \.self) { format in
                            Text(format.displayName).tag(format)
                        }
                    }

                    Toggle("Save to Photos by Default", isOn: Binding(
                        get: { preferencesManager.preferences.saveToPhotosAfterProcessing },
                        set: { preferencesManager.updatePreference(\.saveToPhotosAfterProcessing, value: $0) }
                    ))
                }

                Section("Free vs Pro") {
                    Text("Free: Watermark, ads, and export resolution limit")
                    Text("Pro: No watermark, no ads, full export resolution, insights")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .onAppear {
            isProUser = purchaseState.isPro
            preferencesManager.updatePreference(\.isPro, value: purchaseState.isPro)
        }
        .onChange(of: purchaseState.isPro) { _, newValue in
            isProUser = newValue
            preferencesManager.updatePreference(\.isPro, value: newValue)
        }
    }
}

struct WatermarkView: View {
    var body: some View {
        Text("AI Watermark")
            .font(AnalogTheme.caption())
            .foregroundColor(.white.opacity(0.8))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(.black.opacity(0.45))
            )
    }
}

struct ProFeatureLock: View {
    let featureName: String
    let featureDescription: String
    let onUpgrade: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "lock.circle.fill")
                .font(.system(size: 64))
                .foregroundColor(.secondary)

            Text("\(featureName) is a Pro Feature")
                .font(.title3)
                .fontWeight(.semibold)

            Text(featureDescription)
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button {
                onUpgrade()
            } label: {
                Label("Upgrade to Pro", systemImage: "crown.fill")
                    .font(.headline)
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(Color.blue)
                    .clipShape(Capsule())
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct HistogramChart: View {
    let data: [Double]

    var body: some View {
        GeometryReader { geometry in
            let maxValue = max(data.max() ?? 1, 1)
            HStack(alignment: .bottom, spacing: 1) {
                ForEach(Array(data.enumerated()), id: \.offset) { _, value in
                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [AnalogTheme.primaryOrange, AnalogTheme.primaryOrange.opacity(0.6)],
                                startPoint: .bottom,
                                endPoint: .top
                            )
                        )
                        .frame(height: max(1, CGFloat(value / maxValue) * geometry.size.height))
                }
            }
        }
        .background(Color.black.opacity(0.3))
        .cornerRadius(AnalogTheme.cornerRadiusSmall)
    }
}

struct ExposureAnalysisCard: View {
    let insight: RollInsight

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: iconName)
                .foregroundColor(iconColor)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 4) {
                Text(insight.title)
                    .font(.headline)
                Text(insight.description)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    private var iconName: String {
        switch insight.type {
        case .positive: return "checkmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .info: return "info.circle.fill"
        }
    }

    private var iconColor: Color {
        switch insight.type {
        case .positive: return .green
        case .warning: return .orange
        case .info: return .blue
        }
    }
}
//
//  DesignSystem.swift
//  AnalogIntelligence
//
//  Design system matching the mockup specifications
//  Dark theme with orange accents
//

import SwiftUI

/// Brand colors and design tokens
struct AnalogTheme {

    // MARK: - Colors

    /// Primary brand color - Orange accent
    static let primaryOrange = Color(red: 1.0, green: 0.6, blue: 0.2) // #FF9933

    /// Background colors
    static let backgroundDark = Color(red: 0.08, green: 0.08, blue: 0.12) // #141418
    static let backgroundCard = Color(red: 0.12, green: 0.12, blue: 0.16) // #1E1E28
    static let backgroundOverlay = Color.black.opacity(0.5)

    /// Text colors
    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.7)
    static let textTertiary = Color.white.opacity(0.5)

    /// Pro badge color
    static let proBadge = primaryOrange

    /// Slider colors
    static let sliderTrack = primaryOrange
    static let sliderBackground = Color.white.opacity(0.2)

    // MARK: - Typography

    static func title() -> Font {
        .system(size: 20, weight: .semibold)
    }

    static func headline() -> Font {
        .system(size: 17, weight: .semibold)
    }

    static func body() -> Font {
        .system(size: 15, weight: .regular)
    }

    static func caption() -> Font {
        .system(size: 13, weight: .medium)
    }

    // MARK: - Spacing

    static let paddingSmall: CGFloat = 8
    static let paddingMedium: CGFloat = 16
    static let paddingLarge: CGFloat = 24

    // MARK: - Corner Radius

    static let cornerRadiusSmall: CGFloat = 8
    static let cornerRadiusMedium: CGFloat = 12
    static let cornerRadiusLarge: CGFloat = 16

    // MARK: - Shadows

    static let cardShadow: (color: Color, radius: CGFloat, x: CGFloat, y: CGFloat) = (
        color: Color.black.opacity(0.3),
        radius: 8,
        x: 0,
        y: 4
    )
}

// MARK: - View Modifiers

struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(AnalogTheme.backgroundCard)
            .cornerRadius(AnalogTheme.cornerRadiusMedium)
            .shadow(
                color: AnalogTheme.cardShadow.color,
                radius: AnalogTheme.cardShadow.radius,
                x: AnalogTheme.cardShadow.x,
                y: AnalogTheme.cardShadow.y
            )
    }
}

struct ProBadgeStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(AnalogTheme.caption())
            .foregroundColor(.black)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(AnalogTheme.proBadge)
            .cornerRadius(4)
    }
}

extension View {
    func cardStyle() -> some View {
        modifier(CardStyle())
    }

    func proBadge() -> some View {
        modifier(ProBadgeStyle())
    }
}

// MARK: - AdMob Integration Stubs
// NOTE: Full implementation is in Purchases/AdMobManager.swift and Purchases/BannerAdView.swift
// TODO: Add those files to the Xcode project for complete AdMob functionality

/// Ad load state
enum AdLoadState: Equatable {
    case notLoaded
    case loading
    case loaded
    case failed(String)
}

/// AdMob Manager (Stub - full implementation in AdMobManager.swift)
@MainActor
class AdMobManager: ObservableObject {
    static let shared = AdMobManager()
    
    @Published var adState: AdLoadState = .notLoaded
    @Published var isInitialized: Bool = false
    
    var currentBannerAdUnitID: String {
        "ca-app-pub-3940256099942544/2934735716" // Test ID
    }
    
    var standardBannerHeight: CGFloat {
        50
    }
    
    private init() {}
    
    func updateAdVisibility() {
        // Stub
    }
    
    func logAdImpression(adUnitID: String) {
        print("📊 [AdMob] Impression: \(adUnitID)")
    }
    
    func logAdClick(adUnitID: String) {
        print("👆 [AdMob] Click: \(adUnitID)")
    }
    
    func logAdFailure(adUnitID: String, error: String) {
        print("❌ [AdMob] Failure: \(error)")
    }
}

/// Enhanced Banner Ad View with AdMob integration
struct BannerAdView: View {
    @StateObject private var purchaseState = PurchaseState.shared
    @StateObject private var adMobManager = AdMobManager.shared

    var body: some View {
        Group {
            if !purchaseState.isPro {
                VStack(spacing: 0) {
                    Divider()
                        .background(Color.gray.opacity(0.3))

                    // Ad placeholder (will show real ads when AdMob SDK is added)
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
                    .frame(height: adMobManager.standardBannerHeight)
                    .padding(.horizontal, AnalogTheme.paddingMedium)
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
