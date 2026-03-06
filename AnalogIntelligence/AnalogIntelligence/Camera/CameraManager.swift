//
//  CameraManager.swift
//  AnalogIntelligence
//
//  Created by Analog Intelligence
//

import AVFoundation
import UIKit
import Combine

class CameraManager: NSObject, ObservableObject {
    @Published var isSessionRunning = false
    @Published var captureFormat: CaptureFormat = .heic
    @Published var isCalibrated = false

    private var captureSession: AVCaptureSession?
    private var photoOutput: AVCapturePhotoOutput?
    private var videoDeviceInput: AVCaptureDeviceInput?
    private var captureCompletion: ((UIImage?) -> Void)?

    // Calibration locks
    private var focusLocked = false
    private var exposureLocked = false
    private var whiteBalanceLocked = false

    override init() {
        super.init()
        setupCaptureSession()
    }

    private func setupCaptureSession() {
        captureSession = AVCaptureSession()
        captureSession?.sessionPreset = .photo

        guard let captureSession = captureSession else { return }

        // Add video input
        guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            print("Failed to get video device")
            return
        }

        do {
            let videoDeviceInput = try AVCaptureDeviceInput(device: videoDevice)
            if captureSession.canAddInput(videoDeviceInput) {
                captureSession.addInput(videoDeviceInput)
                self.videoDeviceInput = videoDeviceInput
            }
        } catch {
            print("Could not create video device input: \(error)")
            return
        }

        // Add photo output
        let photoOutput = AVCapturePhotoOutput()
        if captureSession.canAddOutput(photoOutput) {
            captureSession.addOutput(photoOutput)
            self.photoOutput = photoOutput

            // Configure photo output
            photoOutput.isHighResolutionCaptureEnabled = true
            if #available(iOS 17.0, *) {
                photoOutput.maxPhotoDimensions = photoOutput.maxPhotoDimensions
            }
        }
    }

    func startSession() {
        guard let captureSession = captureSession, !captureSession.isRunning else { return }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            captureSession.startRunning()
            DispatchQueue.main.async {
                self?.isSessionRunning = true
            }
        }
    }

    func stopSession() {
        guard let captureSession = captureSession, captureSession.isRunning else { return }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            captureSession.stopRunning()
            DispatchQueue.main.async {
                self?.isSessionRunning = false
            }
        }
    }

    func calibrate() {
        // Lock focus, exposure, and white balance
        guard let device = videoDeviceInput?.device else { return }

        do {
            try device.lockForConfiguration()

            // Lock focus
            if device.isFocusModeSupported(.locked) {
                device.focusMode = .locked
                focusLocked = true
            }

            // Lock exposure
            if device.isExposureModeSupported(.locked) {
                device.exposureMode = .locked
                exposureLocked = true
            }

            // Lock white balance
            if device.isWhiteBalanceModeSupported(.locked) {
                device.whiteBalanceMode = .locked
                whiteBalanceLocked = true
            }

            device.unlockForConfiguration()
            isCalibrated = true
        } catch {
            print("Could not lock camera configuration: \(error)")
        }
    }

    func capturePhoto(completion: @escaping (UIImage?) -> Void) {
        guard let photoOutput = photoOutput else {
            completion(nil)
            return
        }

        self.captureCompletion = completion

        let photoSettings = AVCapturePhotoSettings()

        // Set format based on user preference
        switch captureFormat {
        case .heic:
            photoSettings.processedFileType = .heic
        case .jpeg:
            photoSettings.processedFileType = .jpg
        }

        // Enable RAW capture if supported and enabled
        if photoOutput.availableRawPhotoPixelFormatTypes.count > 0,
           UserDefaults.standard.bool(forKey: "enableRAW") {
            photoSettings.rawPhotoPixelFormatType = photoOutput.availableRawPhotoPixelFormatTypes.first
        }

        photoOutput.capturePhoto(with: photoSettings, delegate: self)
    }

    func getCaptureSession() -> AVCaptureSession? {
        return captureSession
    }
}

// MARK: - AVCapturePhotoCaptureDelegate
extension CameraManager: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        if let error = error {
            print("Error capturing photo: \(error)")
            captureCompletion?(nil)
            return
        }

        guard let imageData = photo.fileDataRepresentation(),
              let image = UIImage(data: imageData) else {
            captureCompletion?(nil)
            return
        }

        captureCompletion?(image)
    }
}
