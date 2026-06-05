# TESTING.md — Analog Intelligence MVP Test Guide

## 1) Build and launch in iOS Simulator

1. Generate or refresh the Xcode project:

```bash
ruby scripts/generate_xcodeproj.rb
```

2. Open the project:

```bash
open AnalogIntelligence.xcodeproj
```

3. In Xcode:
- Select scheme: `AnalogIntelligence`
- Select a simulator device (for example iPhone 16)
- Press Run

4. Optional CLI build:

```bash
xcodebuild -project AnalogIntelligence.xcodeproj \
  -scheme AnalogIntelligence \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

## 2) What works in Simulator (no real camera required)

The app includes a simulator capture mode.

- `Scan` tab:
  - Start a roll session
  - Capture uses the bundled sample image
  - Adjust and save
  - Mark film advanced, then capture next frame
- `Gallery` tab:
  - View saved scans in grid
  - Open detail view
  - Multi-select, export (Share Sheet), delete
- `Insights` tab:
  - Locked for free tier, available after Pro unlock state

## 3) Real-device testing (recommended for camera)

1. Connect an iPhone.
2. Set signing team and bundle identifier in Xcode.
3. Run on device.
4. Accept permissions:
- Camera
- Photo Library Add

Device-specific validation:
- Calibration lock/unlock (focus, exposure, white balance)
- Real capture quality
- Save to Photos export path

## 4) MVP smoke test checklist

1. Launch app.
2. Open `Scan` tab.
3. Start a new roll session.
4. Capture a frame.
5. On `Adjust`, tweak exposure/warmth/contrast and tap `Done`.
6. Tap `Film Advanced - Ready Next Frame`.
7. Capture and save second frame.
8. Open `Gallery` and verify both images appear.
9. Long-press to select, export via Share Sheet.
10. Delete one image and verify it disappears.
11. Open `Insights`:
- Free tier: see lock screen
- Pro tier: see histogram/cards once unlocked

## 5) Notes

- Simulator camera uses sample data by design.
- Pro purchase flow is scaffolded; App Store product setup is still required in App Store Connect for real purchase testing.
