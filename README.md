# analog-intelligence-ios

Analog Intelligence™ is an iOS app for scanning film negatives with an iPhone camera, converting negatives to positives, adjusting color/tone, and exporting scans.

## Implemented MVP Features

- Scan tab with live camera preview, frame overlay, calibration lock, and capture flow
- Negative-to-positive preprocessing in the adjust workflow
- Manual adjustments: exposure, warmth, contrast
- Local storage of originals, processed images, thumbnails, and session metadata
- Gallery with grid, detail view, multi-select, export, delete
- Export options: Share Sheet and Photos Library
- Pro gating for Insights and Contact Sheet generation
- Basic StoreKit 2 purchase/restore scaffolding

## Project Files

- App spec: `SPEC.md`
- UI/UX spec: `PRODUCT_UI_SPEC.md`
- Setup guide: `XCODE_SETUP.md`
- Testing guide: `TESTING.md`
- Xcode project generator: `scripts/generate_xcodeproj.rb`

## Open in Xcode

1. Generate (or refresh) the project:
   ```bash
   ruby scripts/generate_xcodeproj.rb
   ```
2. Open:
   ```bash
   open AnalogIntelligence.xcodeproj
   ```

## CLI Build (Simulator)

```bash
xcodebuild -project AnalogIntelligence.xcodeproj \
  -scheme AnalogIntelligence \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```
