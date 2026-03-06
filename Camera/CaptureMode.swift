//
//  CaptureMode.swift
//  Analog Intelligence
//
//  Camera capture mode definitions for HEIC, JPEG, and RAW (DNG) formats
//

import Foundation
import AVFoundation

/// Defines the available capture formats for still images
enum CaptureMode: String, CaseIterable, Identifiable {
    case heic = "HEIC"
    case jpeg = "JPEG"
    case raw = "RAW (DNG)"

    var id: String { rawValue }

    /// User-friendly display name
    var displayName: String {
        return rawValue
    }

    /// File extension for the capture mode
    var fileExtension: String {
        switch self {
        case .heic:
            return "heic"
        case .jpeg:
            return "jpg"
        case .raw:
            return "dng"
        }
    }

    /// UTI (Uniform Type Identifier) for the capture format
    var uti: String {
        switch self {
        case .heic:
            return AVFileType.heic.rawValue
        case .jpeg:
            return AVFileType.jpg.rawValue
        case .raw:
            return "com.adobe.raw-image" // DNG format
        }
    }

    /// Whether this mode is available on the current device
    func isAvailable(for device: AVCaptureDevice) -> Bool {
        switch self {
        case .heic, .jpeg:
            return true
        case .raw:
            // RAW is only available if the device supports it
            return device.activeFormat.supportedMaxPhotoDimensions.count > 0
        }
    }

    /// Configure photo settings for this capture mode
    func photoSettings(rawEnabled: Bool = false) -> AVCapturePhotoSettings {
        let settings: AVCapturePhotoSettings

        switch self {
        case .heic:
            settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.hevc])

        case .jpeg:
            settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])

        case .raw:
            // RAW mode captures both RAW (DNG) and a processed companion image
            guard let rawFormat = AVCapturePhotoOutput().availableRawPhotoPixelFormatTypes.first else {
                // Fallback to JPEG if RAW not available
                return AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            }
            settings = AVCapturePhotoSettings(rawPixelFormatType: rawFormat)
        }

        return settings
    }
}

extension CaptureMode {
    var preferenceFormat: CaptureFormat {
        switch self {
        case .heic:
            return .heic
        case .jpeg:
            return .jpeg
        case .raw:
            return .raw
        }
    }
}

extension CaptureFormat {
    var captureMode: CaptureMode {
        switch self {
        case .heic:
            return .heic
        case .jpeg:
            return .jpeg
        case .raw:
            return .raw
        }
    }
}

/// Camera quality preset configuration
enum CameraQuality: String, CaseIterable {
    case high = "High"
    case medium = "Medium"
    case low = "Low"

    var sessionPreset: AVCaptureSession.Preset {
        switch self {
        case .high:
            return .photo
        case .medium:
            return .high
        case .low:
            return .medium
        }
    }
}

/// Camera flash mode options
enum FlashMode: String, CaseIterable, Identifiable {
    case off = "Off"
    case on = "On"
    case auto = "Auto"

    var id: String { rawValue }

    var avFlashMode: AVCaptureDevice.FlashMode {
        switch self {
        case .off:
            return .off
        case .on:
            return .on
        case .auto:
            return .auto
        }
    }
}

/// Torch mode for continuous light during preview
enum TorchMode: String, CaseIterable {
    case off = "Off"
    case on = "On"

    var avTorchMode: AVCaptureDevice.TorchMode {
        switch self {
        case .off:
            return .off
        case .on:
            return .on
        }
    }
}
