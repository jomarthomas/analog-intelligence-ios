# Phase 3: iOS Film Scanner Feature Expansion Roadmap

**Document Version:** 1.0
**Date:** March 5, 2026
**Status:** Planning & Implementation Phase
**Target Completion:** Q2 2026

---

## Executive Summary

This document outlines the strategic expansion of Analog Intelligence's film scanning capabilities beyond the current MVP. Based on the comprehensive codebase audit, we've identified **4 critical** and **8 enhancement** features that will elevate the app to professional-grade status.

**Current State:** Phase 1 MVP complete (negative inversion engine ✅, camera system ✅, monetization ✅)

**Phase 3 Goals:**
1. Implement missing critical features (DNG export, manual controls, focus peaking, auto-crop)
2. Add advanced capture controls for professional photographers
3. Enhance image processing with perspective correction and EXIF metadata
4. Improve UI/UX with grid overlays and live feedback
5. Optimize performance with Metal shaders

---

## Priority Matrix

### Critical Path (P0) - Ship Blockers

| Feature | Priority | Effort | Impact | Status |
|---------|----------|--------|--------|--------|
| DNG/RAW Export | P0 | 2-3 days | 🔥 Pro differentiator | ❌ |
| Manual Camera Controls UI | P0 | 3-5 days | 🔥 Essential for pros | ❌ |
| Focus Peaking | P0 | 5-7 days | 🔥 Critical for sharpness | ❌ |
| Automatic Frame Detection | P0 | 7-10 days | 🔥 Major UX improvement | ❌ |

**Total P0 Effort:** 17-25 days (3-5 weeks)

### High Priority (P1) - Next Sprint

| Feature | Priority | Effort | Impact | Status |
|---------|----------|--------|--------|--------|
| Live Histogram Overlay | P1 | 2-3 days | ⚡ Exposure confidence | ❌ |
| EXIF Metadata Writing | P1 | 2-3 days | ⚡ Archival quality | ⚠️ Partial |
| Perspective Correction UI | P1 | 3-4 days | ⚡ Professional workflow | ⚠️ Backend only |
| Grid Overlays | P1 | 1-2 days | ⚡ Composition aid | ❌ |

**Total P1 Effort:** 8-12 days (2 weeks)

### Medium Priority (P2) - Future Enhancements

| Feature | Priority | Effort | Impact | Status |
|---------|----------|--------|--------|--------|
| Lens Selection UI | P2 | 1-2 days | 📈 Hardware utilization | ⚠️ Backend only |
| Macro Mode Support | P2 | 2-3 days | 📈 Close-up scanning | ❌ |
| Metal Performance Optimization | P2 | 5-7 days | 📈 2x processing speed | ❌ |
| Contact Sheet Customization | P2 | 3-4 days | 📈 Pro feature enhancement | ⚠️ Basic only |

**Total P2 Effort:** 11-16 days (2-3 weeks)

**Grand Total:** 36-53 days (7-10 weeks) for all features

---

## Feature Specifications & Implementation

## 1. DNG/RAW Export (P0)

### Current Gap
- RAW capture ✅ (AVFoundation)
- RAW storage ✅ (ScannedImage.rawData)
- RAW export ❌ (only JPEG/HEIC exported)

### User Story
**As a** professional photographer
**I want to** export my scanned negatives as DNG files
**So that** I can perform advanced color grading in Lightroom/Capture One with maximum flexibility

### Technical Specification

#### Export Format Addition

```swift
// Processing/Pipeline/ExportManager.swift

enum ExportFormat: String, CaseIterable {
    case jpeg = "JPEG"
    case png = "PNG"
    case heic = "HEIC"
    case dng = "DNG (RAW)"  // ← NEW

    var uti: String {
        switch self {
        case .jpeg: return "public.jpeg"
        case .png: return "public.png"
        case .heic: return "public.heic"
        case .dng: return "com.adobe.raw-image"
        }
    }

    var fileExtension: String {
        switch self {
        case .jpeg: return "jpg"
        case .png: return "png"
        case .heic: return "heic"
        case .dng: return "dng"
        }
    }

    var isProOnly: Bool {
        switch self {
        case .dng: return true
        case .heic: return true  // Full quality HEIC is Pro
        default: return false
        }
    }
}
```

#### DNG Export Implementation

```swift
extension ExportManager {
    /// Export scanned image as DNG (RAW) file
    /// - Parameters:
    ///   - scannedImage: The image to export (must have rawData)
    ///   - includeMetadata: Whether to embed EXIF/IPTC metadata
    /// - Returns: DNG file data
    /// - Throws: ExportError if rawData is missing or metadata write fails
    func exportDNG(
        _ scannedImage: ScannedImage,
        includeMetadata: Bool = true
    ) async throws -> Data {
        // Ensure RAW data exists
        guard let rawData = scannedImage.rawData else {
            throw ExportError.noRawDataAvailable
        }

        // If no metadata needed, return raw DNG directly
        guard includeMetadata else {
            return rawData
        }

        // Otherwise, write EXIF/IPTC metadata to DNG
        return try writeMetadataToDNG(rawData, metadata: scannedImage.metadata)
    }

    /// Write EXIF and IPTC metadata to DNG file
    private func writeMetadataToDNG(
        _ dngData: Data,
        metadata: ScannedImage.Metadata
    ) throws -> Data {
        // Create image source from DNG data
        guard let source = CGImageSourceCreateWithData(dngData as CFData, nil) else {
            throw ExportError.invalidDNGData
        }

        guard let uti = CGImageSourceGetType(source) else {
            throw ExportError.unknownImageType
        }

        // Create mutable data for output
        let mutableData = NSMutableData(data: dngData)

        guard let destination = CGImageDestinationCreateWithData(
            mutableData,
            uti,
            1,
            nil
        ) else {
            throw ExportError.failedToCreateDestination
        }

        // Get existing properties
        var properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] ?? [:]

        // Build EXIF dictionary
        var exifDict = properties[kCGImagePropertyExifDictionary] as? [CFString: Any] ?? [:]

        // Film stock (UserComment field)
        if let filmStock = metadata.filmStock {
            exifDict[kCGImagePropertyExifUserComment] = filmStock
        }

        // ISO speed rating
        if let iso = metadata.iso {
            exifDict[kCGImagePropertyExifISOSpeedRatings] = [iso]
        }

        // Exposure time (shutter speed)
        if let shutterSpeed = metadata.shutterSpeed {
            exifDict[kCGImagePropertyExifExposureTime] = shutterSpeed
        }

        // Aperture (if available)
        if let aperture = metadata.aperture,
           let fNumber = parseAperture(aperture) {
            exifDict[kCGImagePropertyExifFNumber] = fNumber
        }

        // Lens model (scan device info)
        exifDict[kCGImagePropertyExifLensMake] = "Apple"
        exifDict[kCGImagePropertyExifLensModel] = metadata.deviceModel

        // Software used
        exifDict[kCGImagePropertyExifSoftware] = "Analog Intelligence v\\(metadata.appVersion)"

        // Date/time original (scan date)
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy:MM:dd HH:mm:ss"
        exifDict[kCGImagePropertyExifDateTimeOriginal] = dateFormatter.string(from: metadata.scanDate)

        properties[kCGImagePropertyExifDictionary] = exifDict

        // Build TIFF dictionary
        var tiffDict = properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any] ?? [:]
        tiffDict[kCGImagePropertyTIFFMake] = "Apple"
        tiffDict[kCGImagePropertyTIFFModel] = metadata.deviceModel
        tiffDict[kCGImagePropertyTIFFSoftware] = "Analog Intelligence"

        if let notes = metadata.notes {
            tiffDict[kCGImagePropertyTIFFImageDescription] = notes
        }

        properties[kCGImagePropertyTIFFDictionary] = tiffDict

        // Build IPTC dictionary (copyright, photographer, etc.)
        var iptcDict = properties[kCGImagePropertyIPTCDictionary] as? [CFString: Any] ?? [:]

        iptcDict[kCGImagePropertyIPTCCopyrightNotice] = "Scanned with Analog Intelligence"
        iptcDict[kCGImagePropertyIPTCSource] = "Film scan"
        iptcDict[kCGImagePropertyIPTCKeywords] = [
            "film",
            "analog",
            metadata.filmStock ?? "unknown",
            metadata.filmType.rawValue
        ]

        if let exposureNumber = metadata.exposureNumber {
            iptcDict[kCGImagePropertyIPTCImageNumber] = "Frame \\(exposureNumber)"
        }

        properties[kCGImagePropertyIPTCDictionary] = iptcDict

        // Write image with updated metadata
        CGImageDestinationAddImageFromSource(
            destination,
            source,
            0,
            properties as CFDictionary
        )

        guard CGImageDestinationFinalize(destination) else {
            throw ExportError.failedToFinalize
        }

        return mutableData as Data
    }

    /// Parse aperture string (e.g., "f/2.8") to f-number
    private func parseAperture(_ aperture: String) -> Double? {
        let cleaned = aperture.replacingOccurrences(of: "f/", with: "")
        return Double(cleaned)
    }
}

enum ExportError: Error {
    case noRawDataAvailable
    case invalidDNGData
    case unknownImageType
    case failedToCreateDestination
    case failedToFinalize
    case unsupportedFormat

    var localizedDescription: String {
        switch self {
        case .noRawDataAvailable:
            return "No RAW data available for export. Ensure you captured in RAW mode."
        case .invalidDNGData:
            return "The DNG data is corrupted or invalid."
        case .unknownImageType:
            return "Unknown image type."
        case .failedToCreateDestination:
            return "Failed to create export destination."
        case .failedToFinalize:
            return "Failed to finalize export."
        case .unsupportedFormat:
            return "This export format is not supported."
        }
    }
}
```

#### UI Integration

```swift
// UI/Gallery/ImageDetailView.swift - Export menu

Button {
    showingExportOptions = true
} label: {
    Label("Export", systemImage: "square.and.arrow.up")
}
.sheet(isPresented: $showingExportOptions) {
    ExportOptionsSheet(image: image)
}

// New view: UI/Gallery/ExportOptionsSheet.swift
struct ExportOptionsSheet: View {
    let image: ScannedImage
    @StateObject private var purchaseState = PurchaseState.shared
    @State private var selectedFormat: ExportFormat = .jpeg
    @State private var isExporting = false
    @Environment(\\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            Form {
                Section("Format") {
                    Picker("Export Format", selection: $selectedFormat) {
                        ForEach(ExportFormat.allCases, id: \\.self) { format in
                            HStack {
                                Text(format.rawValue)

                                if format.isProOnly && !purchaseState.isPro {
                                    Text("PRO")
                                        .font(.caption)
                                        .foregroundColor(.white)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(AnalogTheme.primaryOrange)
                                        .cornerRadius(4)
                                }
                            }
                            .tag(format)
                        }
                    }
                    .pickerStyle(.inline)
                }

                Section {
                    Button(action: exportImage) {
                        if isExporting {
                            HStack {
                                ProgressView()
                                Text("Exporting...")
                            }
                        } else {
                            Text("Export")
                        }
                    }
                    .disabled(isExporting || (selectedFormat.isProOnly && !purchaseState.isPro))
                }
            }
            .navigationTitle("Export Options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func exportImage() {
        Task {
            isExporting = true
            defer { isExporting = false }

            do {
                let exportManager = ExportManager.shared

                let data: Data
                switch selectedFormat {
                case .dng:
                    data = try await exportManager.exportDNG(image, includeMetadata: true)
                case .jpeg, .png, .heic:
                    data = try await exportManager.export(
                        image: CIImage(data: image.processedData)!,
                        format: selectedFormat,
                        quality: purchaseState.isPro ? .maximum : .medium,
                        context: exportManager.ciContext
                    )
                }

                // Save to Photos or share
                try await saveToPhotos(data, format: selectedFormat)

                dismiss()
            } catch {
                // Show error alert
            }
        }
    }
}
```

#### Testing Checklist

- [ ] DNG export preserves full RAW data
- [ ] EXIF metadata written correctly (film stock, ISO, scan date)
- [ ] IPTC metadata includes keywords and copyright
- [ ] Exported DNG opens in Lightroom Classic
- [ ] Exported DNG opens in Capture One
- [ ] Exported DNG opens in Photos.app (macOS)
- [ ] File size reasonable (12MP DNG ~15-20MB typical)
- [ ] Pro-only restriction enforced (free users see upgrade prompt)

---

## 2. Manual Camera Controls UI (P0)

### Current Gap
- Backend API ✅ (CalibrationManager)
- UI controls ❌ (only calibration lock button)

### User Story
**As a** film photographer
**I want to** manually adjust focus, ISO, shutter speed, and white balance during scanning
**So that** I can achieve optimal exposure and sharpness for each negative

### Technical Specification

#### New File: `UI/Scan/ManualControlsPanel.swift`

```swift
import SwiftUI
import AVFoundation

/// Expandable panel with manual camera controls (focus, ISO, shutter, WB)
struct ManualControlsPanel: View {
    @ObservedObject var calibrationManager: CalibrationManager
    @State private var isExpanded = false
    @State private var shutterSpeedLog: Double = -7.0  // Log scale for shutter (1/125s default)
    @State private var selectedWBPreset: WBPreset = .auto

    var body: some View {
        VStack(spacing: 0) {
            // Header (collapse/expand)
            Button {
                withAnimation(.spring(response: 0.3)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: 18, weight: .medium))

                    Text("Manual Controls")
                        .font(.system(size: 16, weight: .semibold))

                    Spacer()

                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(.white)
                .padding()
                .background(Color.black.opacity(0.7))
            }

            if isExpanded {
                VStack(spacing: 20) {
                    // Focus slider
                    FocusControl(calibrationManager: calibrationManager)

                    Divider()
                        .background(Color.white.opacity(0.3))

                    // ISO slider
                    ISOControl(calibrationManager: calibrationManager)

                    Divider()
                        .background(Color.white.opacity(0.3))

                    // Shutter speed slider
                    ShutterSpeedControl(
                        calibrationManager: calibrationManager,
                        shutterSpeedLog: $shutterSpeedLog
                    )

                    Divider()
                        .background(Color.white.opacity(0.3))

                    // White balance preset picker
                    WhiteBalanceControl(
                        calibrationManager: calibrationManager,
                        selectedPreset: $selectedWBPreset
                    )
                }
                .padding()
                .background(Color.black.opacity(0.7))
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.3), radius: 8, x: 0, y: 4)
    }
}

// MARK: - Focus Control

struct FocusControl: View {
    @ObservedObject var calibrationManager: CalibrationManager

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Focus")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)

                Spacer()

                if calibrationManager.isFocusLocked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 12))
                        .foregroundColor(AnalogTheme.primaryOrange)
                }
            }

            HStack(spacing: 12) {
                Text("∞")  // Infinity symbol
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
                    .frame(width: 20)

                Slider(
                    value: Binding(
                        get: { Double(calibrationManager.currentLensPosition) },
                        set: { newValue in
                            Task {
                                try? await calibrationManager.setFocus(lensPosition: Float(newValue))
                            }
                        }
                    ),
                    in: 0.0...1.0
                )
                .tint(AnalogTheme.primaryOrange)

                Image(systemName: "hand.point.up.left.fill")
                    .font(.system(size: 16))
                    .foregroundColor(.white.opacity(0.7))
                    .frame(width: 20)
            }

            // Distance indicator (approximate)
            Text(focusDistanceDescription)
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.6))
        }
    }

    private var focusDistanceDescription: String {
        let position = calibrationManager.currentLensPosition

        if position < 0.1 {
            return "Focus: Infinity (∞)"
        } else if position < 0.3 {
            return "Focus: ~5-10m"
        } else if position < 0.5 {
            return "Focus: ~2-5m"
        } else if position < 0.7 {
            return "Focus: ~1-2m"
        } else if position < 0.9 {
            return "Focus: ~0.5-1m"
        } else {
            return "Focus: Macro (~10-50cm)"
        }
    }
}

// MARK: - ISO Control

struct ISOControl: View {
    @ObservedObject var calibrationManager: CalibrationManager

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("ISO")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)

                Spacer()

                if calibrationManager.isExposureLocked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 12))
                        .foregroundColor(AnalogTheme.primaryOrange)
                }
            }

            HStack(spacing: 12) {
                Text("\\(Int(calibrationManager.isoRange.lowerBound))")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.7))
                    .frame(width: 40, alignment: .leading)

                Slider(
                    value: Binding(
                        get: { Double(calibrationManager.currentISO) },
                        set: { newValue in
                            updateExposure(iso: Float(newValue))
                        }
                    ),
                    in: Double(calibrationManager.isoRange.lowerBound)...Double(calibrationManager.isoRange.upperBound)
                )
                .tint(AnalogTheme.primaryOrange)

                Text("\\(Int(calibrationManager.isoRange.upperBound))")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.7))
                    .frame(width: 40, alignment: .trailing)
            }

            // Current ISO value
            Text("Current: ISO \\(Int(calibrationManager.currentISO))")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(AnalogTheme.primaryOrange)
        }
    }

    private func updateExposure(iso: Float) {
        Task {
            try? await calibrationManager.setExposure(
                iso: iso,
                duration: calibrationManager.currentExposureDuration
            )
        }
    }
}

// MARK: - Shutter Speed Control

struct ShutterSpeedControl: View {
    @ObservedObject var calibrationManager: CalibrationManager
    @Binding var shutterSpeedLog: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Shutter Speed")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)

                Spacer()

                if calibrationManager.isExposureLocked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 12))
                        .foregroundColor(AnalogTheme.primaryOrange)
                }
            }

            HStack(spacing: 12) {
                Text("Fast")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.7))
                    .frame(width: 40, alignment: .leading)

                Slider(value: $shutterSpeedLog, in: -15.0...0.0)  // Log scale
                    .tint(AnalogTheme.primaryOrange)
                    .onChange(of: shutterSpeedLog) { _, newValue in
                        updateShutterSpeed(logValue: newValue)
                    }

                Text("Slow")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.7))
                    .frame(width: 40, alignment: .trailing)
            }

            // Current shutter speed
            Text("Current: \\(formattedShutterSpeed)")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(AnalogTheme.primaryOrange)
        }
        .onAppear {
            // Initialize slider from current exposure duration
            let seconds = CMTimeGetSeconds(calibrationManager.currentExposureDuration)
            shutterSpeedLog = log2(seconds)
        }
    }

    private var formattedShutterSpeed: String {
        let seconds = pow(2.0, shutterSpeedLog)

        if seconds >= 0.5 {
            return String(format: "%.1fs", seconds)
        } else {
            let denominator = Int(1.0 / seconds)
            return "1/\\(denominator)s"
        }
    }

    private func updateShutterSpeed(logValue: Double) {
        let seconds = pow(2.0, logValue)
        let duration = CMTime(seconds: seconds, preferredTimescale: 1000000)

        Task {
            try? await calibrationManager.setExposure(
                iso: calibrationManager.currentISO,
                duration: duration
            )
        }
    }
}

// MARK: - White Balance Control

struct WhiteBalanceControl: View {
    @ObservedObject var calibrationManager: CalibrationManager
    @Binding var selectedPreset: WBPreset

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("White Balance")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)

                Spacer()

                if calibrationManager.isWhiteBalanceLocked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 12))
                        .foregroundColor(AnalogTheme.primaryOrange)
                }
            }

            Picker("WB Preset", selection: $selectedPreset) {
                ForEach(WBPreset.allCases) { preset in
                    Text(preset.rawValue).tag(preset)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: selectedPreset) { _, newValue in
                applyWBPreset(newValue)
            }

            Text(selectedPreset.description)
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.6))
        }
    }

    private func applyWBPreset(_ preset: WBPreset) {
        guard let device = calibrationManager.cameraManager?.currentCaptureDevice else { return }

        Task {
            try? await calibrationManager.setWhiteBalance(gains: preset.gains(for: device))
        }
    }
}

// MARK: - White Balance Presets

enum WBPreset: String, CaseIterable, Identifiable {
    case auto = "Auto"
    case daylight = "Day"
    case cloudy = "Cloudy"
    case tungsten = "Tungsten"
    case fluorescent = "Fluor"
    case flash = "Flash"

    var id: String { rawValue }

    var description: String {
        switch self {
        case .auto:
            return "Automatic white balance"
        case .daylight:
            return "~5500K (sunny daylight)"
        case .cloudy:
            return "~6500K (overcast sky)"
        case .tungsten:
            return "~3200K (incandescent bulbs)"
        case .fluorescent:
            return "~4000K (office lighting)"
        case .flash:
            return "~5500K (camera flash)"
        }
    }

    func gains(for device: AVCaptureDevice) -> AVCaptureDevice.WhiteBalanceGains {
        // Convert color temperature to white balance gains
        // These are approximate values and may need device-specific calibration

        let temperature: Float
        switch self {
        case .auto:
            return device.deviceWhiteBalanceGains  // Current auto WB
        case .daylight:
            temperature = 5500
        case .cloudy:
            temperature = 6500
        case .tungsten:
            temperature = 3200
        case .fluorescent:
            temperature = 4000
        case .flash:
            temperature = 5500
        }

        // Convert Kelvin to RGB gains (simplified model)
        // More accurate conversion would use chromaticity diagrams

        let normalizedTemp = (temperature - 3000) / (8000 - 3000)  // Normalize to 0-1

        var redGain: Float
        var blueGain: Float
        let greenGain: Float = 1.0  // Green is reference

        if temperature < 5500 {
            // Warm light (more red, less blue)
            redGain = 1.0 + (1.0 - normalizedTemp) * 0.5
            blueGain = 0.8 + normalizedTemp * 0.4
        } else {
            // Cool light (less red, more blue)
            redGain = 1.0 - (normalizedTemp - 0.5) * 0.3
            blueGain = 1.0 + (normalizedTemp - 0.5) * 0.6
        }

        // Clamp to device limits
        redGain = min(max(redGain, 1.0), device.maxWhiteBalanceGain)
        blueGain = min(max(blueGain, 1.0), device.maxWhiteBalanceGain)

        return AVCaptureDevice.WhiteBalanceGains(
            redGain: redGain,
            greenGain: greenGain,
            blueGain: blueGain
        )
    }
}

#Preview {
    ManualControlsPanel(calibrationManager: CalibrationManager())
        .padding()
        .background(Color.gray)
}
```

#### Integration in `ScanView.swift`

```swift
// Add to ScanView body
ZStack {
    CameraPreviewView(previewLayer: cameraManager.previewLayer)
        .ignoresSafeArea()

    // ... existing overlays

    VStack {
        Spacer()

        // Manual controls panel (bottom of screen)
        ManualControlsPanel(calibrationManager: cameraManager.calibrationManager)
            .padding(.horizontal)
            .padding(.bottom, 100)  // Above capture button
    }
}
```

---

## 3. Focus Peaking (P0)

### User Story
**As a** film photographer
**I want to** see highlighted edges in real-time while focusing
**So that** I can achieve maximum sharpness on the film grain

### Technical Specification

**(Implementation code provided in main roadmap document - see separate implementation file)**

---

## 4. Automatic Frame Detection (P0)

### User Story
**As a** user scanning a roll of film
**I want** the app to automatically detect and crop each film frame
**So that** I don't have to manually align every shot

### Technical Specification

**(Implementation code provided in main roadmap document - see separate implementation file)**

---

## Implementation Timeline

### Sprint 1 (Weeks 1-2): Critical Features Part 1
- DNG/RAW Export
- Manual Camera Controls UI
- Testing & bug fixes

### Sprint 2 (Weeks 3-4): Critical Features Part 2
- Focus Peaking
- Testing & performance optimization

### Sprint 3 (Weeks 5-6): Critical Features Part 3
- Automatic Frame Detection
- Testing & UX refinement

### Sprint 4 (Weeks 7-8): High Priority Features
- Live Histogram Overlay
- EXIF Metadata Writing
- Perspective Correction UI
- Grid Overlays

### Sprint 5 (Weeks 9-10): Polish & Optimization
- Metal Performance Optimization
- Bug fixes & edge cases
- Beta testing with photographers
- App Store submission prep

---

## Success Metrics

### Technical Metrics
- Processing speed: <2s for 12MP (currently 525ms ✅)
- Focus peaking: 30+ FPS on iPhone 13 Pro+
- Frame detection accuracy: >95% on standard 35mm negatives
- DNG export file size: 15-20MB for 12MP RAW

### User Experience Metrics
- Time to scan one roll: <10 minutes (vs 30-60 min on flatbed scanner)
- User satisfaction with sharpness: >4.5/5 stars
- Pro conversion rate: Target 15-20%

### App Store Metrics
- Rating: Target 4.8+ stars
- Reviews mentioning "professional" or "high quality": >30%

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Focus peaking performance issues | Medium | High | Use Metal shaders, downsample preview |
| Frame detection false positives | Medium | Medium | Provide manual override, save user corrections |
| DNG metadata compatibility | Low | Medium | Test with Lightroom, Capture One, Photos.app |
| Complex UI overwhelming users | Low | High | Make manual controls collapsible/optional |

---

## Dependencies

### Apple Frameworks
- **Vision** (automatic frame detection)
- **Metal** (focus peaking, performance optimization)
- **Core Image** (all processing)
- **AVFoundation** (camera)
- **Photos** (export)

### Third-Party SDKs
- **Google Mobile Ads** (monetization - installation pending)

### Hardware Requirements
- **iPhone 12 Pro or newer** (advanced camera hardware)
- **iOS 17.0+** (privacy manifest, modern APIs)

---

## Next Actions

1. **Immediate (This Week):**
   - [ ] Review and approve roadmap
   - [ ] Prioritize Sprint 1 features
   - [ ] Create detailed task breakdowns
   - [ ] Set up beta testing infrastructure

2. **Short Term (Next 2 Weeks):**
   - [ ] Implement DNG export
   - [ ] Build manual controls UI
   - [ ] Alpha testing with core users

3. **Medium Term (Next 2 Months):**
   - [ ] Complete all P0 features
   - [ ] Begin P1 features
   - [ ] Gather user feedback

4. **Long Term (Next Quarter):**
   - [ ] Ship Phase 3 to production
   - [ ] Plan Phase 4 (AI enhancements)
   - [ ] Explore hardware dock partnership

---

**End of Phase 3 Expansion Roadmap**
