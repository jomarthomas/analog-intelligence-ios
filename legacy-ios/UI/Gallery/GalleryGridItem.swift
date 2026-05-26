//
//  GalleryGridItem.swift
//  Analog Intelligence
//
//  Individual thumbnail item in the gallery grid.
//

import SwiftUI

struct GalleryGridItem: View {
    let image: ScannedImage
    let isSelected: Bool
    let isSelectionMode: Bool

    @State private var thumbnail: UIImage?
    private let storageManager = StorageManager.shared

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .topTrailing) {
                Group {
                    if let thumbnail {
                        Image(uiImage: thumbnail)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } else {
                        Color(.secondarySystemFill)
                            .overlay {
                                ProgressView()
                            }
                    }
                }
                .frame(width: geometry.size.width, height: geometry.size.width)
                .clipped()
                .overlay(isSelected ? Color.blue.opacity(0.3) : Color.clear)

                if isSelectionMode {
                    ZStack {
                        Circle()
                            .fill(isSelected ? Color.blue : Color.white.opacity(0.7))
                            .frame(width: 24, height: 24)

                        if isSelected {
                            Image(systemName: "checkmark")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }
                    .padding(8)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .task {
            await loadThumbnail()
        }
        .accessibilityLabel("Scanned image from \(formattedDate)")
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    private var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: image.captureDate)
    }

    private func loadThumbnail() async {
        if let loaded = try? await storageManager.loadThumbnail(for: image.id) {
            thumbnail = loaded
            return
        }

        if let loaded = try? await storageManager.loadProcessedImage(for: image.id) {
            thumbnail = loaded
            return
        }

        thumbnail = try? await storageManager.loadOriginalImage(for: image.id)
    }
}
