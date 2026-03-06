//
//  ManualControlsPanel.swift
//  Analog Intelligence
//
//  Expandable panel with manual camera controls (focus, ISO, shutter, WB)
//

import SwiftUI
import AVFoundation

/// Expandable panel with manual camera controls (focus, ISO, shutter speed, white balance)
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
                Text("25")
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
                    in: 25.0...3200.0
                )
                .tint(AnalogTheme.primaryOrange)

                Text("3200")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.7))
                    .frame(width: 40, alignment: .trailing)
            }

            // Current ISO value
            Text("Current: ISO \(Int(calibrationManager.currentISO))")
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
            Text("Current: \(formattedShutterSpeed)")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(AnalogTheme.primaryOrange)
        }
        .onAppear {
            // Initialize slider from current exposure duration
            let seconds = CMTimeGetSeconds(calibrationManager.currentExposureDuration)
            if seconds > 0 {
                shutterSpeedLog = log2(seconds)
            }
        }
    }

    private var formattedShutterSpeed: String {
        let seconds = pow(2.0, shutterSpeedLog)

        if seconds >= 0.5 {
            return String(format: "%.1fs", seconds)
        } else {
            let denominator = Int(1.0 / seconds)
            return "1/\(denominator)s"
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
        Task {
            let gains = preset.gains
            try? await calibrationManager.setWhiteBalance(gains: gains)
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

    var gains: AVCaptureDevice.WhiteBalanceGains {
        // Convert color temperature to white balance gains
        // These are approximate values

        let temperature: Float
        switch self {
        case .auto:
            return AVCaptureDevice.WhiteBalanceGains(redGain: 1.0, greenGain: 1.0, blueGain: 1.0)
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
        let normalizedTemp = (temperature - 3000) / (8000 - 3000)

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

        // Clamp gains to reasonable limits
        redGain = min(max(redGain, 1.0), 4.0)
        blueGain = min(max(blueGain, 1.0), 4.0)

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
