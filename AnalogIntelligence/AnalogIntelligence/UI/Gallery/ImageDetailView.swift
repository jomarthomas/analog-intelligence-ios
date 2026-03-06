//
//  ImageDetailView.swift
//  AnalogIntelligence
//
//  Created by Analog Intelligence
//

import SwiftUI

struct ImageDetailView: View {
    let image: ScannedImage
    @Environment(\.dismiss) private var dismiss
    @State private var showingShareSheet = false

    var body: some View {
        NavigationStack {
            VStack {
                if let uiImage = image.processedImage {
                    Image(uiImage: uiImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                } else {
                    Rectangle()
                        .fill(Color.gray.opacity(0.3))
                        .overlay(
                            Image(systemName: "photo")
                                .font(.largeTitle)
                                .foregroundColor(.gray)
                        )
                }

                Spacer()

                // Image metadata
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Date:")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                        Text(image.captureDate, style: .date)
                            .font(.subheadline)
                    }
                }
                .padding()
            }
            .navigationTitle("Image Detail")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingShareSheet = true }) {
                        Image(systemName: "square.and.arrow.up")
                    }
                }
            }
            .sheet(isPresented: $showingShareSheet) {
                if let uiImage = image.processedImage {
                    ShareSheet(items: [uiImage])
                }
            }
        }
    }
}
