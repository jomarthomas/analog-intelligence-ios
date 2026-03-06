//
//  AdjustView.swift
//  Analog Intelligence
//
//  Post-capture adjustment screen with exposure, warmth, and contrast controls.
//

import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins

struct AdjustView: View {
    let image: UIImage
    let isProUser: Bool
    let onDone: (Bool) -> Void

    @State private var exposure: Double = 0.0
    @State private var warmth: Double = 0.0
    @State private var contrast: Double = 1.0
    @State private var aiColorEnabled = false
    @State private var aiDustRemovalEnabled = false
    @State private var showingProUpgrade = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var baseImage: UIImage?
    @State private var isPreparingBaseImage = true

    @Environment(\.dismiss) private var dismiss

    private let storageManager = StorageManager.shared
    private let preferencesManager = PreferencesManager.shared
    private let imageProcessor = ImageProcessor()
    private let ciContext = CIContext()

    var body: some View {
        NavigationView {
            ZStack {
                Color.black
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    adjustedImageView
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .clipped()
                        .overlay {
                            if isPreparingBaseImage {
                                ZStack {
                                    Color.black.opacity(0.35)
                                    VStack(spacing: 12) {
                                        ProgressView()
                                        Text("Converting Negative...")
                                            .font(.caption)
                                            .foregroundColor(.white.opacity(0.8))
                                    }
                                }
                            }
                        }

                    VStack(spacing: 20) {
                        VStack(spacing: 16) {
                            ExposureSlider(value: $exposure)
                            WarmthSlider(value: $warmth)
                            ContrastSlider(value: $contrast)
                        }
                        .padding(AnalogTheme.paddingMedium)
                        .cardStyle()
                        .padding(.horizontal, AnalogTheme.paddingMedium)
                        .padding(.top, 20)

                        if isProUser {
                            AIOptionsPanel(
                                aiColorEnabled: $aiColorEnabled,
                                aiDustRemovalEnabled: $aiDustRemovalEnabled
                            )
                            .cardStyle()
                            .padding(.horizontal, AnalogTheme.paddingMedium)
                        } else {
                            Button {
                                showingProUpgrade = true
                            } label: {
                                HStack {
                                    Image(systemName: "sparkles")
                                    Text("Unlock AI Features")
                                    Spacer()
                                    Image(systemName: "lock.fill")
                                }
                                .font(AnalogTheme.headline())
                                .foregroundColor(.white)
                                .padding()
                                .background(
                                    LinearGradient(
                                        colors: [AnalogTheme.primaryOrange.opacity(0.8), AnalogTheme.primaryOrange],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .cornerRadius(AnalogTheme.cornerRadiusMedium)
                            }
                            .padding(.horizontal, AnalogTheme.paddingMedium)
                        }
                    }
                    .padding(.bottom, 20)
                    .background(AnalogTheme.backgroundDark)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                        onDone(false)
                    }
                    .foregroundColor(.white)
                }

                ToolbarItem(placement: .principal) {
                    Text("Adjust")
                        .font(.headline)
                        .foregroundColor(.white)
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        saveImage()
                    } label: {
                        if isSaving {
                            ProgressView()
                                .tint(.blue)
                        } else {
                            Text("Done")
                                .fontWeight(.bold)
                                .foregroundColor(.blue)
                        }
                    }
                    .disabled(isSaving)
                }
            }
            .preferredColorScheme(.dark)
        }
        .sheet(isPresented: $showingProUpgrade) {
            ProUpgradeView()
        }
        .task {
            await prepareBaseImage()
        }
        .alert("Save Failed", isPresented: Binding(get: {
            errorMessage != nil
        }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK", role: .cancel) { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "Unable to save image")
        }
    }

    private var adjustedImageView: some View {
        Image(uiImage: baseImage ?? image)
            .resizable()
            .aspectRatio(contentMode: .fit)
            .brightness(exposure)
            .colorMultiply(warmthColor)
            .contrast(contrast)
    }

    private var warmthColor: Color {
        if warmth > 0 {
            return Color(red: 1.0, green: 1.0 - warmth * 0.3, blue: 1.0 - warmth * 0.5)
        } else {
            return Color(red: 1.0 + warmth * 0.5, green: 1.0 + warmth * 0.3, blue: 1.0)
        }
    }

    private func saveImage() {
        isSaving = true

        Task {
            do {
                let processed = makeProcessedUIImage() ?? image

                let metadata = ImageMetadata(
                    format: .jpeg,
                    originalWidth: Int((baseImage ?? image).size.width),
                    originalHeight: Int((baseImage ?? image).size.height)
                )

                let adjustments = ImageAdjustments(
                    exposure: Float(exposure),
                    warmth: Float(warmth),
                    contrast: Float(contrast),
                    aiColorReconstruction: isProUser && aiColorEnabled,
                    aiDustRemoval: isProUser && aiDustRemovalEnabled
                )

                let saved = try await storageManager.saveScannedImage(
                    baseImage ?? image,
                    format: .jpeg,
                    metadata: metadata,
                    adjustments: adjustments
                )

                try await storageManager.saveProcessedImage(processed, for: saved.id, format: .jpeg)

                if preferencesManager.preferences.saveToPhotosAfterProcessing {
                    try await storageManager.exportToPhotos(imageIds: [saved.id])
                }

                await MainActor.run {
                    isSaving = false
                    dismiss()
                    onDone(true)
                }
            } catch {
                await MainActor.run {
                    isSaving = false
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func makeProcessedUIImage() -> UIImage? {
        guard let inputCI = CIImage(image: baseImage ?? image) else { return nil }

        let exposureFilter = CIFilter.exposureAdjust()
        exposureFilter.inputImage = inputCI
        exposureFilter.ev = Float(exposure)

        let temperatureFilter = CIFilter.temperatureAndTint()
        temperatureFilter.inputImage = exposureFilter.outputImage
        temperatureFilter.neutral = CIVector(x: 6500 - CGFloat(warmth * 1200), y: 0)
        temperatureFilter.targetNeutral = CIVector(x: 6500, y: 0)

        let contrastFilter = CIFilter.colorControls()
        contrastFilter.inputImage = temperatureFilter.outputImage
        contrastFilter.contrast = Float(contrast)

        guard let output = contrastFilter.outputImage,
              let cgImage = ciContext.createCGImage(output, from: output.extent) else {
            return nil
        }

        return UIImage(cgImage: cgImage)
    }

    private func prepareBaseImage() async {
        guard let inputCIImage = CIImage(image: image) else {
            await MainActor.run {
                baseImage = image
                isPreparingBaseImage = false
            }
            return
        }

        do {
            let config = ImageProcessor.ProcessingConfig(filmType: .colorNegative)
            let processedCIImage = try await imageProcessor.processNegative(
                inputImage: inputCIImage,
                config: config
            )

            if let cgImage = ciContext.createCGImage(processedCIImage, from: processedCIImage.extent) {
                await MainActor.run {
                    baseImage = UIImage(cgImage: cgImage)
                    isPreparingBaseImage = false
                }
            } else {
                await MainActor.run {
                    baseImage = image
                    isPreparingBaseImage = false
                }
            }
        } catch {
            await MainActor.run {
                baseImage = image
                isPreparingBaseImage = false
            }
        }
    }
}

#Preview {
    AdjustView(
        image: UIImage(systemName: "photo")!,
        isProUser: true,
        onDone: { _ in }
    )
}
