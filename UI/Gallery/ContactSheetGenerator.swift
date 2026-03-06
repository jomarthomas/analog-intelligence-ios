//
//  ContactSheetGenerator.swift
//  Analog Intelligence
//
//  Pro feature: Generate contact sheets from multiple images.
//

import SwiftUI
import UIKit
import AVFoundation

struct ContactSheetGenerator: View {
    let images: [ScannedImage]
    let isProUser: Bool

    @Environment(\.dismiss) private var dismiss
    @State private var selectedLayout: ContactSheetLayout = .grid3x3
    @State private var includeMetadata = true
    @State private var showingProUpgrade = false
    @State private var generatedItems: [Any] = []
    @State private var showingShareSheet = false
    @State private var isGenerating = false

    private let storageManager = StorageManager.shared

    var body: some View {
        NavigationView {
            if !isProUser {
                ProFeatureLock(
                    featureName: "Contact Sheet Generator",
                    featureDescription: "Create professional contact sheets from your scanned negatives",
                    onUpgrade: { showingProUpgrade = true }
                )
            } else {
                Form {
                    Section {
                        Picker("Layout", selection: $selectedLayout) {
                            ForEach(ContactSheetLayout.allCases) { layout in
                                Text(layout.displayName).tag(layout)
                            }
                        }

                        Toggle("Include Metadata", isOn: $includeMetadata)
                    } header: {
                        Text("Contact Sheet Options")
                    }

                    Section {
                        Text("\(images.count) images selected")
                            .foregroundColor(.secondary)

                        Text("Output: JPEG")
                            .foregroundColor(.secondary)
                    } header: {
                        Text("Details")
                    }

                    Section {
                        Button(action: generateContactSheet) {
                            HStack {
                                if isGenerating {
                                    ProgressView()
                                } else {
                                    Image(systemName: "doc.richtext")
                                }
                                Text("Generate Contact Sheet")
                                Spacer()
                                Image(systemName: "sparkles")
                            }
                        }
                        .disabled(images.isEmpty || isGenerating)
                    }
                }
                .navigationTitle("Contact Sheet")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button("Cancel") { dismiss() }
                    }
                }
            }
        }
        .sheet(isPresented: $showingProUpgrade) {
            ProUpgradeView()
        }
        .sheet(isPresented: $showingShareSheet) {
            ShareSheet(items: generatedItems)
        }
    }

    private func generateContactSheet() {
        isGenerating = true

        Task {
            let uiImages = await loadImagesForContactSheet()
            guard let sheet = renderContactSheet(from: uiImages) else {
                await MainActor.run { isGenerating = false }
                return
            }

            let url = FileSystemHelper.cachesDirectory.appendingPathComponent("contact_sheet_\(UUID().uuidString).jpg")
            if let data = sheet.jpegData(compressionQuality: 0.95) {
                try? data.write(to: url)
                await MainActor.run {
                    generatedItems = [url]
                    showingShareSheet = true
                    isGenerating = false
                }
            } else {
                await MainActor.run { isGenerating = false }
            }
        }
    }

    private func loadImagesForContactSheet() async -> [UIImage] {
        await withTaskGroup(of: UIImage?.self, returning: [UIImage].self) { group in
            for scanned in images {
                group.addTask {
                    if scanned.isProcessed {
                        return try? await storageManager.loadProcessedImage(for: scanned.id)
                    }
                    return try? await storageManager.loadOriginalImage(for: scanned.id)
                }
            }

            var loaded: [UIImage] = []
            for await image in group {
                if let image {
                    loaded.append(image)
                }
            }
            return loaded
        }
    }

    private func renderContactSheet(from uiImages: [UIImage]) -> UIImage? {
        guard !uiImages.isEmpty else { return nil }

        let pageSize = CGSize(width: 2480, height: 3508)
        let renderer = UIGraphicsImageRenderer(size: pageSize)

        return renderer.image { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: pageSize))

            let cols = selectedLayout.columns
            let rows = selectedLayout.rows
            let margin: CGFloat = 80
            let headerHeight: CGFloat = includeMetadata ? 220 : 120
            let spacing: CGFloat = 24

            let availableWidth = pageSize.width - (margin * 2) - CGFloat(cols - 1) * spacing
            let availableHeight = pageSize.height - headerHeight - margin - CGFloat(rows - 1) * spacing
            let cellWidth = availableWidth / CGFloat(cols)
            let cellHeight = availableHeight / CGFloat(rows)

            let title = "Analog Intelligence Contact Sheet"
            let paragraph = NSMutableParagraphStyle()
            paragraph.alignment = .center
            title.draw(
                in: CGRect(x: margin, y: 40, width: pageSize.width - margin * 2, height: 42),
                withAttributes: [
                    .font: UIFont.boldSystemFont(ofSize: 34),
                    .foregroundColor: UIColor.black,
                    .paragraphStyle: paragraph
                ]
            )

            if includeMetadata {
                let detail = "Frames: \(uiImages.count)    Layout: \(selectedLayout.displayName)    Generated: \(Date().formatted(date: .abbreviated, time: .shortened))"
                detail.draw(
                    in: CGRect(x: margin, y: 90, width: pageSize.width - margin * 2, height: 28),
                    withAttributes: [
                        .font: UIFont.systemFont(ofSize: 20),
                        .foregroundColor: UIColor.darkGray,
                        .paragraphStyle: paragraph
                    ]
                )
            }

            for (index, image) in uiImages.prefix(cols * rows).enumerated() {
                let row = index / cols
                let col = index % cols

                let x = margin + CGFloat(col) * (cellWidth + spacing)
                let y = headerHeight + CGFloat(row) * (cellHeight + spacing)
                let rect = CGRect(x: x, y: y, width: cellWidth, height: cellHeight)

                let fittedRect = AVMakeRect(aspectRatio: image.size, insideRect: rect)
                image.draw(in: fittedRect)

                UIColor.lightGray.setStroke()
                context.stroke(rect)
            }
        }
    }
}

enum ContactSheetLayout: String, CaseIterable, Identifiable {
    case grid2x2 = "2x2"
    case grid3x3 = "3x3"
    case grid4x4 = "4x4"
    case grid5x5 = "5x5"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .grid2x2: return "2×2 Grid"
        case .grid3x3: return "3×3 Grid"
        case .grid4x4: return "4×4 Grid"
        case .grid5x5: return "5×5 Grid"
        }
    }

    var columns: Int {
        switch self {
        case .grid2x2: return 2
        case .grid3x3: return 3
        case .grid4x4: return 4
        case .grid5x5: return 5
        }
    }

    var rows: Int { columns }
}

#Preview {
    ContactSheetGenerator(images: [], isProUser: true)
}
