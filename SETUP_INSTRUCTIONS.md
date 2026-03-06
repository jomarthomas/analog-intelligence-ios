# Analog Intelligence™ - Setup Instructions

## Project Status

✅ All Swift source files have been created and are ready
✅ Folder structure follows the SPEC.md architecture
✅ All Phase 1 MVP features implemented
✅ Info.plist with required permissions configured

## Next Step: Create Xcode Project

Since Xcode projects are best created through the Xcode GUI, follow these steps:

### Option 1: Create New Xcode Project (Recommended)

1. **Open Xcode**
   - Launch Xcode on your Mac

2. **Create New Project**
   - File → New → Project
   - Select **iOS** → **App**
   - Click Next

3. **Configure Project**
   - Product Name: `AnalogIntelligence`
   - Team: (Select your Apple Developer team)
   - Organization Identifier: `com.analogintelligence` (or your preferred identifier)
   - Interface: **SwiftUI**
   - Language: **Swift**
   - **Uncheck** "Use Core Data"
   - **Uncheck** "Include Tests" (for now)
   - Click Next

4. **Save Location**
   - Navigate to: `/Users/jomarthomasalmonte/Documents/GitHub/`
   - **IMPORTANT**: Choose "Create Git repository on my Mac" should be **UNCHECKED** (we already have a git repo)
   - Click Create

5. **Delete Default Files**
   - In Xcode, delete these auto-generated files:
     - `ContentView.swift` (we have our own)
     - `AnalogIntelligenceApp.swift` (we have our own)
     - Keep: `Assets.xcassets`, `Preview Content`

6. **Add All Source Files**
   - Right-click on the AnalogIntelligence folder in Xcode
   - Select "Add Files to AnalogIntelligence..."
   - Navigate to the project root directory
   - Hold ⌘ (Command) and select these folders:
     - `App/`
     - `Camera/`
     - `Processing/`
     - `Storage/`
     - `Purchases/`
     - `UI/`
   - Also select these root-level files:
     - `AnalogIntelligenceApp.swift`
     - `RootView.swift`
     - `Info.plist`
     - `Gemini_Generated_Image_76svll76svll76sv.png` (sample image for simulator)
   - **Make sure** "Copy items if needed" is **UNCHECKED**
   - **Make sure** "Create groups" is selected
   - **Make sure** target "AnalogIntelligence" is **CHECKED**
   - Click Add

7. **Configure Info.plist**
   - Select the project in the navigator
   - Select the AnalogIntelligence target
   - Go to the "Info" tab
   - Click on "Custom iOS Target Properties"
   - Right-click → "Open As" → "Source Code"
   - Replace the contents with the Info.plist from the repository root

8. **Set Deployment Target**
   - In project settings → General tab
   - Set **iOS Deployment Target** to **17.0**

9. **Configure Signing**
   - In project settings → Signing & Capabilities tab
   - Select your Team
   - Xcode will auto-generate a Bundle Identifier

### Option 2: Use Setup Script

We've provided a script that attempts to create the project structure:

```bash
cd /Users/jomarthomasalmonte/Documents/GitHub/analog-intelligence-ios
./scripts/create_xcode_project.sh
```

Then open the project in Xcode and configure signing.

## Building and Running

1. **Select Target Device**
   - Choose "iPhone 15" simulator or your connected iOS device
   - Note: Camera features only work on physical devices

2. **Build the Project**
   - Press ⌘+B or Product → Build
   - Fix any compilation errors (there shouldn't be any!)

3. **Run the App**
   - Press ⌘+R or Product → Run
   - The app should launch in the simulator or on your device

## Testing Checklist

- [ ] App launches successfully
- [ ] Scan tab displays (camera preview on device, placeholder on simulator)
- [ ] Gallery tab displays empty state
- [ ] Insights tab shows Pro lock screen
- [ ] Settings accessible from Scan tab
- [ ] Capture button works (uses sample image on simulator)
- [ ] Adjust screen opens after capture
- [ ] Sliders work on Adjust screen
- [ ] Save functionality works
- [ ] Images appear in Gallery
- [ ] Pro upgrade flow displays
- [ ] StoreKit sandbox testing (on device)

## Troubleshooting

### "No such module" errors
- Clean Build Folder: ⌘+Shift+K
- Delete Derived Data: Xcode → Preferences → Locations → Derived Data → Click arrow → Delete folder
- Rebuild

### Camera not working
- Check Info.plist has NSCameraUsageDescription
- Check device permissions in Settings
- Camera only works on physical devices, not simulator

### Build errors
- Ensure deployment target is iOS 17.0+
- Ensure all Swift files are added to the target
- Check for any typos in file references

## What's Implemented

### ✅ Phase 1 - MVP (Software Only)

**Camera System:**
- AVFoundation-based camera manager
- HEIC, JPEG, and RAW (DNG) capture support
- Calibration system (focus, exposure, white balance locking)
- Zoom and torch controls
- Simulator mock data support

**Image Processing Pipeline:**
- Negative inversion (color and B&W)
- Orange mask estimation and removal
- Color channel normalization
- Tone correction
- User adjustments (exposure, warmth, contrast)
- Sharpening
- Export with quality tiers

**User Interface:**
- Scan Tab with camera preview and frame alignment
- Adjust Screen with sliders and Pro AI options (UI only)
- Gallery with grid layout, preview, multi-select
- Insights Tab (Pro) with histogram and exposure analysis
- Settings with preferences management

**Storage:**
- Local image storage
- Session/roll management
- Metadata tracking
- Thumbnail generation
- Export to Photos integration

**Monetization:**
- Free tier: watermark, ads, limited resolution
- Pro tier: StoreKit integration ($9.99)
- Feature gating system
- Restore purchases

**State Management:**
- Batch scan state machine
- Session workflow
- Error handling

### 🚧 Phase 2 - AI Processing (Future)
- Core ML models for color reconstruction
- Dust and scratch detection
- Enhanced histogram analysis

### 🚧 Phase 3 - Hardware Integration (Future)
- BLE dock communication
- Automatic roll scanning
- Frame detection

## File Structure

```
AnalogIntelligence/
├── App/
│   ├── ScanStateMachine.swift
│   ├── ScanState.swift
│   ├── ScanEvent.swift
│   └── ScanWorkflowManager.swift
├── Camera/
│   ├── CameraManager.swift
│   ├── CameraView.swift
│   ├── CameraPreviewView.swift
│   ├── CaptureMode.swift
│   └── CalibrationManager.swift
├── Processing/
│   ├── Pipeline/
│   │   ├── ImageProcessor.swift
│   │   ├── NegativeInverter.swift
│   │   ├── OrangeMaskEstimator.swift
│   │   ├── ColorCorrector.swift
│   │   ├── UserAdjustments.swift
│   │   └── ExportManager.swift
│   └── Metrics/
│       ├── HistogramAnalyzer.swift
│       ├── ExposureMetrics.swift
│       └── RollInsight.swift
├── Storage/
│   ├── StorageManager.swift
│   ├── ImageRepository.swift
│   ├── ScanSession.swift
│   ├── ScannedImage.swift
│   ├── UserPreferences.swift
│   ├── PreferencesManager.swift
│   └── FileSystemHelper.swift
├── Purchases/
│   ├── StoreKitManager.swift
│   ├── ProductIdentifiers.swift
│   ├── PurchaseState.swift
│   ├── ProFeatureGate.swift
│   ├── WatermarkRenderer.swift
│   ├── ResolutionLimiter.swift
│   ├── AdManager.swift
│   ├── BannerAdView.swift
│   └── ProUnlockView.swift
├── UI/
│   ├── Scan/
│   │   ├── ScanView.swift
│   │   ├── FrameAlignmentOverlay.swift
│   │   ├── CaptureButton.swift
│   │   └── Adjust/
│   │       ├── AdjustView.swift
│   │       ├── ExposureSlider.swift
│   │       ├── WarmthSlider.swift
│   │       ├── ContrastSlider.swift
│   │       └── AIOptionsPanel.swift
│   ├── Gallery/
│   │   ├── GalleryView.swift
│   │   ├── GalleryGridItem.swift
│   │   ├── ImageDetailView.swift
│   │   ├── MultiSelectToolbar.swift
│   │   └── ContactSheetGenerator.swift
│   ├── Insights/
│   │   └── InsightsView.swift
│   └── Common/
│       └── SharedViews.swift
├── AnalogIntelligenceApp.swift
├── RootView.swift
├── Info.plist
└── Assets.xcassets/
```

## Support

For issues or questions:
- Check SPEC.md for architecture details
- Check PRODUCT_UI_SPEC.md for UI/UX requirements
- Review TESTING.md for testing guidelines
