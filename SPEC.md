# SPEC.md --- Analog Intelligence™ Negative Scanner (iOS)

## Overview

Analog Intelligence™ is an iOS-native mobile application that enables
film photographers to scan negatives using their iPhone camera, convert
them into positive images, apply basic color correction, and export
results. The MVP is software-only. Later phases add AI processing and a
hardware scanning dock.

Platform: iOS (Swift + SwiftUI)\
Camera Framework: AVFoundation\
Image Processing: Core Image + Accelerate\
Storage: Local device storage

------------------------------------------------------------------------

## Phase Plan

### Phase 1 --- MVP (Software Only)

Features: - Camera preview and still capture - HEIC/JPEG capture -
Optional RAW DNG capture where supported - Calibration step to lock
focus, exposure, and white balance - Negative inversion pipeline -
Orange mask estimation - Manual adjustments: exposure, warmth,
contrast - Gallery grid view - Export to Photos / share sheet - Batch
scanning (manual advance) - Local storage for captured images and
processed outputs - Pro unlock via StoreKit (\$9.99)

### Phase 2 --- AI Processing

-   On-device Core ML models
-   AI color reconstruction
-   Dust and scratch detection
-   Improved histogram analysis and insights

### Phase 3 --- Hardware Integration

-   BLE dock integration
-   Automatic roll scanning
-   Frame alignment detection
-   Error recovery and dock communication

------------------------------------------------------------------------

## Folder Architecture

AnalogIntelligence/ App/ UI/ Scan/ Gallery/ Insights/ Settings/ Camera/
Processing/ Pipeline/ Metrics/ Storage/ Purchases/ Hardware/

------------------------------------------------------------------------

## Camera System

Capture modes: - HEIC - JPEG - RAW (DNG)

Session design: - AVCaptureSession - AVCapturePhotoOutput - Optional
VideoDataOutput for stability analysis

Calibration locks: - Focus - Exposure - White balance

------------------------------------------------------------------------

## Image Processing Pipeline

Steps: 1. Crop/perspective correction 2. Convert to linear RGB 3. Invert
negative 4. Estimate orange mask 5. Normalize color channels 6. Apply
tone correction 7. User sliders 8. Sharpen 9. Export positive image

------------------------------------------------------------------------

## Batch Scan State Machine (Manual)

States: - idle - calibrating - ready - waitingForFilmAdvance -
capturing - processing - reviewing - exporting - paused - error

------------------------------------------------------------------------

## Future Auto Roll Scan

States: - connectingToDock - waitingForDockAlignment - capturing -
verifyingQuality - retryingCapture - completed

Dock events: - frameAligned - jamDetected - lowBattery - disconnected
