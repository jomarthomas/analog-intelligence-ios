//
//  GalleryView.swift
//  Analog Intelligence
//
//  Grid layout displaying all scanned images with multi-select capabilities.
//

import SwiftUI

struct GalleryView: View {
    @StateObject private var purchaseState = PurchaseState.shared

    @State private var images: [ScannedImage] = []
    @State private var selectedImages: Set<UUID> = []
    @State private var isSelectionMode = false
    @State private var selectedImageForDetail: ScannedImage?
    @State private var showingContactSheet = false

    @State private var shareItems: [Any] = []
    @State private var showingShareSheet = false
    @State private var shareErrorMessage: String?
    @State private var showingExportOptions = false

    private let storageManager = StorageManager.shared

    private let columns = [
        GridItem(.flexible(), spacing: 2),
        GridItem(.flexible(), spacing: 2),
        GridItem(.flexible(), spacing: 2)
    ]

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                ZStack {
                    AnalogTheme.backgroundDark
                        .ignoresSafeArea()

                    if images.isEmpty {
                        emptyStateView
                    } else {
                        ScrollView {
                            LazyVGrid(columns: columns, spacing: 2) {
                                ForEach(images) { image in
                                    GalleryGridItem(
                                        image: image,
                                        isSelected: selectedImages.contains(image.id),
                                        isSelectionMode: isSelectionMode
                                    )
                                    .onTapGesture {
                                        handleImageTap(image)
                                    }
                                    .onLongPressGesture {
                                        enterSelectionMode(with: image)
                                    }
                                }
                            }
                            .padding(.bottom, isSelectionMode ? 60 : 0)
                        }
                    }
                }

                // Banner ad for free tier users
                // TODO: Uncomment after adding Google Mobile Ads SDK
                // if !purchaseState.isPro {
                //     BannerAdView()
                // }
            }
            .navigationTitle("Gallery")
            .navigationBarTitleDisplayMode(.inline)
            .preferredColorScheme(.dark)
            .toolbar {
                if !images.isEmpty {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Menu {
                            Button {
                                isSelectionMode.toggle()
                                if !isSelectionMode {
                                    selectedImages.removeAll()
                                }
                            } label: {
                                Label(isSelectionMode ? "Cancel Selection" : "Select", systemImage: "checkmark.circle")
                            }

                            if purchaseState.isPro {
                                Button {
                                    showingContactSheet = true
                                } label: {
                                    Label("Generate Contact Sheet", systemImage: "square.grid.3x3")
                                }
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                    }
                }
            }
            .overlay(alignment: .bottom) {
                if isSelectionMode && !selectedImages.isEmpty {
                    MultiSelectToolbar(
                        selectedCount: selectedImages.count,
                        onExport: exportSelected,
                        onDelete: deleteSelected
                    )
                }
            }
            .sheet(item: $selectedImageForDetail) { image in
                ImageDetailView(image: image)
            }
            .sheet(isPresented: $showingContactSheet) {
                ContactSheetGenerator(images: selectedImagesList, isProUser: purchaseState.isPro)
            }
            .sheet(isPresented: $showingShareSheet) {
                ShareSheet(items: shareItems)
            }
            .confirmationDialog(
                "Export Selected Images",
                isPresented: $showingExportOptions,
                titleVisibility: .visible
            ) {
                Button("Share Sheet") {
                    shareSelected()
                }
                Button("Save to Photos") {
                    saveSelectedToPhotos()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Choose how you want to export \(selectedImages.count) images.")
            }
            .alert("Export Failed", isPresented: Binding(get: {
                shareErrorMessage != nil
            }, set: { if !$0 { shareErrorMessage = nil } })) {
                Button("OK", role: .cancel) { shareErrorMessage = nil }
            } message: {
                Text(shareErrorMessage ?? "Unable to export selected images.")
            }
        }
        .onAppear {
            loadImages()
        }
    }

    private var selectedImagesList: [ScannedImage] {
        images.filter { selectedImages.contains($0.id) }
    }

    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 80))
                .foregroundColor(.gray)

            Text("No Scanned Images")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Captured negatives will appear here")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }

    private func handleImageTap(_ image: ScannedImage) {
        if isSelectionMode {
            if selectedImages.contains(image.id) {
                selectedImages.remove(image.id)
            } else {
                selectedImages.insert(image.id)
            }
        } else {
            selectedImageForDetail = image
        }
    }

    private func enterSelectionMode(with image: ScannedImage) {
        isSelectionMode = true
        selectedImages.insert(image.id)
    }

    private func exportSelected() {
        showingExportOptions = true
    }

    private func shareSelected() {
        let ids = Array(selectedImages)
        Task {
            do {
                let urls = try await withThrowingTaskGroup(of: URL.self, returning: [URL].self) { group in
                    for id in ids {
                        group.addTask {
                            try await storageManager.prepareForSharing(imageId: id)
                        }
                    }

                    var results: [URL] = []
                    for try await url in group {
                        results.append(url)
                    }
                    return results
                }

                shareItems = urls
                showingShareSheet = true
                isSelectionMode = false
                selectedImages.removeAll()
            } catch {
                shareErrorMessage = error.localizedDescription
            }
        }
    }

    private func saveSelectedToPhotos() {
        let ids = Array(selectedImages)
        Task {
            do {
                try await storageManager.exportToPhotos(imageIds: ids)
                await MainActor.run {
                    isSelectionMode = false
                    selectedImages.removeAll()
                }
            } catch {
                await MainActor.run {
                    shareErrorMessage = error.localizedDescription
                }
            }
        }
    }

    private func deleteSelected() {
        let ids = Array(selectedImages)
        Task {
            do {
                try await storageManager.deleteImages(ids: ids)
                await MainActor.run {
                    selectedImages.removeAll()
                    isSelectionMode = false
                    loadImages()
                }
            } catch {
                await MainActor.run {
                    shareErrorMessage = error.localizedDescription
                }
            }
        }
    }

    private func loadImages() {
        images = storageManager.allImages()
    }
}

#Preview {
    GalleryView()
}
