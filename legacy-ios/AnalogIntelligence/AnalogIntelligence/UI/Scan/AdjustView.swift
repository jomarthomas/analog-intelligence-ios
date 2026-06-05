//
//  AdjustView.swift
//  AnalogIntelligence
//
//  Created by Analog Intelligence
//

import SwiftUI

struct AdjustView: View {
    let image: UIImage
    @Environment(\.dismiss) private var dismiss
    @State private var exposure: Double = 0
    @State private var warmth: Double = 0
    @State private var contrast: Double = 0
    @State private var processedImage: UIImage?

    var body: some View {
        NavigationStack {
            VStack {
                // Image preview
                if let processedImage = processedImage {
                    Image(uiImage: processedImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxHeight: 400)
                } else {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxHeight: 400)
                }

                Spacer()

                // Controls
                VStack(spacing: 20) {
                    // Exposure slider
                    VStack(alignment: .leading) {
                        Text("Exposure")
                            .font(.headline)
                        Slider(value: $exposure, in: -2...2)
                            .onChange(of: exposure) { _, _ in
                                applyAdjustments()
                            }
                    }

                    // Warmth slider
                    VStack(alignment: .leading) {
                        Text("Warmth")
                            .font(.headline)
                        Slider(value: $warmth, in: -1...1)
                            .onChange(of: warmth) { _, _ in
                                applyAdjustments()
                            }
                    }

                    // Contrast slider
                    VStack(alignment: .leading) {
                        Text("Contrast")
                            .font(.headline)
                        Slider(value: $contrast, in: -1...1)
                            .onChange(of: contrast) { _, _ in
                                applyAdjustments()
                            }
                    }
                }
                .padding()

                Spacer()
            }
            .navigationTitle("Adjust")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        saveImage()
                        dismiss()
                    }
                }
            }
        }
        .onAppear {
            processedImage = image
        }
    }

    private func applyAdjustments() {
        // Process image with adjustments
        // This will be implemented with Core Image filters
        let processor = ImageProcessor()
        processedImage = processor.applyAdjustments(
            to: image,
            exposure: exposure,
            warmth: warmth,
            contrast: contrast
        )
    }

    private func saveImage() {
        // Save the processed image to storage
        guard let imageToSave = processedImage ?? image else { return }
        StorageManager.shared.saveImage(imageToSave)
    }
}

#Preview {
    AdjustView(image: UIImage(systemName: "photo")!)
}
