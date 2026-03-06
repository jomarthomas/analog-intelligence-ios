//
//  UserPreferences.swift
//  AnalogIntelligence
//
//  App settings and user preferences.
//

import Foundation

/// User preferences and app settings
struct UserPreferences: Codable {

    // MARK: - Camera Settings

    var defaultCaptureFormat: CaptureFormat
    var enableRawCapture: Bool
    var autoLockCalibration: Bool
    var showGridOverlay: Bool
    var showHistogram: Bool

    // MARK: - Processing Settings

    var defaultExposure: Float
    var defaultWarmth: Float
    var defaultContrast: Float
    var autoApplyOrangeMaskCorrection: Bool
    var defaultSharpenAmount: Float

    // MARK: - Gallery Settings

    var galleryGridColumns: Int
    var sortOrder: GallerySortOrder
    var groupBySession: Bool
    var showMetadataInGallery: Bool

    // MARK: - Export Settings

    var defaultExportFormat: ExportFormat
    var saveToPhotosAfterProcessing: Bool
    var includeMetadataInExports: Bool
    var watermarkPosition: WatermarkPosition
    var jpegQuality: Float  // 0.0 - 1.0

    // MARK: - Pro Features

    var isPro: Bool
    var proUnlockDate: Date?

    // MARK: - AI Settings (Pro)

    var enableAIColorReconstruction: Bool
    var enableAIDustRemoval: Bool

    // MARK: - UI Settings

    var theme: AppTheme
    var hapticFeedback: Bool
    var soundEffects: Bool

    // MARK: - Privacy Settings

    var analyticsEnabled: Bool
    var crashReportingEnabled: Bool

    // MARK: - Initialization

    init(
        defaultCaptureFormat: CaptureFormat = .heic,
        enableRawCapture: Bool = false,
        autoLockCalibration: Bool = true,
        showGridOverlay: Bool = true,
        showHistogram: Bool = false,
        defaultExposure: Float = 0.0,
        defaultWarmth: Float = 0.0,
        defaultContrast: Float = 0.0,
        autoApplyOrangeMaskCorrection: Bool = true,
        defaultSharpenAmount: Float = 0.5,
        galleryGridColumns: Int = 3,
        sortOrder: GallerySortOrder = .newestFirst,
        groupBySession: Bool = true,
        showMetadataInGallery: Bool = false,
        defaultExportFormat: ExportFormat = .jpeg,
        saveToPhotosAfterProcessing: Bool = false,
        includeMetadataInExports: Bool = true,
        watermarkPosition: WatermarkPosition = .bottomRight,
        jpegQuality: Float = 0.95,
        isPro: Bool = false,
        proUnlockDate: Date? = nil,
        enableAIColorReconstruction: Bool = false,
        enableAIDustRemoval: Bool = false,
        theme: AppTheme = .system,
        hapticFeedback: Bool = true,
        soundEffects: Bool = true,
        analyticsEnabled: Bool = true,
        crashReportingEnabled: Bool = true
    ) {
        self.defaultCaptureFormat = defaultCaptureFormat
        self.enableRawCapture = enableRawCapture
        self.autoLockCalibration = autoLockCalibration
        self.showGridOverlay = showGridOverlay
        self.showHistogram = showHistogram
        self.defaultExposure = defaultExposure
        self.defaultWarmth = defaultWarmth
        self.defaultContrast = defaultContrast
        self.autoApplyOrangeMaskCorrection = autoApplyOrangeMaskCorrection
        self.defaultSharpenAmount = defaultSharpenAmount
        self.galleryGridColumns = galleryGridColumns
        self.sortOrder = sortOrder
        self.groupBySession = groupBySession
        self.showMetadataInGallery = showMetadataInGallery
        self.defaultExportFormat = defaultExportFormat
        self.saveToPhotosAfterProcessing = saveToPhotosAfterProcessing
        self.includeMetadataInExports = includeMetadataInExports
        self.watermarkPosition = watermarkPosition
        self.jpegQuality = jpegQuality
        self.isPro = isPro
        self.proUnlockDate = proUnlockDate
        self.enableAIColorReconstruction = enableAIColorReconstruction
        self.enableAIDustRemoval = enableAIDustRemoval
        self.theme = theme
        self.hapticFeedback = hapticFeedback
        self.soundEffects = soundEffects
        self.analyticsEnabled = analyticsEnabled
        self.crashReportingEnabled = crashReportingEnabled
    }
}

// MARK: - Supporting Enums

enum CaptureFormat: String, Codable, CaseIterable {
    case heic = "HEIC"
    case jpeg = "JPEG"
    case raw = "RAW (DNG)"

    var displayName: String {
        rawValue
    }
}

enum GallerySortOrder: String, Codable, CaseIterable {
    case newestFirst = "Newest First"
    case oldestFirst = "Oldest First"
    case sessionGrouped = "Grouped by Session"

    var displayName: String {
        rawValue
    }
}

enum ExportFormat: String, Codable, CaseIterable {
    case jpeg = "JPEG"
    case png = "PNG"
    case heic = "HEIC"
    case tiff = "TIFF"

    var displayName: String {
        rawValue
    }

    var fileExtension: String {
        switch self {
        case .jpeg: return "jpg"
        case .png: return "png"
        case .heic: return "heic"
        case .tiff: return "tiff"
        }
    }
}

enum WatermarkPosition: String, Codable, CaseIterable {
    case topLeft = "Top Left"
    case topRight = "Top Right"
    case bottomLeft = "Bottom Left"
    case bottomRight = "Bottom Right"
    case center = "Center"

    var displayName: String {
        rawValue
    }
}

enum AppTheme: String, Codable, CaseIterable {
    case light = "Light"
    case dark = "Dark"
    case system = "System"

    var displayName: String {
        rawValue
    }
}

// MARK: - UserPreferences Extensions

extension UserPreferences {

    /// Default preferences for new users
    static let `default` = UserPreferences()

    /// Check if user can access pro features
    var canAccessProFeatures: Bool {
        isPro
    }

    /// Get maximum export resolution based on Pro status
    var maxExportResolution: ExportResolution {
        isPro ? .full : .free
    }

    /// Check if watermark should be applied
    var shouldApplyWatermark: Bool {
        !isPro
    }

    /// Check if ads should be shown
    var shouldShowAds: Bool {
        !isPro
    }

    /// Unlock Pro features
    mutating func unlockPro() {
        isPro = true
        proUnlockDate = Date()
    }

    /// Reset to default settings
    mutating func resetToDefaults() {
        let currentProStatus = isPro
        let currentProUnlockDate = proUnlockDate

        self = UserPreferences.default

        // Preserve Pro status
        self.isPro = currentProStatus
        self.proUnlockDate = currentProUnlockDate
    }
}

// MARK: - Preferences Manager

/// Manages persistence of user preferences using UserDefaults
@MainActor
class PreferencesManager: ObservableObject {

    static let shared = PreferencesManager()

    @Published private(set) var preferences: UserPreferences

    private let userDefaultsKey = "com.analogintelligence.userPreferences"

    private init() {
        if let data = UserDefaults.standard.data(forKey: userDefaultsKey),
           let decoded = try? JSONDecoder().decode(UserPreferences.self, from: data) {
            self.preferences = decoded
        } else {
            self.preferences = .default
        }
    }

    /// Update preferences
    func update(_ newPreferences: UserPreferences) {
        preferences = newPreferences
        save()
    }

    /// Update a specific preference
    func updatePreference<T>(_ keyPath: WritableKeyPath<UserPreferences, T>, value: T) {
        preferences[keyPath: keyPath] = value
        save()
    }

    /// Save preferences to UserDefaults
    private func save() {
        if let encoded = try? JSONEncoder().encode(preferences) {
            UserDefaults.standard.set(encoded, forKey: userDefaultsKey)
        }
    }

    /// Reset all preferences to defaults
    func resetToDefaults() {
        preferences.resetToDefaults()
        save()
    }

    /// Unlock Pro features
    func unlockPro() {
        preferences.unlockPro()
        save()
    }
}
