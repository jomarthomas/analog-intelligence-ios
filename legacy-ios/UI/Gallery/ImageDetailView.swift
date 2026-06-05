//
//  ImageDetailView.swift
//  Analog Intelligence
//
//  Full-screen preview of a scanned image with metadata.
//

import SwiftUI

struct ImageDetailView: View {
    let image: ScannedImage

    @State private var displayedImage: UIImage?
    @State private var scale: CGFloat = 1.0
    @State private var lastScale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    @State private var showingShareSheet = false
    @State private var shareItems: [Any] = []

    @Environment(\.dismiss) private var dismiss
    private let storageManager = StorageManager.shared

    var body: some View {
        NavigationView {
            ZStack {
                Color.black
                    .ignoresSafeArea()

                Group {
                    if let displayedImage {
                        Image(uiImage: displayedImage)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .scaleEffect(scale)
                            .offset(offset)
                            .gesture(
                                MagnificationGesture()
                                    .onChanged { value in
                                        let delta = value / lastScale
                                        lastScale = value
                                        scale = min(max(scale * delta, 1.0), 5.0)
                                    }
                                    .onEnded { _ in
                                        lastScale = 1.0
                                        if scale <= 1.0 {
                                            withAnimation(.spring()) {
                                                scale = 1.0
                                                offset = .zero
                                            }
                                        }
                                    }
                            )
                            .gesture(
                                DragGesture()
                                    .onChanged { value in
                                        if scale > 1.0 {
                                            offset = CGSize(
                                                width: lastOffset.width + value.translation.width,
                                                height: lastOffset.height + value.translation.height
                                            )
                                        }
                                    }
                                    .onEnded { _ in
                                        lastOffset = offset
                                    }
                            )
                            .onTapGesture(count: 2) {
                                withAnimation(.spring()) {
                                    if scale > 1.0 {
                                        scale = 1.0
                                        offset = .zero
                                        lastOffset = .zero
                                    } else {
                                        scale = 2.0
                                    }
                                }
                            }
                    } else {
                        ProgressView()
                            .tint(.white)
                    }
                }

                VStack {
                    Spacer()

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Scanned: \(formattedDate)")
                            .font(.caption)
                            .foregroundColor(.white)

                        HStack(spacing: 16) {
                            MetadataItem(icon: "sun.max", label: "Exposure", value: String(format: "%.2f", image.adjustments.exposure))
                            MetadataItem(icon: "thermometer", label: "Warmth", value: String(format: "%.2f", image.adjustments.warmth))
                            MetadataItem(icon: "circle.lefthalf.filled", label: "Contrast", value: String(format: "%.2f", image.adjustments.contrast))
                        }
                    }
                    .padding()
                    .background(.ultraThinMaterial)
                    .cornerRadius(12)
                    .padding()
                }
                .opacity(scale > 1.0 ? 0 : 1)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(.white)
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        exportImage()
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .foregroundColor(.white)
                    }
                }
            }
            .preferredColorScheme(.dark)
        }
        .task {
            await loadImage()
        }
        .sheet(isPresented: $showingShareSheet) {
            ShareSheet(items: shareItems)
        }
    }

    private var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.timeStyle = .short
        return formatter.string(from: image.captureDate)
    }

    private func loadImage() async {
        if image.isProcessed, let processed = try? await storageManager.loadProcessedImage(for: image.id) {
            displayedImage = processed
            return
        }

        displayedImage = try? await storageManager.loadOriginalImage(for: image.id)
    }

    private func exportImage() {
        Task {
            if let url = try? await storageManager.prepareForSharing(imageId: image.id) {
                shareItems = [url]
                showingShareSheet = true
            }
        }
    }
}

struct MetadataItem: View {
    let icon: String
    let label: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundColor(.gray)

            Text(value)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.white)

            Text(label)
                .font(.caption2)
                .foregroundColor(.gray)
        }
    }
}

// UIKit ShareSheet wrapper
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
