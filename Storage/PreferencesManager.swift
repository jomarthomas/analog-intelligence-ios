//
//  PreferencesManager.swift
//  AnalogIntelligence
//
//  Manages user preferences and app settings
//

import Foundation
import Combine

/// User preferences model
struct UserPreferencesData: Codable {
    var defaultCaptureFormat: CaptureFormat = .heic
    var defaultExportFormat: ExportFormat = .jpeg
    var autoLockCalibration: Bool = false
    var saveToPhotosAfterProcessing: Bool = true
    var isPro: Bool = false

    // Additional preferences
    var showFrameNumbers: Bool = true
    var enableHapticFeedback: Bool = true
    var autoProcessNegatives: Bool = true
}

/// Capture format options
enum CaptureFormat: String, Codable, CaseIterable {
    case heic = "HEIC"
    case jpeg = "JPEG"
    case raw = "RAW"

    var displayName: String {
        return rawValue
    }
}

/// Export format options
enum ExportFormat: String, Codable, CaseIterable {
    case jpeg = "JPEG"
    case png = "PNG"
    case tiff = "TIFF"

    var displayName: String {
        return rawValue
    }

    var fileExtension: String {
        switch self {
        case .jpeg: return "jpg"
        case .png: return "png"
        case .tiff: return "tiff"
        }
    }
}

/// Manages user preferences with persistence
@MainActor
class PreferencesManager: ObservableObject {
    static let shared = PreferencesManager()

    @Published var preferences = UserPreferencesData() {
        didSet {
            savePreferences()
        }
    }

    private let preferencesKey = "com.analogintelligence.userPreferences"

    private init() {
        loadPreferences()
    }

    /// Load preferences from UserDefaults
    private func loadPreferences() {
        guard let data = UserDefaults.standard.data(forKey: preferencesKey),
              let decoded = try? JSONDecoder().decode(UserPreferencesData.self, from: data) else {
            // Use defaults
            return
        }

        preferences = decoded
    }

    /// Save preferences to UserDefaults
    private func savePreferences() {
        guard let encoded = try? JSONEncoder().encode(preferences) else {
            return
        }

        UserDefaults.standard.set(encoded, forKey: preferencesKey)
    }

    /// Update a specific preference using key path
    func updatePreference<T>(_ keyPath: WritableKeyPath<UserPreferencesData, T>, value: T) {
        preferences[keyPath: keyPath] = value
    }

    /// Reset to defaults
    func resetToDefaults() {
        preferences = UserPreferencesData()
    }
}
