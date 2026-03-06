# Analog Intelligence™ - Technical Specification v2.0

**Last Updated:** March 5, 2026
**Status:** Phase 1 MVP Complete + Phase 2 Enhancements In Progress
**Platform:** iOS 17.0+
**Language:** Swift 5.9+ with SwiftUI
**Target Devices:** iPhone 12 Pro and newer (requires advanced camera hardware)

---

## Document Overview

This specification reflects the **current implementation state** of the Analog Intelligence iOS film scanner application. It has been updated to match the actual codebase following a comprehensive audit.

### Implementation Status Legend
- ✅ **Fully Implemented** - Feature complete and tested
- ⚠️ **Partially Implemented** - Core functionality exists, UI or edge cases missing
- 🔄 **In Progress** - Currently being developed
- ❌ **Not Implemented** - Planned but not started
- 🔮 **Future** - Post-Phase 3 enhancement

---

## Executive Summary

Analog Intelligence is a professional-grade iOS application for digitizing film negatives using iPhone cameras. It provides sophisticated image processing capabilities including:

- **Negative-to-positive conversion** with 8-step processing pipeline
- **Orange mask removal** using advanced dark-region sampling
- **Automatic tone curve optimization** via histogram analysis
- **Manual camera controls** with calibration lock system
- **RAW (DNG) capture** with high-resolution output
- **Professional export** to JPEG, PNG, HEIC (DNG export pending)
- **Pro monetization** via StoreKit 2 with AdMob integration

**Primary Use Case:** Film photographers scanning 35mm, 120, and 4×5 negatives at home using an iPhone as a digital scanning device with professional results.

---

## Architecture Overview

### Core Technologies

| Technology | Purpose | Implementation Status |
|------------|---------|----------------------|
| **Swift 5.9** | Primary language | ✅ Fully adopted |
| **SwiftUI** | UI framework | ✅ 100% SwiftUI (no UIKit views except camera preview) |
| **Combine** | Reactive programming | ✅ Used for state management |
| **AVFoundation** | Camera control | ✅ Advanced manual controls implemented |
| **Core Image** | GPU image processing | ✅ Primary processing engine |
| **Accelerate** | SIMD optimization | ✅ Critical path optimizations |
| **Vision** | Frame detection | ❌ Planned for automatic cropping |
| **Metal** | Custom shaders | 🔮 Future optimization |
| **Core ML** | AI enhancement | 🔮 Phase 2 feature |
| **StoreKit 2** | In-app purchases | ✅ Full implementation |
| **AdMob** | Monetization | ⚠️ Code ready, SDK not installed |

### Project Structure

```
AnalogIntelligence/
├── App/
│   ├── AnalogIntelligenceApp.swift       # App entry point
│   ├── ContentView.swift                 # Tab navigation
│   └── ScanWorkflowManager.swift         # Batch scan coordinator ✅
│
├── Camera/                                # AVFoundation layer
│   ├── CameraManager.swift               # Session management ✅
│   ├── CalibrationManager.swift          # Focus/exposure/WB locks ✅
│   ├── CaptureMode.swift                 # HEIC/JPEG/RAW modes ✅
│   ├── CameraPreviewView.swift           # Preview layer wrapper ✅
│   └── CameraView.swift                  # Calibration overlay UI ✅
│
├── Processing/
│   ├── Pipeline/
│   │   ├── ImageProcessor.swift          # Main processing coordinator ✅
│   │   ├── NegativeInverter.swift        # Color & B&W inversion ✅
│   │   ├── OrangeMaskEstimator.swift     # Orange mask removal ✅
│   │   ├── ColorCorrector.swift          # Tone curves & normalization ✅
│   │   ├── UserAdjustments.swift         # Manual editing controls ✅
│   │   ├── ExportManager.swift           # JPEG/PNG/HEIC export ⚠️
│   │   └── WatermarkRenderer.swift       # Free tier watermark ✅
│   │
│   └── Metrics/
│       ├── HistogramAnalyzer.swift       # RGB + luminance histograms ✅
│       ├── ExposureMetrics.swift         # Quality analysis ✅
│       └── RollInsight.swift             # Exposure insights ✅
│
├── UI/
│   ├── Scan/
│   │   ├── ScanView.swift                # Main camera UI ✅
│   │   ├── FrameAlignmentOverlay.swift   # Manual frame guide ⚠️
│   │   └── Adjust/
│   │       ├── AdjustView.swift          # Post-capture editing ✅
│   │       ├── ExposureSlider.swift      # ✅
│   │       ├── WarmthSlider.swift        # ✅
│   │       ├── ContrastSlider.swift      # ✅
│   │       └── AIOptionsPanel.swift      # Pro AI features ✅
│   │
│   ├── Gallery/
│   │   ├── GalleryView.swift             # Image grid ✅
│   │   ├── GalleryGridItem.swift         # Thumbnail cells ✅
│   │   ├── ImageDetailView.swift         # Full-screen preview ✅
│   │   └── ContactSheetGenerator.swift   # Pro contact sheets ✅
│   │
│   ├── Insights/
│   │   └── InsightsView.swift            # Pro histogram view ✅
│   │
│   └── Common/
│       └── SharedViews.swift             # Reusable components ✅
│
├── Storage/
│   ├── StorageManager.swift              # File management ✅
│   ├── ScannedImage.swift                # Image model ✅
│   ├── ScanSession.swift                 # Batch session model ✅
│   ├── PreferencesManager.swift          # User settings ✅
│   └── UserPreferences.swift             # Preferences model ✅
│
├── Purchases/
│   ├── StoreKitManager.swift             # IAP management ✅
│   ├── PurchaseState.swift               # Pro status ✅
│   ├── AdMobManager.swift                # Ad integration ⚠️
│   ├── BannerAdView.swift                # Ad UI ⚠️
│   ├── ProUnlockView.swift               # Upgrade screen ✅
│   └── ProFeatureGate.swift              # Feature locking ✅
│
└── Hardware/                              # Future BLE dock
    └── DockManager.swift                 # 🔮 Phase 3
```

**Code Metrics:**
- Total Swift files: 70+
- Total lines of code: 10,000+
- SwiftUI views: 25+
- Processing pipeline files: 7
- Test coverage: 0% (❌ Critical gap)

---

## Phase 1: Camera System (MVP)

### 1.1 Capture Session ✅

**Implementation:** `Camera/CameraManager.swift` (614 lines)

```swift
// Core components
private let captureSession = AVCaptureSession()
private let photoOutput = AVCapturePhotoOutput()
private var videoDataOutput: AVCaptureVideoDataOutput?  // For future stability analysis

// Session configuration
captureSession.sessionPreset = .photo  // Highest quality
photoOutput.isHighResolutionCaptureEnabled = true
photoOutput.maxPhotoQualityPrioritization = .quality
```

**Features:**
- ✅ High-resolution capture (12MP+ depending on device)
- ✅ Photo quality prioritization over speed
- ✅ Automatic session configuration based on device capabilities
- ✅ Background session support (continues when app backgrounds briefly)
- ✅ Simulator mock data generation (synthetic film negatives for testing)

**Device Detection:**
```swift
// Discovers available camera types
let discoverySession = AVCaptureDevice.DiscoverySession(
    deviceTypes: [
        .builtInWideAngleCamera,      // Primary camera (always used)
        .builtInTelephotoCamera,      // Discovered but not UI-selectable ⚠️
        .builtInUltraWideCamera       // Discovered but not UI-selectable ⚠️
    ],
    mediaType: .video,
    position: .back
)
```

**Current Usage:** Wide-angle camera only
**Missing:** UI to switch between lenses ❌

### 1.2 Capture Modes ✅

**Implementation:** `Camera/CaptureMode.swift` (161 lines)

```swift
enum CaptureMode: String, Identifiable, CaseIterable {
    case heic      // High Efficiency Image Format (default)
    case jpeg      // Universal compatibility
    case raw       // DNG format for maximum latitude
}
```

**Format Details:**

| Mode | UTI | Extension | Compression | Pro Only |
|------|-----|-----------|-------------|----------|
| HEIC | `public.heic` | `.heic` | Lossy | No |
| JPEG | `public.jpeg` | `.jpg` | Lossy | No |
| RAW | `com.adobe.raw-image` | `.dng` | None | Yes ⚠️ |

**RAW Capture Configuration:**
```swift
// Checks for RAW support
if !photoOutput.availableRawPhotoPixelFormatTypes.isEmpty {
    photoOutput.isAppleProRAWEnabled = photoOutput.isAppleProRAWSupported
}

// Creates RAW photo settings
let rawFormat = photoOutput.availableRawPhotoPixelFormatTypes.first
let settings = AVCapturePhotoSettings(rawPixelFormatType: rawFormat)
settings.isHighResolutionPhotoEnabled = true
```

**RAW Workflow:**
```
Camera Capture
    ↓
PhotoCaptureProcessor delegate
    ↓
if photo.isRawPhoto → rawPhotoData = photo.fileDataRepresentation()
    ↓
CapturedPhoto(processedData: JPEG, rawData: DNG)
    ↓
Storage (both formats saved)
    ↓
Export: ⚠️ Only processes JPEG/HEIC (DNG export NOT implemented)
```

**Critical Gap:** DNG export not implemented ❌
**Impact:** RAW data captured but discarded on export

### 1.3 Manual Camera Controls ✅ (Backend) / ❌ (UI)

**Implementation:** `Camera/CalibrationManager.swift` (321 lines)

#### Focus Control

```swift
// Backend API ✅
@Published var currentLensPosition: Float = 0.5  // 0.0 = ∞, 1.0 = close
@Published var isFocusLocked: Bool = false

func setFocus(lensPosition: Float) async throws {
    let clampedPosition = max(0.0, min(1.0, lensPosition))
    try await device.lockForConfiguration()
    await device.setFocusModeLocked(lensPosition: clampedPosition)
    currentLensPosition = clampedPosition
    isFocusLocked = true
}

// Tap-to-focus ✅
func focus(at point: CGPoint) async throws {
    device.focusPointOfInterest = point
    device.focusMode = .autoFocus  // Note: Sets auto, not manual lock
}
```

**Current UI:**
- ✅ Calibration button to lock current focus
- ✅ Visual indicator when locked
- ❌ No manual focus slider
- ❌ No focus peaking overlay
- ❌ No focus distance display

**Focus Peaking:** ❌ NOT IMPLEMENTED
**Needed for:** Capturing film grain detail at maximum sharpness

#### Exposure Control

```swift
// Backend API ✅
@Published var currentISO: Float = 0
@Published var currentExposureDuration: CMTime = .zero
@Published var isExposureLocked: Bool = false

func setExposure(iso: Float, duration: CMTime) async throws {
    let clampedISO = min(max(iso, device.activeFormat.minISO),
                         device.activeFormat.maxISO)
    let clampedDuration = min(max(duration, device.activeFormat.minExposureDuration),
                               device.activeFormat.maxExposureDuration)

    try await device.lockForConfiguration()
    await device.setExposureModeCustom(duration: clampedDuration, iso: clampedISO)
    isExposureLocked = true
}

// Device capabilities (iPhone 14 Pro example)
// minISO: 25.0
// maxISO: 3200.0 (base sensor, can go higher in low-light mode)
// minExposureDuration: 1/36000 seconds
// maxExposureDuration: 1 second
```

**Current UI:**
- ✅ Calibration button to lock current exposure
- ✅ Visual indicator when locked
- ❌ No manual ISO slider
- ❌ No manual shutter speed slider
- ❌ No live histogram
- ❌ No exposure compensation dial

**Live Histogram:** ❌ NOT IMPLEMENTED
**Needed for:** Ensuring proper negative exposure to avoid clipping

#### White Balance Control

```swift
// Backend API ✅
@Published var currentWhiteBalanceGains: AVCaptureDevice.WhiteBalanceGains?
@Published var isWhiteBalanceLocked: Bool = false

func setWhiteBalance(gains: AVCaptureDevice.WhiteBalanceGains) async throws {
    let normalizedGains = device.normalizedWhiteBalanceGains(for: gains)
    try await device.lockForConfiguration()
    await device.setWhiteBalanceModeLocked(with: normalizedGains)
    isWhiteBalanceLocked = true
}

// Gain normalization helper
func normalizedWhiteBalanceGains(for gains: AVCaptureDevice.WhiteBalanceGains) -> AVCaptureDevice.WhiteBalanceGains {
    var g = gains
    g.redGain = max(1.0, min(g.redGain, device.maxWhiteBalanceGain))
    g.greenGain = max(1.0, min(g.greenGain, device.maxWhiteBalanceGain))
    g.blueGain = max(1.0, min(g.blueGain, device.maxWhiteBalanceGain))
    return g
}
```

**Current UI:**
- ✅ Calibration button to lock current white balance
- ✅ Visual indicator when locked
- ❌ No WB preset picker (Daylight, Tungsten, etc.)
- ❌ No manual RGB gain sliders
- ❌ No color temperature slider (Kelvin)

### 1.4 Calibration System ✅

**Purpose:** Lock focus, exposure, and white balance for consistent scanning across an entire roll.

**Workflow:**
```
1. startCalibration()
   ↓ Switches to continuous auto modes
   ↓ User positions phone over film
   ↓ Camera auto-adjusts to optimal settings
   ↓
2. lockCalibration()
   ↓ Freezes current focus position
   ↓ Freezes current ISO + shutter speed
   ↓ Freezes current white balance gains
   ↓ Sets isCalibrated = true
   ↓
3. User advances film, captures next frame
   ↓ All settings remain locked
   ↓ Consistent exposure across roll
   ↓
4. unlockCalibration() or restoreCalibration()
   ↓ Returns to auto modes or restores previous calibration
```

**Implementation:**
```swift
// CalibrationManager.swift
struct CalibrationSummary {
    var isCalibrated: Bool
    var focusPosition: Float?
    var iso: Float?
    var exposureDuration: CMTime?
    var whiteBalanceGains: AVCaptureDevice.WhiteBalanceGains?
    var timestamp: Date
}

func getCalibrationSummary() -> CalibrationSummary {
    return CalibrationSummary(
        isCalibrated: isCalibrated,
        focusPosition: isFocusLocked ? currentLensPosition : nil,
        iso: isExposureLocked ? currentISO : nil,
        exposureDuration: isExposureLocked ? currentExposureDuration : nil,
        whiteBalanceGains: isWhiteBalanceLocked ? currentWhiteBalanceGains : nil,
        timestamp: Date()
    )
}
```

**UI Integration:**
```swift
// ScanView.swift
Button {
    if cameraManager.calibrationManager.isCalibrated {
        await cameraManager.calibrationManager.unlockCalibration()
    } else {
        await cameraManager.calibrationManager.lockCalibration()
    }
} label: {
    HStack {
        Image(systemName: isCalibrated ? "checkmark.seal.fill" : "scope")
        Text(isCalibrated ? "Calibrated" : "Calibrate")
    }
}
```

**Auto-Lock Preference:**
```swift
// UserPreferences.swift
var autoLockCalibration: Bool = false

// When enabled, calibration locks automatically on session start
if preferencesManager.preferences.autoLockCalibration {
    await cameraManager.calibrationManager.lockCalibration()
}
```

---

## Phase 2: Image Processing Pipeline (Core Engine)

### 2.1 Processing Architecture ✅

**Implementation:** `Processing/Pipeline/ImageProcessor.swift` (306 lines)

**8-Step Sequential Pipeline:**

```swift
enum ProcessingStep: Int, CaseIterable {
    case cropping          // Step 1: Crop & perspective correction
    case linearizing       // Step 2: Convert to linear RGB
    case inverting         // Step 3: Invert negative
    case orangeMask        // Step 4: Remove orange mask (color only)
    case normalizing       // Step 5: Normalize color channels
    case toneCorrection    // Step 6: Automatic tone curve
    case userAdjustments   // Step 7: Manual edits (exposure, warmth, etc.)
    case sharpening        // Step 8: Sharpen & export
}
```

**Progress Reporting:**
```swift
// Real-time progress updates via closure
typealias ProgressHandler = (ProcessingStep, Float) -> Void

func process(
    image: CIImage,
    config: ProcessingConfig,
    progressHandler: ProgressHandler?
) async throws -> CIImage {
    progressHandler?(.cropping, 0.05)
    let cropped = try await applyCropAndPerspective(image, config: config)

    progressHandler?(.linearizing, 0.15)
    let linear = try await convertToLinearRGB(cropped)

    // ... continues through all 8 steps
}
```

**Processing Configuration:**
```swift
struct ProcessingConfig {
    var cropRect: CGRect?                     // Optional crop region
    var perspectiveCorrection: [CGPoint]?     // 4 corner points for transform
    var filmType: FilmType                    // Color negative, B&W, or slide
    var autoOrangeMask: Bool                  // Enable/disable auto mask removal
    var autoColorCorrection: Bool             // Enable/disable auto tone curve
    var sharpenAmount: Float                  // 0.0 - 1.0
    var adjustments: UserAdjustments.Parameters  // Manual edits
}

enum FilmType: String, Codable {
    case colorNegative    // C-41 process (Kodak, Fuji color films)
    case blackAndWhite    // Traditional B&W (Tri-X, HP5, etc.)
    case slide            // E-6 positive (future support)
}
```

**Color Space Management:**
```swift
// Use linear RGB for accurate color math
let options: [CIContextOption: Any] = [
    .workingColorSpace: CGColorSpace(name: CGColorSpace.linearSRGB)!,
    .outputColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
    .useSoftwareRenderer: false  // Enable GPU acceleration
]

let context = CIContext(options: options)
```

**Why Linear RGB?**
- Gamma-compressed sRGB is not linear (pow 2.2 curve)
- Color math (multiplication, addition) only works correctly in linear space
- Example: Removing orange mask requires dividing by mask color
  - In sRGB: (0.5 sRGB / 0.3 sRGB) ≠ 1.67 sRGB (incorrect)
  - In linear: (0.22 linear / 0.07 linear) = 3.14 linear → 0.6 sRGB (correct)

### 2.2 Negative Inversion Engine ✅

**Implementation:** `Processing/Pipeline/NegativeInverter.swift` (231 lines)

**Core Inversion:**
```swift
func invertColorNegative(_ image: CIImage) async throws -> CIImage {
    guard let invertFilter = CIFilter(name: "CIColorInvert") else {
        throw ProcessingError.filterNotAvailable("CIColorInvert")
    }

    invertFilter.setValue(image, forKey: kCIInputImageKey)

    guard let inverted = invertFilter.outputImage else {
        throw ProcessingError.processingFailed("Failed to invert negative")
    }

    return inverted
}

func invertBlackAndWhite(_ image: CIImage) async throws -> CIImage {
    // Same CIColorInvert filter
    // Simpler than color (no orange mask to worry about)
    return try await invertColorNegative(image)
}
```

**Advanced: Per-Channel Inversion:**
```swift
func invertWithChannelControl(
    _ image: CIImage,
    redGain: Float = 1.0,
    greenGain: Float = 1.0,
    blueGain: Float = 1.0
) async throws -> CIImage {
    // Step 1: Basic inversion
    let inverted = try await invertColorNegative(image)

    // Step 2: Apply channel-specific gains via color matrix
    guard let matrixFilter = CIFilter(name: "CIColorMatrix") else {
        throw ProcessingError.filterNotAvailable("CIColorMatrix")
    }

    matrixFilter.setValue(inverted, forKey: kCIInputImageKey)

    // Set up 4x5 color transformation matrix
    matrixFilter.setValue(
        CIVector(x: CGFloat(redGain), y: 0, z: 0, w: 0),
        forKey: "inputRVector"
    )
    matrixFilter.setValue(
        CIVector(x: 0, y: CGFloat(greenGain), z: 0, w: 0),
        forKey: "inputGVector"
    )
    matrixFilter.setValue(
        CIVector(x: 0, y: 0, z: CGFloat(blueGain), w: 0),
        forKey: "inputBVector"
    )
    matrixFilter.setValue(
        CIVector(x: 0, y: 0, z: 0, w: 1),
        forKey: "inputAVector"  // Alpha unchanged
    )

    // Optional: Apply bias vector for color cast removal
    let bias: Float = -0.02  // Slight shadow boost
    matrixFilter.setValue(
        CIVector(x: CGFloat(bias), y: CGFloat(bias), z: CGFloat(bias), w: 0),
        forKey: "inputBiasVector"
    )

    return matrixFilter.outputImage!
}
```

**Use Cases for Channel Control:**
- **Push-processed film:** Increase gains for higher contrast
  - Example: `redGain: 1.3, greenGain: 1.3, blueGain: 1.3`
- **Cross-processed:** Adjust for color shifts
  - Example: `redGain: 1.2, greenGain: 1.0, blueGain: 0.9` (warmer)
- **Expired film:** Compensate for color casts
  - Example: Analyze histogram to determine optimal per-channel gains

**Histogram-Based Optimization:**
```swift
func analyzeNegativeHistogram(_ image: CIImage, context: CIContext) -> HistogramStats {
    let histogramFilter = CIFilter(name: "CIAreaHistogram")!
    histogramFilter.setValue(image, forKey: kCIInputImageKey)
    histogramFilter.setValue(256, forKey: "inputCount")
    histogramFilter.setValue(CIVector(x: 0, y: 0, z: image.extent.width, w: image.extent.height),
                              forKey: "inputExtent")

    let histogramImage = histogramFilter.outputImage!

    // Render to bitmap for analysis
    var histogram = [Float](repeating: 0, count: 256 * 4)  // RGBA
    context.render(histogramImage, toBitmap: &histogram, rowBytes: 256 * 4 * 4, ...)

    // Calculate per-channel means
    var redSum: Float = 0, greenSum: Float = 0, blueSum: Float = 0
    for i in 0..<256 {
        redSum += histogram[i * 4 + 0] * Float(i)
        greenSum += histogram[i * 4 + 1] * Float(i)
        blueSum += histogram[i * 4 + 2] * Float(i)
    }

    let totalPixels = histogram.reduce(0, +) / 4.0
    return HistogramStats(
        redMean: redSum / totalPixels,
        greenMean: greenSum / totalPixels,
        blueMean: blueSum / totalPixels
    )
}

struct HistogramStats {
    var redMean: Float
    var greenMean: Float
    var blueMean: Float

    var overallMean: Float { (redMean + greenMean + blueMean) / 3.0 }
}
```

**Accelerate Optimization:**
```swift
func invertUsingAccelerate(_ image: CIImage, context: CIContext) async throws -> CIImage {
    // Convert CIImage → CGImage
    guard let cgImage = context.createCGImage(image, from: image.extent) else {
        throw ProcessingError.processingFailed("Failed to create CGImage")
    }

    // Initialize vImage buffer from CGImage
    var sourceBuffer = vImage_Buffer()
    vImageBuffer_InitWithCGImage(&sourceBuffer, &format, nil, cgImage, vImage_Flags(kvImageNoFlags))

    // Allocate destination buffer
    var destBuffer = vImage_Buffer()
    vImageBuffer_Init(&destBuffer, sourceBuffer.height, sourceBuffer.width, 32, vImage_Flags(kvImageNoFlags))

    // Invert via vImage (SIMD-optimized)
    // For 8-bit ARGB: output = 255 - input
    var maxValues: [UInt8] = [255, 255, 255, 255]
    vImageOverwriteChannelsWithScalar_ARGB8888(&maxValues, &destBuffer, &destBuffer, 0x7, vImage_Flags(kvImageNoFlags))
    vImageSubtract_ARGB8888(&sourceBuffer, &destBuffer, &destBuffer, vImage_Flags(kvImageNoFlags))

    // Convert back to CGImage → CIImage
    let outputCGImage = vImageCreateCGImageFromBuffer(&destBuffer, &format, nil, nil, vImage_Flags(kvImageNoFlags), nil)
    return CIImage(cgImage: outputCGImage!.takeRetainedValue())
}
```

**Performance:** Accelerate is ~2x faster than Core Image for simple inversion (not always worth the overhead)

### 2.3 Orange Mask Removal ✅

**Implementation:** `Processing/Pipeline/OrangeMaskEstimator.swift` (376 lines)

**Algorithm Overview:**

```
Input: Inverted color negative (still has orange cast)
    ↓
1. Downsample to 10% for performance
    ↓
2. Analyze dark regions (luminance < 20%)
    ↓
3. Sample 100 representative dark pixels
    ↓
4. Calculate average color → orange mask estimate
    ↓
5. Apply color matrix to divide out mask
    ↓
Output: Neutral-balanced positive image
```

**Why Focus on Dark Regions?**

Film base (orange mask) is most visible in:
- Unexposed areas (film sprocket holes, borders)
- Shadow regions of scene
- Areas with minimal image content

In highlights and midtones, the image content dominates the mask color.

**Implementation:**

```swift
struct OrangeMaskColor {
    var redDensity: Float    // Typically 1.0 (least dense)
    var greenDensity: Float  // Typically 0.65
    var blueDensity: Float   // Typically 0.4 (most dense)
    var strength: Float      // 0.0-1.0, indicates prominence

    // Default mask for Kodak-style color negative films
    static let defaultKodak = OrangeMaskColor(
        redDensity: 1.0,
        greenDensity: 0.65,
        blueDensity: 0.4,
        strength: 0.6
    )

    // Fuji films tend to have slightly different mask
    static let defaultFuji = OrangeMaskColor(
        redDensity: 1.0,
        greenDensity: 0.70,
        blueDensity: 0.45,
        strength: 0.5
    )
}

func estimateOrangeMask(from image: CIImage, context: CIContext) async throws -> OrangeMaskColor {
    // Downsample to 10% for performance
    let downscaleFilter = CIFilter(name: "CILanczosScaleTransform")!
    downscaleFilter.setValue(image, forKey: kCIInputImageKey)
    downscaleFilter.setValue(0.1, forKey: kCIInputScaleKey)  // 10% of original size
    downscaleFilter.setValue(1.0, forKey: kCIInputAspectRatioKey)

    let downsampled = downscaleFilter.outputImage!

    // Render to bitmap for CPU analysis
    let width = Int(downsampled.extent.width)
    let height = Int(downsampled.extent.height)
    var pixelData = [UInt8](repeating: 0, count: width * height * 4)  // RGBA

    context.render(downsampled, toBitmap: &pixelData, rowBytes: width * 4, ...)

    // Find dark pixels (luminance < 20% = 51/255)
    var darkSamples: [(r: Float, g: Float, b: Float)] = []

    for y in 0..<height {
        for x in 0..<width {
            let offset = (y * width + x) * 4
            let r = Float(pixelData[offset + 0]) / 255.0
            let g = Float(pixelData[offset + 1]) / 255.0
            let b = Float(pixelData[offset + 2]) / 255.0

            // ITU-R BT.601 luminance formula
            let luminance = 0.299 * r + 0.587 * g + 0.114 * b

            if luminance < 0.2 {  // Dark pixel
                darkSamples.append((r, g, b))
            }
        }
    }

    guard darkSamples.count >= 100 else {
        // Not enough dark pixels, use default mask
        return .defaultKodak
    }

    // Average the dark samples (take first 100 to avoid over-sampling sprockets)
    let samples = darkSamples.prefix(100)
    let avgR = samples.map { $0.r }.reduce(0, +) / Float(samples.count)
    let avgG = samples.map { $0.g }.reduce(0, +) / Float(samples.count)
    let avgB = samples.map { $0.b }.reduce(0, +) / Float(samples.count)

    // Normalize relative to red channel (typically least dense)
    let redDensity: Float = 1.0
    let greenDensity = avgG / avgR
    let blueDensity = avgB / avgR

    // Calculate strength (how pronounced the mask is)
    let range = max(avgR, avgG, avgB) - min(avgR, avgG, avgB)
    let strength = min(1.0, range * 2.0)  // Arbitrary scaling

    return OrangeMaskColor(
        redDensity: redDensity,
        greenDensity: greenDensity,
        blueDensity: blueDensity,
        strength: strength
    )
}

func removeOrangeMask(image: CIImage, maskColor: OrangeMaskColor, context: CIContext) async throws -> CIImage {
    // Compensation factors (invert the densities)
    let redComp = 1.0 / maskColor.redDensity      // = 1.0
    let greenComp = 1.0 / maskColor.greenDensity  // ≈ 1.54
    let blueComp = 1.0 / maskColor.blueDensity    // ≈ 2.50

    // Normalize relative to blue channel (most compensation)
    let normRed = redComp / blueComp      // ≈ 0.40
    let normGreen = greenComp / blueComp  // ≈ 0.62
    let normBlue: Float = 1.0

    // Apply via CIColorMatrix filter
    guard let matrixFilter = CIFilter(name: "CIColorMatrix") else {
        throw ProcessingError.filterNotAvailable("CIColorMatrix")
    }

    matrixFilter.setValue(image, forKey: kCIInputImageKey)

    // Color transformation matrix
    matrixFilter.setValue(
        CIVector(x: CGFloat(normRed), y: 0, z: 0, w: 0),
        forKey: "inputRVector"
    )
    matrixFilter.setValue(
        CIVector(x: 0, y: CGFloat(normGreen), z: 0, w: 0),
        forKey: "inputGVector"
    )
    matrixFilter.setValue(
        CIVector(x: 0, y: 0, z: CGFloat(normBlue), w: 0),
        forKey: "inputBVector"
    )
    matrixFilter.setValue(
        CIVector(x: 0, y: 0, z: 0, w: 1),
        forKey: "inputAVector"
    )

    // Apply slight negative bias to remove residual orange cast
    let bias = -0.05 * maskColor.strength
    matrixFilter.setValue(
        CIVector(x: CGFloat(bias), y: CGFloat(bias), z: CGFloat(bias), w: 0),
        forKey: "inputBiasVector"
    )

    guard let output = matrixFilter.outputImage else {
        throw ProcessingError.processingFailed("Failed to apply orange mask correction")
    }

    return output
}
```

**Accelerate Optimization (Advanced):**

```swift
func removeMaskAccelerate(_ image: CIImage, maskColor: OrangeMaskColor, context: CIContext) async throws -> CIImage {
    // Convert to CGImage for vImage processing
    guard let cgImage = context.createCGImage(image, from: image.extent) else {
        throw ProcessingError.processingFailed("Failed to create CGImage")
    }

    // Initialize vImage buffer
    var sourceBuffer = vImage_Buffer()
    vImageBuffer_InitWithCGImage(&sourceBuffer, &format, nil, cgImage, vImage_Flags(kvImageNoFlags))

    var destBuffer = vImage_Buffer()
    vImageBuffer_Init(&destBuffer, sourceBuffer.height, sourceBuffer.width, 32, vImage_Flags(kvImageNoFlags))

    // Build color transformation matrix (4x4 for ARGB)
    let normRed = 1.0 / maskColor.redDensity
    let normGreen = 1.0 / maskColor.greenDensity
    let normBlue = 1.0 / maskColor.blueDensity

    var matrix: [Int16] = [
        Int16(normRed * 256),   0,                          0,                          0,  // Red
        0,                      Int16(normGreen * 256),     0,                          0,  // Green
        0,                      0,                          Int16(normBlue * 256),      0,  // Blue
        0,                      0,                          0,                          256 // Alpha
    ]

    // Apply matrix multiply
    vImageMatrixMultiply_ARGB8888(
        &sourceBuffer,
        &destBuffer,
        &matrix,
        256,  // Divisor for fixed-point math
        nil,  // No pre-bias
        nil,  // No post-bias
        vImage_Flags(kvImageNoFlags)
    )

    // Convert back to CIImage
    let outputCGImage = vImageCreateCGImageFromBuffer(&destBuffer, &format, nil, nil, vImage_Flags(kvImageNoFlags), nil)
    return CIImage(cgImage: outputCGImage!.takeRetainedValue())
}
```

**Performance:**
- Core Image (GPU): ~90ms for 12MP image
- Accelerate (SIMD): ~60ms for 12MP image (1.5x faster)

**Accuracy:**
- Works well for: Kodak Gold, Portra, Ektar, Fuji C200, Superia
- May need tuning for: Cinestill (rem-jet removed), cross-processed, Lomo films
- User override: Disable auto-removal and use manual warmth slider

### 2.4 Color Normalization & Tone Curves ✅

**Implementation:** `Processing/Pipeline/ColorCorrector.swift` (489 lines)

**Color Normalization (Gray World Assumption):**

Assumes the average of all colors in the scene should be neutral gray.

```swift
func normalizeColorChannels(_ image: CIImage, context: CIContext) async throws -> CIImage {
    // Calculate average color across entire image
    let avgFilter = CIFilter(name: "CIAreaAverage")!
    avgFilter.setValue(image, forKey: kCIInputImageKey)
    avgFilter.setValue(CIVector(cgRect: image.extent), forKey: kCIInputExtentKey)

    let avgImage = avgFilter.outputImage!

    // Extract single pixel average color
    var avgPixel = [Float](repeating: 0, count: 4)  // RGBA
    context.render(avgImage, toBitmap: &avgPixel, rowBytes: 16, ...)

    let avgR = avgPixel[0]
    let avgG = avgPixel[1]
    let avgB = avgPixel[2]

    // Calculate gains to equalize channels
    let overallAvg = (avgR + avgG + avgB) / 3.0

    var redGain = overallAvg / avgR
    var greenGain = overallAvg / avgG
    var blueGain = overallAvg / avgB

    // Clamp gains to prevent over-correction
    redGain = min(max(redGain, 0.5), 2.0)
    greenGain = min(max(greenGain, 0.5), 2.0)
    blueGain = min(max(blueGain, 0.5), 2.0)

    // Apply gains via color matrix
    let matrixFilter = CIFilter(name: "CIColorMatrix")!
    matrixFilter.setValue(image, forKey: kCIInputImageKey)
    matrixFilter.setValue(
        CIVector(x: CGFloat(redGain), y: 0, z: 0, w: 0),
        forKey: "inputRVector"
    )
    // ... set green and blue vectors similarly

    return matrixFilter.outputImage!
}
```

**Automatic Tone Curve (Histogram-Based):**

```swift
struct ToneCurve {
    var blackPoint: Float   // Shadow clipping point (0.0-1.0)
    var whitePoint: Float   // Highlight clipping point (0.0-1.0)
    var midPoint: Float     // Midtone anchor (0.0-1.0)
    var contrast: Float     // Contrast multiplier (0.5-2.0)
}

func calculateOptimalToneCurve(from image: CIImage, context: CIContext) async throws -> ToneCurve {
    // Generate luminance histogram
    let histogramFilter = CIFilter(name: "CIAreaHistogram")!
    histogramFilter.setValue(image, forKey: kCIInputImageKey)
    histogramFilter.setValue(256, forKey: "inputCount")
    histogramFilter.setValue(CIVector(cgRect: image.extent), forKey: "inputExtent")

    let histogramImage = histogramFilter.outputImage!

    // Render histogram to array
    var histogram = [Float](repeating: 0, count: 256 * 4)  // RGBA
    context.render(histogramImage, toBitmap: &histogram, rowBytes: 256 * 4 * 4, ...)

    // Build cumulative distribution function (CDF)
    var cdf = [Float](repeating: 0, count: 256)
    cdf[0] = histogram[0]  // Luminance channel
    for i in 1..<256 {
        cdf[i] = cdf[i - 1] + histogram[i]
    }

    let totalPixels = cdf[255]

    // Find 1% and 99% points (auto black/white levels)
    let blackThreshold = totalPixels * 0.01
    let whiteThreshold = totalPixels * 0.99

    var blackPoint: Float = 0.0
    var whitePoint: Float = 1.0

    for i in 0..<256 {
        if cdf[i] >= blackThreshold && blackPoint == 0.0 {
            blackPoint = Float(i) / 255.0
        }
        if cdf[i] >= whiteThreshold && whitePoint == 1.0 {
            whitePoint = Float(i) / 255.0
            break
        }
    }

    // Find median luminance (50% point) for midtone anchor
    let medianThreshold = totalPixels * 0.5
    var midPoint: Float = 0.5

    for i in 0..<256 {
        if cdf[i] >= medianThreshold {
            midPoint = Float(i) / 255.0
            break
        }
    }

    // Calculate contrast (based on histogram spread)
    let dynamicRange = whitePoint - blackPoint
    let contrast = dynamicRange < 0.5 ? 1.3 : 1.1  // Boost low-contrast images

    return ToneCurve(
        blackPoint: blackPoint,
        whitePoint: whitePoint,
        midPoint: midPoint,
        contrast: contrast
    )
}

func applyToneCurve(_ image: CIImage, curve: ToneCurve) -> CIImage {
    // Stage 1: Levels adjustment (stretch histogram)
    let inputRange = curve.whitePoint - curve.blackPoint
    let exposure = log2(1.0 / inputRange)  // Convert range to exposure value

    let exposureFilter = CIFilter(name: "CIExposureAdjust")!
    exposureFilter.setValue(image, forKey: kCIInputImageKey)
    exposureFilter.setValue(exposure, forKey: "inputEV")
    var output = exposureFilter.outputImage!

    // Stage 2: Contrast boost
    let contrastFilter = CIFilter(name: "CIColorControls")!
    contrastFilter.setValue(output, forKey: kCIInputImageKey)
    contrastFilter.setValue(curve.contrast, forKey: "inputContrast")
    output = contrastFilter.outputImage!

    // Stage 3: Midtone adjustment (gamma)
    // Gamma adjusts midpoint: lower gamma brightens midtones, higher darkens
    let targetMidpoint: Float = 0.5
    let gamma = targetMidpoint / curve.midPoint

    let gammaFilter = CIFilter(name: "CIGammaAdjust")!
    gammaFilter.setValue(output, forKey: kCIInputImageKey)
    gammaFilter.setValue(gamma, forKey: "inputPower")
    output = gammaFilter.outputImage!

    return output
}
```

**Visual Example:**

```
Before Auto Tone:
Histogram: |████░░░░░░░░░░░░░░░░|  (Clumped in shadows)
           0                   255

After Auto Tone:
Histogram: |░░██████████████░░░░|  (Spread across range)
           0                   255
```

**Results:**
- Automatic shadow recovery (lifts blacks to optimal level)
- Automatic highlight protection (prevents blown highlights)
- Dynamic midtone adjustment based on histogram median
- Contrast boost for flat negatives

### 2.5 User Adjustments ✅

**Implementation:** `Processing/Pipeline/UserAdjustments.swift` (462 lines)

**Available Parameters:**

```swift
struct Parameters: Equatable {
    var exposure: Float = 0.0       // -2.0 to +2.0 EV
    var warmth: Float = 0.0         // -1.0 (cool/blue) to +1.0 (warm/orange)
    var contrast: Float = 0.0       // -1.0 (flat) to +1.0 (punchy)
    var saturation: Float = 0.0     // -1.0 (B&W) to +1.0 (vivid)
    var highlights: Float = 0.0     // -1.0 (recover) to +1.0 (boost)
    var shadows: Float = 0.0        // -1.0 (crush) to +1.0 (lift)
    var vibrance: Float = 0.0       // -1.0 to +1.0 (selective saturation)
}
```

**Filter Application Order:**

```
Input Image
    ↓
1. Exposure (CIExposureAdjust)
   Maps: -2.0...+2.0 EV
    ↓
2. Highlights & Shadows (CIHighlightShadowAdjust)
   Maps: -1.0...+1.0 to 0.0...2.0 for each
    ↓
3. Contrast (CIColorControls)
   Maps: -1.0...+1.0 to 0.5...1.5
    ↓
4. Temperature/Warmth (CITemperatureAndTint)
   Maps: -1.0...+1.0 to 4500K...8500K
    ↓
5. Saturation (CIColorControls)
   Maps: -1.0...+1.0 to 0.0...2.0
    ↓
6. Vibrance (CIVibrance)
   Direct mapping: -1.0...+1.0
    ↓
Output Image
```

**Implementation Examples:**

```swift
// 1. Exposure
func applyExposure(_ image: CIImage, amount: Float) -> CIImage {
    let filter = CIFilter(name: "CIExposureAdjust")!
    filter.setValue(image, forKey: kCIInputImageKey)
    filter.setValue(amount, forKey: "inputEV")  // Direct EV value
    return filter.outputImage!
}

// 2. Highlights & Shadows (separate control for each)
func applyHighlightsAndShadows(_ image: CIImage, highlights: Float, shadows: Float) -> CIImage {
    let filter = CIFilter(name: "CIHighlightShadowAdjust")!
    filter.setValue(image, forKey: kCIInputImageKey)

    // Map -1.0...+1.0 to 0.0...2.0 (1.0 is neutral)
    let highlightAmount = 1.0 + highlights
    let shadowAmount = 1.0 + shadows

    filter.setValue(highlightAmount, forKey: "inputHighlightAmount")
    filter.setValue(shadowAmount, forKey: "inputShadowAmount")

    return filter.outputImage!
}

// 4. Warmth (color temperature)
func applyWarmth(_ image: CIImage, amount: Float) -> CIImage {
    let filter = CIFilter(name: "CITemperatureAndTint")!
    filter.setValue(image, forKey: kCIInputImageKey)

    // Map -1.0...+1.0 to color temperature range
    let neutralTemp: Float = 6500  // Daylight (~5500-6500K)
    let warmTemp: Float = 4500     // Tungsten/warm
    let coolTemp: Float = 8500     // Shade/cool

    let kelvin = amount < 0
        ? neutralTemp + (amount * (neutralTemp - warmTemp))  // Warm (negative = lower K)
        : neutralTemp + (amount * (coolTemp - neutralTemp))  // Cool (positive = higher K)

    filter.setValue(CIVector(x: CGFloat(kelvin), y: 0), forKey: "inputNeutral")

    return filter.outputImage!
}

// 6. Vibrance (selective saturation - affects muted colors more than saturated)
func applyVibrance(_ image: CIImage, amount: Float) -> CIImage {
    let filter = CIFilter(name: "CIVibrance")!
    filter.setValue(image, forKey: kCIInputImageKey)
    filter.setValue(amount, forKey: "inputAmount")  // -1.0 to +1.0
    return filter.outputImage!
}
```

**Preset Styles:**

```swift
enum Preset: String, CaseIterable {
    case none
    case bright
    case warm
    case cool
    case punchy
    case vintage
    case muted

    var parameters: Parameters {
        switch self {
        case .none:
            return Parameters()

        case .bright:
            return Parameters(
                exposure: 0.3,
                highlights: 0.2,
                shadows: 0.1,
                contrast: 0.1
            )

        case .warm:
            return Parameters(
                warmth: 0.4,
                saturation: 0.1,
                vibrance: 0.1
            )

        case .cool:
            return Parameters(
                warmth: -0.3,
                vibrance: 0.1,
                contrast: 0.1
            )

        case .punchy:
            return Parameters(
                contrast: 0.3,
                saturation: 0.2,
                vibrance: 0.1,
                shadows: -0.1,  // Crush shadows slightly
                highlights: 0.1
            )

        case .vintage:
            return Parameters(
                warmth: 0.2,
                saturation: -0.1,
                contrast: -0.1,
                highlights: -0.1  // Soft highlights
            )

        case .muted:
            return Parameters(
                saturation: -0.3,
                contrast: -0.2,
                vibrance: -0.2
            )
        }
    }
}
```

**UI Integration:**

```swift
// AdjustView.swift - Sliders bound to parameters
@State private var adjustments = UserAdjustments.Parameters()

VStack(spacing: 16) {
    ExposureSlider(value: $adjustments.exposure)
    WarmthSlider(value: $adjustments.warmth)
    ContrastSlider(value: $adjustments.contrast)
}
.onChange(of: adjustments) { _, newValue in
    // Re-process image with new adjustments
    Task {
        processedImage = try await processor.applyUserAdjustments(
            baseImage,
            parameters: newValue
        )
    }
}
```

**Design System (Orange Themed):**

```swift
// ExposureSlider.swift
Slider(value: $value, in: -2.0...2.0)
    .tint(AnalogTheme.sliderTrack)  // Orange color

// AnalogTheme.swift
static let sliderTrack = Color(red: 1.0, green: 0.6, blue: 0.2)  // #FF9933
```

### 2.6 Sharpening & Export ✅ (Export Missing DNG)

**Sharpening Implementation:**

```swift
func applySharpen(_ image: CIImage, amount: Float) -> CIImage {
    let filter = CIFilter(name: "CISharpenLuminance")!
    filter.setValue(image, forKey: kCIInputImageKey)
    filter.setValue(amount, forKey: "inputSharpness")  // 0.0-1.0

    return filter.outputImage!
}

// Alternative: Unsharp mask (more control)
func applyUnsharpMask(_ image: CIImage, radius: Float, intensity: Float) -> CIImage {
    let filter = CIFilter(name: "CIUnsharpMask")!
    filter.setValue(image, forKey: kCIInputImageKey)
    filter.setValue(radius, forKey: "inputRadius")        // Pixels
    filter.setValue(intensity, forKey: "inputIntensity")  // 0.0-1.0

    return filter.outputImage!
}
```

**Export Implementation:** `Processing/Pipeline/ExportManager.swift` (234 lines)

```swift
enum ExportFormat {
    case jpeg
    case png
    case heic
    // case dng  // ❌ NOT IMPLEMENTED
}

func export(
    image: CIImage,
    format: ExportFormat,
    quality: ExportQuality,
    context: CIContext
) async throws -> Data {
    // Convert CIImage to CGImage
    guard let cgImage = context.createCGImage(image, from: image.extent) else {
        throw ExportError.failedToCreateCGImage
    }

    let data = NSMutableData()

    guard let destination = CGImageDestinationCreateWithData(
        data,
        format.uti as CFString,
        1,
        nil
    ) else {
        throw ExportError.failedToCreateDestination
    }

    // Set compression quality
    let options: [CFString: Any] = [
        kCGImageDestinationLossyCompressionQuality: quality.compressionQuality
    ]

    CGImageDestinationAddImage(destination, cgImage, options as CFDictionary)

    guard CGImageDestinationFinalize(destination) else {
        throw ExportError.failedToFinalize
    }

    return data as Data
}

enum ExportQuality {
    case low        // 0.5 compression (smaller files, watermarked)
    case medium     // 0.7 compression
    case high       // 0.9 compression (Pro)
    case maximum    // 1.0 compression (Pro, lossless for HEIC)

    var compressionQuality: CGFloat {
        switch self {
        case .low: return 0.5
        case .medium: return 0.7
        case .high: return 0.9
        case .maximum: return 1.0
        }
    }

    var isProOnly: Bool {
        switch self {
        case .high, .maximum: return true
        default: return false
        }
    }
}
```

**Tier-Based Export Logic:**

```swift
func determineExportQuality(isPro: Bool) -> ExportQuality {
    if isPro {
        return .maximum  // Full quality for Pro users
    } else {
        return .medium   // Reduced quality for free tier
    }
}

func exportWithWatermark(image: CIImage, isPro: Bool) async throws -> Data {
    var finalImage = image

    if !isPro {
        // Apply watermark for free tier
        finalImage = try await WatermarkRenderer.shared.addWatermark(to: image)
    }

    let quality = determineExportQuality(isPro: isPro)
    return try await export(image: finalImage, format: .jpeg, quality: quality, context: ciContext)
}
```

**Missing: DNG Export ❌**

**Current State:**
- RAW capture works ✅
- RAW data stored in `ScannedImage.rawData` ✅
- Export only outputs processed JPEG/HEIC ❌

**What's Needed:**

```swift
// Add to ExportFormat enum
case dng

// Add DNG export method
func exportDNG(_ scannedImage: ScannedImage) async throws -> Data {
    guard let rawData = scannedImage.rawData else {
        throw ExportError.noRawDataAvailable
    }

    // Option 1: Return raw DNG data directly (no processing)
    return rawData

    // Option 2: Write EXIF metadata to DNG
    return try writeEXIFMetadata(to: rawData, metadata: scannedImage.metadata)
}

func writeEXIFMetadata(to dngData: Data, metadata: ScannedImage.Metadata) throws -> Data {
    guard let source = CGImageSourceCreateWithData(dngData as CFData, nil) else {
        throw ExportError.invalidDNGData
    }

    guard let uti = CGImageSourceGetType(source) else {
        throw ExportError.unknownImageType
    }

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

    // Add/update EXIF dictionary
    var exifDict = properties[kCGImagePropertyExifDictionary] as? [CFString: Any] ?? [:]
    exifDict[kCGImagePropertyExifUserComment] = metadata.filmStock ?? "Unknown film"
    exifDict[kCGImagePropertyExifISOSpeedRatings] = [metadata.iso ?? 400]

    if let shutterSpeed = metadata.shutterSpeed {
        exifDict[kCGImagePropertyExifExposureTime] = shutterSpeed
    }

    properties[kCGImagePropertyExifDictionary] = exifDict

    // Add IPTC metadata (photographer, copyright, etc.)
    var iptcDict = properties[kCGImagePropertyIPTCDictionary] as? [CFString: Any] ?? [:]
    iptcDict[kCGImagePropertyIPTCCopyrightNotice] = "Scanned with Analog Intelligence"
    properties[kCGImagePropertyIPTCDictionary] = iptcDict

    // Write updated image
    CGImageDestinationAddImageFromSource(destination, source, 0, properties as CFDictionary)

    guard CGImageDestinationFinalize(destination) else {
        throw ExportError.failedToFinalize
    }

    return mutableData as Data
}
```

**Priority:** HIGH - This is a critical Pro feature differentiator

---

## Phase 3: Storage & Data Management

### 3.1 Storage Architecture ✅

**Implementation:** `Storage/StorageManager.swift` (412 lines)

**Storage Locations:**

```swift
// App documents directory structure
Documents/
├── images/                    # Processed positive images
│   ├── {uuid}.jpg
│   ├── {uuid}.heic
│   └── {uuid}.png
├── raw/                       # Original RAW captures (DNG)
│   └── {uuid}.dng
├── metadata/                  # JSON metadata files
│   └── {uuid}.json
└── sessions/                  # Batch scan sessions
    └── {session-uuid}.json
```

**File Naming:**
- UUID-based to avoid collisions
- Example: `3F2504E0-4F89-11D3-9A0C-0305E82C3301.jpg`

**Storage Manager API:**

```swift
@MainActor
class StorageManager: ObservableObject {
    static let shared = StorageManager()

    @Published private(set) var images: [ScannedImage] = []
    @Published private(set) var sessions: [ScanSession] = []

    // MARK: - Image Operations

    /// Save a scanned image to disk
    func save(_ image: ScannedImage) throws {
        // Save processed image data
        try saveImageData(image.processedData, id: image.id, format: image.format)

        // Save RAW data if available
        if let rawData = image.rawData {
            try saveRawData(rawData, id: image.id)
        }

        // Save metadata JSON
        try saveMetadata(image.metadata, id: image.id)

        // Add to in-memory array
        images.append(image)
    }

    /// Load a scanned image from disk
    func loadImage(id: UUID) -> ScannedImage? {
        guard let processedData = try? loadImageData(id: id),
              let metadata = try? loadMetadata(id: id) else {
            return nil
        }

        let rawData = try? loadRawData(id: id)  // Optional

        return ScannedImage(
            id: id,
            processedData: processedData,
            rawData: rawData,
            metadata: metadata
        )
    }

    /// Delete an image
    func deleteImage(id: UUID) throws {
        try deleteImageData(id: id)
        try? deleteRawData(id: id)  // May not exist
        try? deleteMetadata(id: id)

        images.removeAll { $0.id == id }
    }

    /// Delete multiple images
    func deleteImages(ids: [UUID]) async throws {
        for id in ids {
            try deleteImage(id: id)
        }
    }

    // MARK: - Session Operations

    /// Save a batch scan session
    func save(_ session: ScanSession) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        let data = try encoder.encode(session)
        let url = sessionURL(for: session.id)

        try data.write(to: url, options: .atomic)

        sessions.append(session)
    }

    /// Load all sessions
    func loadSessions() throws {
        let sessionURLs = try FileManager.default.contentsOfDirectory(
            at: sessionsDirectory,
            includingPropertiesForKeys: nil
        )

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        sessions = sessionURLs.compactMap { url in
            guard let data = try? Data(contentsOf: url),
                  let session = try? decoder.decode(ScanSession.self, from: data) else {
                return nil
            }
            return session
        }
    }

    // MARK: - Export Operations

    /// Prepare image for sharing (copy to temp directory)
    func prepareForSharing(imageId: UUID) async throws -> URL {
        guard let image = loadImage(id: imageId) else {
            throw StorageError.imageNotFound
        }

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(imageId.uuidString)
            .appendingPathExtension(image.format.extension)

        try image.processedData.write(to: tempURL, options: .atomic)

        return tempURL
    }

    /// Export to Photos library
    func exportToPhotos(imageIds: [UUID]) async throws {
        for id in imageIds {
            guard let image = loadImage(id: id) else { continue }

            try await PHPhotoLibrary.shared().performChanges {
                let creationRequest = PHAssetCreationRequest.forAsset()

                if let rawData = image.rawData {
                    // Add RAW + JPEG pair
                    creationRequest.addResource(
                        with: .photo,
                        data: image.processedData,
                        options: nil
                    )
                    creationRequest.addResource(
                        with: .alternatePhoto,
                        data: rawData,
                        options: nil
                    )
                } else {
                    // Add processed image only
                    creationRequest.addResource(
                        with: .photo,
                        data: image.processedData,
                        options: nil
                    )
                }
            }
        }
    }
}

enum StorageError: Error {
    case imageNotFound
    case failedToWrite
    case failedToRead
    case invalidData
}
```

**File URL Helpers:**

```swift
private var documentsDirectory: URL {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
}

private var imagesDirectory: URL {
    documentsDirectory.appendingPathComponent("images", isDirectory: true)
}

private var rawDirectory: URL {
    documentsDirectory.appendingPathComponent("raw", isDirectory: true)
}

private var metadataDirectory: URL {
    documentsDirectory.appendingPathComponent("metadata", isDirectory: true)
}

private var sessionsDirectory: URL {
    documentsDirectory.appendingPathComponent("sessions", isDirectory: true)
}

private func imageURL(for id: UUID, format: ImageFormat) -> URL {
    imagesDirectory
        .appendingPathComponent(id.uuidString)
        .appendingPathExtension(format.extension)
}

private func rawURL(for id: UUID) -> URL {
    rawDirectory
        .appendingPathComponent(id.uuidString)
        .appendingPathExtension("dng")
}

private func metadataURL(for id: UUID) -> URL {
    metadataDirectory
        .appendingPathComponent(id.uuidString)
        .appendingPathExtension("json")
}
```

### 3.2 Data Models ✅

**Scanned Image Model:**

```swift
// Storage/ScannedImage.swift (198 lines)
struct ScannedImage: Identifiable, Codable {
    var id: UUID
    var captureDate: Date
    var processedData: Data        // JPEG/HEIC/PNG
    var rawData: Data?             // DNG (optional)
    var thumbnail: Data?           // Cached thumbnail
    var format: ImageFormat
    var metadata: Metadata

    // Processing settings used
    var filmType: FilmType
    var processingConfig: ImageProcessor.ProcessingConfig

    // Computed properties
    var fileSize: Int {
        processedData.count + (rawData?.count ?? 0)
    }

    var formattedFileSize: String {
        ByteCountFormatter.string(fromByteCount: Int64(fileSize), countStyle: .file)
    }

    // MARK: - Metadata

    struct Metadata: Codable {
        var filmStock: String?         // "Kodak Portra 400"
        var exposureNumber: Int?       // Frame number on roll (1-36)
        var iso: Int?                  // Film ISO rating (100, 400, 800, etc.)
        var shutterSpeed: String?      // From camera metadata
        var aperture: String?          // Lens aperture used for scan
        var notes: String?             // User notes

        // Scan settings
        var scanDate: Date
        var deviceModel: String        // iPhone model
        var appVersion: String

        // Processing metadata
        var orangeMaskStrength: Float?
        var autoToneCurveApplied: Bool
        var sharpenAmount: Float

        // Optional crop/rotation
        var cropRect: CodableRect?
        var rotationAngle: Float
    }

    // MARK: - Codable Helpers

    struct CodableRect: Codable {
        var x: CGFloat
        var y: CGFloat
        var width: CGFloat
        var height: CGFloat

        init(_ rect: CGRect) {
            self.x = rect.origin.x
            self.y = rect.origin.y
            self.width = rect.size.width
            self.height = rect.size.height
        }

        var cgRect: CGRect {
            CGRect(x: x, y: y, width: width, height: height)
        }
    }
}

enum ImageFormat: String, Codable {
    case heic
    case jpeg
    case raw
    case png

    var extension: String {
        switch self {
        case .heic: return "heic"
        case .jpeg: return "jpg"
        case .raw: return "dng"
        case .png: return "png"
        }
    }

    var uti: String {
        switch self {
        case .heic: return "public.heic"
        case .jpeg: return "public.jpeg"
        case .raw: return "com.adobe.raw-image"
        case .png: return "public.png"
        }
    }
}
```

**Scan Session Model:**

```swift
// Storage/ScanSession.swift (147 lines)
struct ScanSession: Identifiable, Codable {
    var id: UUID
    var name: String               // "2026-03-05 Evening Shoot"
    var startDate: Date
    var endDate: Date?

    var filmStock: String?         // "Kodak Portra 400"
    var filmSpeed: Int?            // ISO rating
    var rollFormat: RollFormat     // 35mm, 120, etc.

    var capturedImages: [UUID]     // Image IDs in order
    var currentFrame: Int          // Next frame to capture

    var calibrationSettings: CalibrationSummary?
    var notes: String?

    enum RollFormat: String, Codable {
        case format35mm = "35mm"
        case format120 = "120"
        case format4x5 = "4×5"
        case formatOther = "Other"

        var expectedFrameCount: Int {
            switch self {
            case .format35mm: return 36
            case .format120: return 12  // 6×6, varies by format
            case .format4x5: return 1   // Sheet film
            case .formatOther: return 0
            }
        }
    }

    var progress: Float {
        guard rollFormat.expectedFrameCount > 0 else { return 0 }
        return Float(capturedImages.count) / Float(rollFormat.expectedFrameCount)
    }

    var isComplete: Bool {
        rollFormat.expectedFrameCount > 0 &&
        capturedImages.count >= rollFormat.expectedFrameCount
    }
}
```

**User Preferences:**

```swift
// Storage/UserPreferences.swift (89 lines)
struct UserPreferences: Codable {
    // Camera Settings
    var defaultCaptureFormat: CaptureFormat = .heic
    var autoLockCalibration: Bool = false
    var showGridOverlay: Bool = false       // ❌ Not implemented in UI

    // Processing Settings
    var defaultFilmType: FilmType = .colorNegative
    var autoOrangeMaskRemoval: Bool = true
    var autoToneCorrection: Bool = true
    var defaultSharpenAmount: Float = 0.5

    // Export Settings
    var defaultExportFormat: ExportFormat = .jpeg
    var saveToPhotosAfterProcessing: Bool = false

    // UI Settings
    var isPro: Bool = false  // Synced from PurchaseState

    enum CaptureFormat: String, Codable {
        case heic, jpeg, raw
    }

    enum ExportFormat: String, Codable {
        case jpeg, png, heic
    }
}

@MainActor
class PreferencesManager: ObservableObject {
    static let shared = PreferencesManager()

    @Published var preferences: UserPreferences

    private let userDefaultsKey = "com.analogintelligence.preferences"

    init() {
        // Load from UserDefaults
        if let data = UserDefaults.standard.data(forKey: userDefaultsKey),
           let prefs = try? JSONDecoder().decode(UserPreferences.self, from: data) {
            self.preferences = prefs
        } else {
            self.preferences = UserPreferences()
        }
    }

    func updatePreference<T>(_ keyPath: WritableKeyPath<UserPreferences, T>, value: T) {
        preferences[keyPath: keyPath] = value
        save()
    }

    private func save() {
        if let data = try? JSONEncoder().encode(preferences) {
            UserDefaults.standard.set(data, forKey: userDefaultsKey)
            UserDefaults.standard.synchronize()
        }
    }
}
```

---

## Phase 4: Monetization (StoreKit 2)

### 4.1 Purchase System ✅

**Implementation:** `Purchases/StoreKitManager.swift` (644 lines)

**Product Configuration:**

```swift
struct ProductIdentifiers {
    static let proUnlock = "com.analogintelligence.pro_unlock"
    static let allProducts = [proUnlock]
}

// StoreKit Configuration File: AnalogIntelligence.storekit
// Product ID: com.analogintelligence.pro_unlock
// Type: Non-Consumable
// Price: $9.99 USD
// Reference Name: "Pro Unlock"
```

**Purchase Flow:**

```swift
@MainActor
class StoreKitManager: ObservableObject {
    static let shared = StoreKitManager()

    private let purchaseState = PurchaseState.shared
    private var updateListenerTask: Task<Void, Never>?

    init() {
        // Listen for transaction updates from App Store
        updateListenerTask = listenForTransactions()

        Task {
            await loadProducts()
            await handlePendingTransactions()
            await updateCustomerProductStatus()
        }
    }

    // MARK: - Purchase

    func purchaseProUnlock() async {
        guard let product = purchaseState.proUnlockProduct else {
            purchaseState.setError("Product not available")
            return
        }

        purchaseState.updatePurchaseStatus(.purchasing)

        do {
            let result = try await product.purchase()

            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)

                // Save transaction details
                purchaseState.updateProStatus(
                    true,
                    transactionId: String(transaction.id),
                    purchaseDate: transaction.purchaseDate
                )

                await transaction.finish()
                purchaseState.updatePurchaseStatus(.purchased)

            case .userCancelled:
                purchaseState.updatePurchaseStatus(.cancelled)

            case .pending:
                // Ask to Buy (parental controls)
                purchaseState.updatePurchaseStatus(.pending)

            @unknown default:
                purchaseState.setError("Unknown purchase result")
            }

        } catch {
            purchaseState.updatePurchaseStatus(.failed(error.localizedDescription))
        }
    }

    // MARK: - Restore

    func restorePurchases() async {
        purchaseState.updatePurchaseStatus(.restoring)

        do {
            try await AppStore.sync()  // Sync with App Store

            var restoredCount = 0

            for await result in Transaction.currentEntitlements {
                let transaction = try checkVerified(result)

                if transaction.productID == ProductIdentifiers.proUnlock {
                    restoredCount += 1

                    purchaseState.updateProStatus(
                        true,
                        transactionId: String(transaction.id),
                        purchaseDate: transaction.purchaseDate
                    )
                }
            }

            if restoredCount > 0 {
                purchaseState.updatePurchaseStatus(.restored)
            } else {
                purchaseState.setError("No purchases found to restore")
            }

        } catch {
            purchaseState.updatePurchaseStatus(.failed("Restore failed: \\(error.localizedDescription)"))
        }
    }

    // MARK: - Transaction Verification

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw StoreError.failedVerification
        case .verified(let safe):
            return safe
        }
    }

    // MARK: - Entitlement Checking

    func updateCustomerProductStatus() async {
        var hasPro = false

        for await result in Transaction.currentEntitlements {
            do {
                let transaction = try checkVerified(result)

                if transaction.productID == ProductIdentifiers.proUnlock {
                    hasPro = true

                    purchaseState.updateProStatus(
                        true,
                        transactionId: String(transaction.id),
                        purchaseDate: transaction.purchaseDate
                    )
                }
            } catch {
                print("Failed to verify transaction: \\(error)")
            }
        }

        if !hasPro {
            purchaseState.updateProStatus(false)
        }
    }

    // MARK: - Transaction Listener

    private func listenForTransactions() -> Task<Void, Never> {
        return Task {
            for await result in Transaction.updates {
                do {
                    let transaction = try self.checkVerified(result)

                    // Handle refunds
                    if let revocationDate = transaction.revocationDate {
                        if transaction.productID == ProductIdentifiers.proUnlock {
                            self.purchaseState.updateProStatus(false)
                        }
                    }

                    await self.updateCustomerProductStatus()
                    await transaction.finish()

                } catch {
                    print("Transaction verification failed: \\(error)")
                }
            }
        }
    }
}

enum StoreError: Error {
    case failedVerification
}
```

**Purchase State:**

```swift
// Purchases/PurchaseState.swift (247 lines)
@MainActor
class PurchaseState: ObservableObject {
    static let shared = PurchaseState()

    @Published private(set) var isPro: Bool = false
    @Published private(set) var purchaseStatus: PurchaseStatus = .unknown
    @Published var errorMessage: String?

    @Published private(set) var purchaseDate: Date?
    @Published private(set) var transactionId: String?
    @Published private(set) var restoredPurchaseCount: Int = 0

    private let userDefaultsKey = "com.analogintelligence.isPro"

    init() {
        loadPersistedState()
    }

    func updateProStatus(_ status: Bool, transactionId: String? = nil, purchaseDate: Date? = nil) {
        isPro = status

        if status {
            self.transactionId = transactionId
            self.purchaseDate = purchaseDate ?? Date()
            purchaseStatus = .purchased
        }

        persistState()
    }

    private func loadPersistedState() {
        isPro = UserDefaults.standard.bool(forKey: userDefaultsKey)
    }

    private func persistState() {
        UserDefaults.standard.set(isPro, forKey: userDefaultsKey)
        UserDefaults.standard.synchronize()
    }
}

enum PurchaseStatus: Equatable {
    case unknown
    case notPurchased
    case purchasing
    case purchased
    case failed(String)
    case cancelled
    case pending
    case restored
    case restoring

    var isLoading: Bool {
        switch self {
        case .purchasing, .pending, .restoring: return true
        default: return false
        }
    }
}
```

### 4.2 Pro Feature Gating ✅

**Feature Gates:**

| Feature | Free | Pro |
|---------|------|-----|
| Basic scan & invert | ✅ | ✅ |
| Manual adjustments | ✅ | ✅ |
| JPEG export (medium quality) | ✅ | ✅ |
| **AI Color Reconstruction** | ❌ | ✅ |
| **AI Dust Removal** | ❌ | ✅ |
| **Insights Tab** | ⚠️ (Pro prompt) | ✅ |
| **Contact Sheet Generator** | ❌ | ✅ |
| **High-quality export** | ❌ | ✅ |
| **DNG export** | ❌ | ✅ |
| **No watermark** | ❌ | ✅ |
| **No ads** | ❌ | ✅ |

**Implementation:**

```swift
// Purchases/ProFeatureGate.swift
struct ProFeatureGate: ViewModifier {
    let feature: String
    @StateObject private var purchaseState = PurchaseState.shared
    @State private var showingUpgrade = false

    func body(content: Content) -> some View {
        if purchaseState.isPro {
            content  // Show feature
        } else {
            Button {
                showingUpgrade = true
            } label: {
                ProFeatureLock(
                    featureName: feature,
                    featureDescription: "Unlock with Pro"
                )
            }
            .sheet(isPresented: $showingUpgrade) {
                ProUnlockView()
            }
        }
    }
}

extension View {
    func requiresPro(feature: String) -> some View {
        modifier(ProFeatureGate(feature: feature))
    }
}

// Usage:
AIColorReconstructionPanel()
    .requiresPro(feature: "AI Color Reconstruction")
```

**Watermark Rendering:**

```swift
// Purchases/WatermarkRenderer.swift (187 lines)
class WatermarkRenderer {
    static let shared = WatermarkRenderer()

    func addWatermark(to image: CIImage) async throws -> CIImage {
        let watermarkText = "AI Watermark"
        let font = UIFont.systemFont(ofSize: 24, weight: .medium)

        // Create text image
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: UIColor.white.withAlphaComponent(0.8)
        ]

        let attributedString = NSAttributedString(string: watermarkText, attributes: attributes)
        let textSize = attributedString.size()

        let renderer = UIGraphicsImageRenderer(size: textSize)
        let textImage = renderer.image { context in
            attributedString.draw(at: .zero)
        }

        guard let ciTextImage = CIImage(image: textImage) else {
            throw ProcessingError.processingFailed("Failed to create watermark")
        }

        // Position watermark (bottom-right corner)
        let xPos = image.extent.width - textSize.width - 20
        let yPos = 20  // Bottom of image

        let positioned = ciTextImage.transformed(by: CGAffineTransform(
            translationX: xPos,
            y: yPos
        ))

        // Composite over original image
        let compositeFilter = CIFilter(name: "CISourceOverCompositing")!
        compositeFilter.setValue(positioned, forKey: kCIInputImageKey)
        compositeFilter.setValue(image, forKey: kCIInputBackgroundImageKey)

        return compositeFilter.outputImage!
    }
}
```

### 4.3 AdMob Integration ⚠️ (Code Ready, SDK Not Installed)

**Implementation:** `Purchases/AdMobManager.swift` (272 lines)

**Status:** Code is production-ready, but Google Mobile Ads SDK not installed via CocoaPods/SPM

```swift
// AdMobManager.swift
@MainActor
class AdMobManager: NSObject, ObservableObject {
    static let shared = AdMobManager()

    @Published var adState: AdLoadState = .notLoaded
    @Published var isInitialized: Bool = false

    // Test ad unit IDs (pre-configured)
    private let testBannerAdUnitID = "ca-app-pub-3940256099942544/2934735716"

    // Production ad unit IDs (replace with your own)
    private let productionBannerAdUnitID = "YOUR_BANNER_AD_UNIT_ID_HERE"

    var currentBannerAdUnitID: String {
        #if DEBUG
        return testBannerAdUnitID
        #else
        return productionBannerAdUnitID
        #endif
    }

    // MARK: - Initialization

    func initialize() {
        // UNCOMMENT when Google Mobile Ads SDK is added:
        // GADMobileAds.sharedInstance().start { status in
        //     self.isInitialized = true
        // }
    }

    // MARK: - Ad Visibility

    func updateAdVisibility() {
        let shouldShowAds = !PurchaseState.shared.isPro

        if shouldShowAds {
            // Load ad
        } else {
            // Hide/remove ad
            adState = .hidden
        }
    }
}

enum AdLoadState: Equatable {
    case notLoaded
    case loading
    case loaded
    case failed(String)
    case hidden
}
```

**Banner Ad View:**

```swift
// Purchases/BannerAdView.swift (231 lines)
struct BannerAdView: View {
    @StateObject private var purchaseState = PurchaseState.shared
    @StateObject private var adMobManager = AdMobManager.shared

    var body: some View {
        Group {
            if !purchaseState.isPro {
                VStack(spacing: 0) {
                    Divider()

                    // Ad placeholder (will show real ads when AdMob SDK is added)
                    HStack {
                        Text("SPONSORED AD")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(AnalogTheme.textSecondary)

                        Spacer()

                        Image(systemName: "rectangle.inset.filled")
                            .foregroundColor(AnalogTheme.textTertiary)
                    }
                    .frame(height: adMobManager.standardBannerHeight)  // 50pt
                    .padding(.horizontal, AnalogTheme.paddingMedium)
                    .background(AnalogTheme.backgroundCard)
                }
            }
        }
        .onChange(of: purchaseState.isPro) { _, isPro in
            if isPro {
                adMobManager.updateAdVisibility()
            }
        }
    }
}

// Usage in GalleryView.swift:64-67
if !purchaseState.isPro {
    BannerAdView()
}
```

**Installation Steps (Not Yet Done):**

1. Install Google Mobile Ads SDK:
```bash
# Via CocoaPods
pod 'Google-Mobile-Ads-SDK'
pod install

# Or via Swift Package Manager
# https://github.com/googleads/swift-package-manager-google-mobile-ads
```

2. Update Info.plist:
```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY</string>

<key>SKAdNetworkItems</key>
<array>
    <!-- AdMob SKAdNetwork IDs -->
</array>
```

3. Uncomment AdMob code in `AdMobManager.swift` and `BannerAdView.swift`

4. Test with test ad unit IDs, then replace with production IDs

---

## Phase 5: Future Features & Roadmap

### 5.1 Critical Gap Items (High Priority)

#### 1. DNG/RAW Export ❌
**Status:** Not implemented
**Priority:** HIGH
**Effort:** 2-3 days
**Impact:** Pro feature differentiator

**Implementation Plan:**
- Add `.dng` case to `ExportFormat` enum
- Implement `exportDNG()` method in ExportManager
- Add EXIF metadata writing to DNG files
- UI: Add "Export RAW (DNG)" option in export menu

**Technical Details:** See Section 2.6

#### 2. Manual Camera Controls UI ❌
**Status:** Backend exists, UI missing
**Priority:** HIGH
**Effort:** 3-5 days
**Impact:** Essential for serious film photographers

**Implementation Plan:**

```swift
// New file: UI/Scan/ManualControlsPanel.swift
struct ManualControlsPanel: View {
    @ObservedObject var calibrationManager: CalibrationManager

    var body: some View {
        VStack(spacing: 12) {
            // Focus slider
            VStack(alignment: .leading) {
                Text("Focus")
                    .font(.caption)

                HStack {
                    Text("∞")  // Infinity
                    Slider(value: $calibrationManager.currentLensPosition, in: 0...1)
                        .tint(.orange)
                        .onChange(of: calibrationManager.currentLensPosition) { _, newValue in
                            Task {
                                try? await calibrationManager.setFocus(lensPosition: newValue)
                            }
                        }
                    Image(systemName: "hand.point.up.left.fill")  // Close focus
                }
            }

            // ISO slider
            VStack(alignment: .leading) {
                Text("ISO")
                    .font(.caption)

                HStack {
                    Text("\\(Int(calibrationManager.currentISO))")
                        .frame(width: 60, alignment: .leading)

                    Slider(
                        value: $calibrationManager.currentISO,
                        in: calibrationManager.isoRange.lowerBound...calibrationManager.isoRange.upperBound
                    )
                    .tint(.orange)
                    .onChange(of: calibrationManager.currentISO) { _, _ in
                        updateExposure()
                    }
                }
            }

            // Shutter speed slider (log scale)
            VStack(alignment: .leading) {
                Text("Shutter")
                    .font(.caption)

                HStack {
                    Text(calibrationManager.formattedShutterSpeed)
                        .frame(width: 60, alignment: .leading)

                    // Use log scale for shutter speed
                    Slider(value: $shutterSpeedLog, in: -15...0)  // 1/32000 to 1s
                        .tint(.orange)
                        .onChange(of: shutterSpeedLog) { _, _ in
                            updateExposure()
                        }
                }
            }

            // White balance preset picker
            Picker("WB", selection: $selectedWBPreset) {
                ForEach(WBPreset.allCases) { preset in
                    Text(preset.rawValue).tag(preset)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: selectedWBPreset) { _, newValue in
                Task {
                    try? await calibrationManager.setWhiteBalance(gains: newValue.gains)
                }
            }
        }
        .padding()
        .background(Color.black.opacity(0.7))
        .cornerRadius(12)
    }

    enum WBPreset: String, CaseIterable, Identifiable {
        case auto = "Auto"
        case daylight = "Day"
        case cloudy = "Cloudy"
        case tungsten = "Tungsten"
        case fluorescent = "Fluor"

        var id: String { rawValue }

        var gains: AVCaptureDevice.WhiteBalanceGains {
            // Approximate gains for each preset
            // These would need to be calibrated per device
            switch self {
            case .auto:
                return AVCaptureDevice.WhiteBalanceGains(redGain: 1.0, greenGain: 1.0, blueGain: 1.0)
            case .daylight:
                return AVCaptureDevice.WhiteBalanceGains(redGain: 1.0, greenGain: 1.0, blueGain: 1.4)
            case .cloudy:
                return AVCaptureDevice.WhiteBalanceGains(redGain: 1.0, greenGain: 1.0, blueGain: 1.6)
            case .tungsten:
                return AVCaptureDevice.WhiteBalanceGains(redGain: 2.0, greenGain: 1.0, blueGain: 1.0)
            case .fluorescent:
                return AVCaptureDevice.WhiteBalanceGains(redGain: 1.2, greenGain: 1.0, blueGain: 1.8)
            }
        }
    }
}
```

#### 3. Focus Peaking ❌
**Status:** Not implemented
**Priority:** MEDIUM (but critical for quality)
**Effort:** 5-7 days
**Impact:** Essential for capturing maximum sharpness

**Implementation Plan:**

```swift
// New file: Camera/FocusPeakingProcessor.swift
class FocusPeakingProcessor {
    private let ciContext: CIContext

    init() {
        ciContext = CIContext(options: [.useSoftwareRenderer: false])
    }

    /// Process video frame and overlay focus peaking highlights
    func addFocusPeaking(to frame: CVPixelBuffer, threshold: Float = 0.3, color: UIColor = .red) -> CIImage {
        let inputImage = CIImage(cvPixelBuffer: frame)

        // 1. Convert to grayscale
        guard let grayscaleFilter = CIFilter(name: "CIPhotoEffectMono") else {
            return inputImage
        }
        grayscaleFilter.setValue(inputImage, forKey: kCIInputImageKey)
        let grayscale = grayscaleFilter.outputImage!

        // 2. Apply edge detection (Sobel operator)
        guard let edgesFilter = CIFilter(name: "CIEdges") else {
            return inputImage
        }
        edgesFilter.setValue(grayscale, forKey: kCIInputImageKey)
        edgesFilter.setValue(threshold * 10, forKey: "inputIntensity")
        let edges = edgesFilter.outputImage!

        // 3. Threshold to binary (high-contrast edges only)
        guard let thresholdFilter = CIFilter(name: "CIColorControls") else {
            return inputImage
        }
        thresholdFilter.setValue(edges, forKey: kCIInputImageKey)
        thresholdFilter.setValue(0.0, forKey: "inputBrightness")
        thresholdFilter.setValue(5.0, forKey: "inputContrast")  // Extreme contrast
        let thresholded = thresholdFilter.outputImage!

        // 4. Colorize edges (e.g., red)
        guard let colorFilter = CIFilter(name: "CIFalseColor") else {
            return inputImage
        }
        colorFilter.setValue(thresholded, forKey: kCIInputImageKey)
        colorFilter.setValue(CIColor(color: color), forKey: "inputColor0")      // Edges
        colorFilter.setValue(CIColor(color: .clear), forKey: "inputColor1")     // Background
        let coloredEdges = colorFilter.outputImage!

        // 5. Composite over original frame
        guard let compositeFilter = CIFilter(name: "CISourceOverCompositing") else {
            return inputImage
        }
        compositeFilter.setValue(coloredEdges, forKey: kCIInputImageKey)
        compositeFilter.setValue(inputImage, forKey: kCIInputBackgroundImageKey)

        return compositeFilter.outputImage!
    }
}

// Integration in CameraManager.swift
extension CameraManager: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        if focusPeakingEnabled {
            let peakedImage = focusPeakingProcessor.addFocusPeaking(to: pixelBuffer)

            Task { @MainActor in
                self.focusPeakingImage = peakedImage
            }
        }
    }
}

// UI Toggle
Toggle("Focus Peaking", isOn: $cameraManager.focusPeakingEnabled)
```

**Performance Target:** 30+ FPS on iPhone 13 Pro and newer

#### 4. Automatic Frame Detection ❌
**Status:** Not implemented
**Priority:** MEDIUM
**Effort:** 7-10 days
**Impact:** Major UX improvement, reduces manual alignment

**Implementation Plan:**

```swift
// New file: Processing/Vision/FrameDetector.swift
import Vision

class FrameDetector {
    func detectFilmFrame(in image: CIImage) async throws -> VNRectangleObservation? {
        let request = VNDetectRectanglesRequest()

        // Configure for film frames
        request.minimumAspectRatio = 0.6   // ~2:3 for 35mm
        request.maximumAspectRatio = 0.7
        request.minimumSize = 0.3          // At least 30% of image
        request.minimumConfidence = 0.7
        request.maximumObservations = 1

        let handler = VNImageRequestHandler(ciImage: image, options: [:])

        try await handler.perform([request])

        return request.results?.first
    }

    func convertToProcessingPoints(_ observation: VNRectangleObservation, imageSize: CGSize) -> [CGPoint] {
        // Convert normalized points (0-1) to image coordinates
        return [
            CGPoint(
                x: observation.topLeft.x * imageSize.width,
                y: (1 - observation.topLeft.y) * imageSize.height
            ),
            CGPoint(
                x: observation.topRight.x * imageSize.width,
                y: (1 - observation.topRight.y) * imageSize.height
            ),
            CGPoint(
                x: observation.bottomRight.x * imageSize.width,
                y: (1 - observation.bottomRight.y) * imageSize.height
            ),
            CGPoint(
                x: observation.bottomLeft.x * imageSize.width,
                y: (1 - observation.bottomLeft.y) * imageSize.height
            )
        ]
    }
}

// Usage in ScanWorkflowManager.swift
func processCapturedImage(_ imageData: Data) async throws {
    let ciImage = CIImage(data: imageData)!

    // Detect film frame
    let frameDetector = FrameDetector()
    if let frameObservation = try? await frameDetector.detectFilmFrame(in: ciImage) {
        let corners = frameDetector.convertToProcessingPoints(frameObservation, imageSize: ciImage.extent.size)

        // Update processing config with detected corners
        processingConfig.perspectiveCorrection = corners
    }

    // Continue with processing...
}
```

**Benefits:**
- Automatic cropping of sprocket holes and film borders
- Consistent framing across entire roll
- Option to keep borders for aesthetic (user preference)

### 5.2 Medium Priority Features

#### 5. Live Histogram Overlay ❌
**Priority:** MEDIUM
**Effort:** 2-3 days

**Implementation:** Sample video frames at 10 FPS, analyze histogram, display as overlay

#### 6. Grid Overlays ❌
**Priority:** LOW
**Effort:** 1-2 days

**Types:** Rule of thirds, golden ratio, diagonal, film sprocket guides

#### 7. EXIF Metadata Writing ⚠️
**Priority:** MEDIUM
**Effort:** 2-3 days

**Add to exports:** Film stock, photographer, copyright, scan date, device info

#### 8. Lens Selection UI ⚠️
**Priority:** LOW
**Effort:** 1-2 days

**Add picker:** [0.5x Ultra-wide] [1x Wide] [2x Telephoto] [Macro]

### 5.3 Phase 2: AI Processing (Future)

#### AI Color Reconstruction 🔮
**Technology:** Core ML model trained on color negative pairs
**Training Data:** Professional lab scans vs. phone scans
**Architecture:** U-Net style encoder-decoder for color correction
**On-device:** 50-100MB model, runs in <500ms on iPhone 14 Pro

#### AI Dust & Scratch Removal 🔮
**Technology:** Core ML object detection + inpainting
**Detection:** Tiny-YOLO variant for dust spots
**Removal:** GAN-based inpainting trained on clean film
**Interactive:** User can review and approve/reject each correction

### 5.4 Phase 3: Hardware Integration (Future)

#### BLE Film Scanning Dock 🔮
**Features:**
- Automatic film advance mechanism
- LED light panel for even illumination
- Frame alignment sensors
- Battery-powered (USB-C rechargeable)
- Supports 35mm, 120, 4×5

**Communication:**
- Bluetooth LE for control
- Commands: advance, stop, get status, set speed
- Notifications: frame aligned, jam detected, low battery

---

## Appendices

### A. Build Configuration

**Target:** iOS 17.0+
**Xcode:** 15.0+
**Swift:** 5.9+

**Build Settings:**
- Deployment Target: iOS 17.0
- Swift Language Version: Swift 5
- Optimization Level (Release): -O (Optimize for Speed)
- Enable Bitcode: No (deprecated by Apple)

**Required Capabilities:**
- Camera usage
- Photo library access
- StoreKit (in-app purchases)

**Optional Capabilities:**
- AdMob (when SDK installed)
- iCloud (for future sync)

### B. Third-Party Dependencies

**Current:**
- None (uses only Apple frameworks)

**Pending:**
- Google Mobile Ads SDK (for AdMob integration)

**Future:**
- Core ML models (AI features)

### C. Performance Targets

| Operation | Target | Current | Status |
|-----------|--------|---------|--------|
| Camera preview | 30 FPS | 30 FPS | ✅ |
| Image capture | <500ms | ~300ms | ✅ |
| Full processing (12MP) | <2s | ~525ms | ✅ Exceeds target |
| Export JPEG | <1s | ~300ms | ✅ |
| Export DNG | <500ms | N/A | ❌ Not implemented |
| Focus peaking | 30 FPS | N/A | ❌ Not implemented |
| Live histogram | 10 FPS | N/A | ❌ Not implemented |

### D. Known Limitations

1. **RAW Export:** Capture works, export missing
2. **Manual Controls UI:** Backend complete, UI missing
3. **Focus Peaking:** Not implemented
4. **Automatic Crop:** Manual alignment only
5. **Grid Overlays:** Preference exists, UI missing
6. **Live Histogram:** Post-processing only
7. **Lens Selection:** Discovery works, UI missing
8. **EXIF Writing:** Metadata stored, not written to files
9. **AdMob:** Code ready, SDK not installed
10. **Testing:** 0% code coverage (critical gap)

### E. Security & Privacy

**Permissions Required:**
- `NSCameraUsageDescription` ✅
- `NSPhotoLibraryAddUsageDescription` ✅
- `NSPhotoLibraryUsageDescription` ✅

**Data Storage:**
- Images: App sandbox (not backed up to iCloud)
- Preferences: UserDefaults
- Receipts: UserDefaults (should move to Keychain)

**Privacy Manifest (iOS 17+):**
- Required for AdMob integration
- Must declare data collection practices
- File: `PrivacyInfo.xcprivacy` ⚠️ Needs creation

**App Tracking Transparency:**
- Required before showing personalized ads
- Implemented: ⚠️ TODO when AdMob is activated

---

## Conclusion

The Analog Intelligence iOS film scanner has a **solid foundation** with professional-grade image processing capabilities. The core negative-to-positive conversion engine is complete and performs exceptionally well (525ms for 12MP images).

**Critical next steps:**
1. Implement DNG export
2. Add manual camera controls UI
3. Implement focus peaking
4. Add automatic frame detection
5. Create comprehensive test suite

**Overall assessment:** Ready for beta testing with photographers, pending the 4 critical features above.

---

**End of Technical Specification**
