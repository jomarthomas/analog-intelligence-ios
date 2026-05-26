//
//  GalleryView.swift
//  AnalogIntelligence
//
//  Created by Analog Intelligence
//

import SwiftUI

struct GalleryView: View {
    @StateObject private var storageManager = StorageManager.shared
    @State private var selectedImages: Set<UUID> = []
    @State private var showingImageDetail = false
    @State private var selectedImage: ScannedImage?

    let columns = [
        GridItem(.adaptive(minimum: 100))
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                if storageManager.images.isEmpty {
                    VStack(spacing: 20) {
                        Image(systemName: "photo.on.rectangle")
                            .font(.system(size: 60))
                            .foregroundColor(.gray)
                        Text("No scanned images yet")
                            .font(.headline)
                            .foregroundColor(.gray)
                        Text("Go to the Scan tab to capture your first negative")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                    .padding(.top, 100)
                } else {
                    LazyVGrid(columns: columns, spacing: 10) {
                        ForEach(storageManager.images) { image in
                            GalleryImageCell(image: image)
                                .onTapGesture {
                                    selectedImage = image
                                    showingImageDetail = true
                                }
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Gallery")
            .toolbar {
                if !storageManager.images.isEmpty {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Menu {
                            Button(action: { exportSelected() }) {
                                Label("Export", systemImage: "square.and.arrow.up")
                            }
                            Button(role: .destructive, action: { deleteSelected() }) {
                                Label("Delete", systemImage: "trash")
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                    }
                }
            }
            .sheet(isPresented: $showingImageDetail) {
                if let image = selectedImage {
                    ImageDetailView(image: image)
                }
            }
        }
    }

    private func exportSelected() {
        // Export functionality
        // Will be implemented with UIActivityViewController
    }

    private func deleteSelected() {
        // Delete functionality
        // Will be implemented with StorageManager
    }
}

#Preview {
    GalleryView()
}
