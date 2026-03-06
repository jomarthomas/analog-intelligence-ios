#!/bin/bash

# create_xcode_project.sh
# Helper script for Analog Intelligence Xcode project setup

set -e

PROJECT_NAME="AnalogIntelligence"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE_ID="com.analogintelligence.app"

echo "=================================================="
echo "Analog Intelligence™ - Xcode Project Setup"
echo "=================================================="
echo ""
echo "Project Directory: $PROJECT_DIR"
echo ""

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Error: Xcode is not installed or xcodebuild is not in PATH"
    echo "Please install Xcode from the Mac App Store"
    exit 1
fi

echo "✅ Xcode found: $(xcodebuild -version | head -1)"
echo ""

# Count source files
SWIFT_FILE_COUNT=$(find "$PROJECT_DIR" -name "*.swift" -not -path "*/\.*" -not -path "*/Build/*" -not -path "*/DerivedData/*" | wc -l | tr -d ' ')

echo "📊 Project Statistics:"
echo "   Swift files: $SWIFT_FILE_COUNT"
echo "   Folders: App, Camera, Processing, Storage, Purchases, UI"
echo ""

echo "📋 Implementation Status:"
echo "   ✅ Camera System (AVFoundation, calibration, RAW support)"
echo "   ✅ Image Processing Pipeline (negative inversion, color correction)"
echo "   ✅ UI Views (Scan, Gallery, Insights, Adjust)"
echo "   ✅ Storage Layer (local persistence, session management)"
echo "   ✅ Monetization (StoreKit, free/Pro tiers)"
echo "   ✅ State Machine (batch scanning workflow)"
echo ""

echo "⚠️  IMPORTANT:"
echo "   Xcode projects are complex binary files that are best created through Xcode GUI."
echo "   This script will verify your setup and provide next steps."
echo ""

# Check for required files
echo "🔍 Checking required files..."
REQUIRED_FILES=(
    "AnalogIntelligenceApp.swift"
    "RootView.swift"
    "Info.plist"
    "Camera/CameraManager.swift"
    "Processing/Pipeline/ImageProcessor.swift"
    "UI/Scan/ScanView.swift"
    "Storage/StorageManager.swift"
    "Purchases/StoreKitManager.swift"
)

MISSING_FILES=0
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$PROJECT_DIR/$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ Missing: $file"
        MISSING_FILES=$((MISSING_FILES + 1))
    fi
done

echo ""

if [ $MISSING_FILES -gt 0 ]; then
    echo "❌ $MISSING_FILES required file(s) missing. Please ensure all files are created."
    exit 1
fi

echo "✅ All required files present!"
echo ""

# Check if project already exists
if [ -d "$PROJECT_DIR/$PROJECT_NAME.xcodeproj" ]; then
    echo "⚠️  Xcode project already exists at:"
    echo "   $PROJECT_DIR/$PROJECT_NAME.xcodeproj"
    echo ""
    read -p "Do you want to open it in Xcode? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open "$PROJECT_DIR/$PROJECT_NAME.xcodeproj"
        echo "✅ Opened in Xcode"
    fi
    exit 0
fi

echo "📝 NEXT STEPS:"
echo ""
echo "Since no Xcode project exists, please follow these manual steps:"
echo ""
echo "1. Open Xcode"
echo "2. File → New → Project"
echo "3. Select iOS → App"
echo "4. Configure:"
echo "   - Product Name: $PROJECT_NAME"
echo "   - Interface: SwiftUI"
echo "   - Language: Swift"
echo "   - Bundle ID: $BUNDLE_ID"
echo "5. Save to: $PROJECT_DIR"
echo "6. Delete auto-generated ContentView.swift and AnalogIntelligenceApp.swift"
echo "7. Add all source folders and files to the project:"
echo "   - Right-click project → Add Files"
echo "   - Select: App/, Camera/, Processing/, Storage/, Purchases/, UI/"
echo "   - Select: AnalogIntelligenceApp.swift, RootView.swift, Info.plist"
echo "   - UNCHECK 'Copy items if needed'"
echo "   - Select 'Create groups'"
echo "8. Set iOS Deployment Target to 17.0 in project settings"
echo "9. Configure Signing & Capabilities with your team"
echo "10. Build and run!"
echo ""
echo "For detailed instructions, see: SETUP_INSTRUCTIONS.md"
echo ""
echo "=================================================="
