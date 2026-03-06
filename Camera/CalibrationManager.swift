//
//  CalibrationManager.swift
//  Analog Intelligence
//
//  Manages calibration locks for focus, exposure, and white balance
//

import Foundation
import AVFoundation
import Combine

/// Manages camera calibration settings for consistent batch scanning
@MainActor
class CalibrationManager: ObservableObject {
    // MARK: - Published Properties

    @Published var isFocusLocked = false
    @Published var isExposureLocked = false
    @Published var isWhiteBalanceLocked = false
    @Published var isCalibrated = false

    @Published var currentISO: Float = 0
    @Published var currentExposureDuration: CMTime = .zero
    @Published var currentLensPosition: Float = 0
    @Published var currentWhiteBalanceGains: AVCaptureDevice.WhiteBalanceGains?

    // MARK: - Private Properties

    private weak var captureDevice: AVCaptureDevice?
    private var savedISO: Float = 0
    private var savedExposureDuration: CMTime = .zero
    private var savedLensPosition: Float = 0
    private var savedWhiteBalanceGains: AVCaptureDevice.WhiteBalanceGains?

    // MARK: - Initialization

    init(captureDevice: AVCaptureDevice? = nil) {
        self.captureDevice = captureDevice
    }

    // MARK: - Public Methods

    /// Set the capture device to calibrate
    func setCaptureDevice(_ device: AVCaptureDevice) {
        self.captureDevice = device
        updateCurrentValues()
    }

    /// Begin calibration process - allows user to adjust settings
    func startCalibration() async throws {
        guard let device = captureDevice else {
            throw CalibrationError.noDevice
        }

        try device.lockForConfiguration()

        // Enable continuous autofocus and auto exposure initially
        if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusMode = .continuousAutoFocus
        }

        if device.isExposureModeSupported(.continuousAutoExposure) {
            device.exposureMode = .continuousAutoExposure
        }

        if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
            device.whiteBalanceMode = .continuousAutoWhiteBalance
        }

        device.unlockForConfiguration()

        isCalibrated = false
        isFocusLocked = false
        isExposureLocked = false
        isWhiteBalanceLocked = false
    }

    /// Lock all calibration settings (focus, exposure, white balance)
    func lockCalibration() async throws {
        guard let device = captureDevice else {
            throw CalibrationError.noDevice
        }

        try device.lockForConfiguration()

        // Lock focus
        if device.isFocusModeSupported(.locked) {
            savedLensPosition = device.lensPosition
            device.focusMode = .locked
            isFocusLocked = true
        }

        // Lock exposure
        if device.isExposureModeSupported(.custom) {
            savedISO = device.iso
            savedExposureDuration = device.exposureDuration
            await device.setExposureModeCustom(duration: device.exposureDuration, iso: device.iso)
            isExposureLocked = true
        }

        // Lock white balance
        if device.isWhiteBalanceModeSupported(.locked) {
            savedWhiteBalanceGains = device.deviceWhiteBalanceGains
            device.whiteBalanceMode = .locked
            isWhiteBalanceLocked = true
        }

        device.unlockForConfiguration()

        isCalibrated = isFocusLocked && isExposureLocked && isWhiteBalanceLocked
        updateCurrentValues()
    }

    /// Unlock all calibration settings and return to auto modes
    func unlockCalibration() async throws {
        guard let device = captureDevice else {
            throw CalibrationError.noDevice
        }

        try device.lockForConfiguration()

        // Unlock focus
        if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusMode = .continuousAutoFocus
            isFocusLocked = false
        }

        // Unlock exposure
        if device.isExposureModeSupported(.continuousAutoExposure) {
            device.exposureMode = .continuousAutoExposure
            isExposureLocked = false
        }

        // Unlock white balance
        if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
            device.whiteBalanceMode = .continuousAutoWhiteBalance
            isWhiteBalanceLocked = false
        }

        device.unlockForConfiguration()

        isCalibrated = false
        updateCurrentValues()
    }

    /// Manually set focus to a specific lens position (0.0 - 1.0)
    func setFocus(lensPosition: Float) async throws {
        guard let device = captureDevice else {
            throw CalibrationError.noDevice
        }

        guard device.isFocusModeSupported(.locked) else {
            throw CalibrationError.focusNotSupported
        }

        let clampedPosition = max(0.0, min(1.0, lensPosition))

        try device.lockForConfiguration()
        await device.setFocusModeLocked(lensPosition: clampedPosition)
        device.unlockForConfiguration()

        savedLensPosition = clampedPosition
        currentLensPosition = clampedPosition
        isFocusLocked = true
    }

    /// Manually set exposure with ISO and duration
    func setExposure(iso: Float, duration: CMTime) async throws {
        guard let device = captureDevice else {
            throw CalibrationError.noDevice
        }

        guard device.isExposureModeSupported(.custom) else {
            throw CalibrationError.exposureNotSupported
        }

        let clampedISO = max(device.activeFormat.minISO, min(device.activeFormat.maxISO, iso))
        let clampedDuration = max(device.activeFormat.minExposureDuration, min(device.activeFormat.maxExposureDuration, duration))

        try device.lockForConfiguration()
        await device.setExposureModeCustom(duration: clampedDuration, iso: clampedISO)
        device.unlockForConfiguration()

        savedISO = clampedISO
        savedExposureDuration = clampedDuration
        currentISO = clampedISO
        currentExposureDuration = clampedDuration
        isExposureLocked = true
    }

    /// Manually set white balance gains
    func setWhiteBalance(gains: AVCaptureDevice.WhiteBalanceGains) async throws {
        guard let device = captureDevice else {
            throw CalibrationError.noDevice
        }

        guard device.isWhiteBalanceModeSupported(.locked) else {
            throw CalibrationError.whiteBalanceNotSupported
        }

        let normalizedGains = normalizedWhiteBalanceGains(gains, for: device)

        try device.lockForConfiguration()
        await device.setWhiteBalanceModeLocked(with: normalizedGains)
        device.unlockForConfiguration()

        savedWhiteBalanceGains = normalizedGains
        currentWhiteBalanceGains = normalizedGains
        isWhiteBalanceLocked = true
    }

    /// Restore previously saved calibration settings
    func restoreCalibration() async throws {
        guard let device = captureDevice else {
            throw CalibrationError.noDevice
        }

        try device.lockForConfiguration()

        // Restore focus
        if device.isFocusModeSupported(.locked) && savedLensPosition > 0 {
            await device.setFocusModeLocked(lensPosition: savedLensPosition)
            isFocusLocked = true
        }

        // Restore exposure
        if device.isExposureModeSupported(.custom) && savedISO > 0 {
            await device.setExposureModeCustom(duration: savedExposureDuration, iso: savedISO)
            isExposureLocked = true
        }

        // Restore white balance
        if device.isWhiteBalanceModeSupported(.locked), let gains = savedWhiteBalanceGains {
            await device.setWhiteBalanceModeLocked(with: gains)
            isWhiteBalanceLocked = true
        }

        device.unlockForConfiguration()

        isCalibrated = isFocusLocked && isExposureLocked && isWhiteBalanceLocked
        updateCurrentValues()
    }

    /// Update current values from the device
    func updateCurrentValues() {
        guard let device = captureDevice else { return }

        currentISO = device.iso
        currentExposureDuration = device.exposureDuration
        currentLensPosition = device.lensPosition
        currentWhiteBalanceGains = device.deviceWhiteBalanceGains
    }

    private func normalizedWhiteBalanceGains(
        _ gains: AVCaptureDevice.WhiteBalanceGains,
        for device: AVCaptureDevice
    ) -> AVCaptureDevice.WhiteBalanceGains {
        let maxGain = device.maxWhiteBalanceGain
        return AVCaptureDevice.WhiteBalanceGains(
            redGain: max(1.0, min(gains.redGain, maxGain)),
            greenGain: max(1.0, min(gains.greenGain, maxGain)),
            blueGain: max(1.0, min(gains.blueGain, maxGain))
        )
    }

    /// Get calibration summary for debugging/display
    func getCalibrationSummary() -> CalibrationSummary {
        return CalibrationSummary(
            isFocusLocked: isFocusLocked,
            isExposureLocked: isExposureLocked,
            isWhiteBalanceLocked: isWhiteBalanceLocked,
            lensPosition: currentLensPosition,
            iso: currentISO,
            exposureDuration: currentExposureDuration,
            whiteBalanceGains: currentWhiteBalanceGains
        )
    }
}

// MARK: - Supporting Types

/// Summary of current calibration state
struct CalibrationSummary {
    let isFocusLocked: Bool
    let isExposureLocked: Bool
    let isWhiteBalanceLocked: Bool
    let lensPosition: Float
    let iso: Float
    let exposureDuration: CMTime
    let whiteBalanceGains: AVCaptureDevice.WhiteBalanceGains?

    var isFullyCalibrated: Bool {
        return isFocusLocked && isExposureLocked && isWhiteBalanceLocked
    }

    var exposureDurationSeconds: Double {
        return CMTimeGetSeconds(exposureDuration)
    }
}

/// Calibration-specific errors
enum CalibrationError: LocalizedError {
    case noDevice
    case focusNotSupported
    case exposureNotSupported
    case whiteBalanceNotSupported

    var errorDescription: String? {
        switch self {
        case .noDevice:
            return "No capture device available"
        case .focusNotSupported:
            return "Manual focus not supported on this device"
        case .exposureNotSupported:
            return "Manual exposure not supported on this device"
        case .whiteBalanceNotSupported:
            return "Manual white balance not supported on this device"
        }
    }
}
