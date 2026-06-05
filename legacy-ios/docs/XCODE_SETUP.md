# XCODE_SETUP.md --- Project Setup Guide

## Requirements

-   macOS
-   Xcode latest version
-   Apple ID
-   iPhone device recommended for camera testing

------------------------------------------------------------------------

## Create Project

1.  Open Xcode
2.  File → New → Project
3.  Select iOS App
4.  Product Name: AnalogIntelligence
5.  Interface: SwiftUI
6.  Language: Swift
7.  Deployment Target: iOS 17

Alternative for this repository:

- Generate the included project from source tree:

```bash
ruby scripts/generate_xcodeproj.rb
open AnalogIntelligence.xcodeproj
```

------------------------------------------------------------------------

## Add Permissions

In Info.plist:

Camera usage description: NSCameraUsageDescription

Photo library add permission: NSPhotoLibraryAddUsageDescription

------------------------------------------------------------------------

## Run App

Select iPhone simulator and press Run.

Note: Camera works only on real devices.

CLI build:

```bash
xcodebuild -project AnalogIntelligence.xcodeproj \
  -scheme AnalogIntelligence \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

------------------------------------------------------------------------

## Development Workflow

1.  Implement camera preview
2.  Capture HEIC image
3.  Implement inversion pipeline
4.  Add gallery view
5.  Add export functionality
6.  Add Pro unlock

------------------------------------------------------------------------

## Recommended Repo Structure

Project Root: SPEC.md PRODUCT_UI_SPEC.md XCODE_SETUP.md
AnalogIntelligence.xcodeproj

------------------------------------------------------------------------

Use SPEC.md as the authoritative architecture guide.
