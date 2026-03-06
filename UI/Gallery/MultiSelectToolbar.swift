//
//  MultiSelectToolbar.swift
//  Analog Intelligence
//
//  Toolbar for batch operations on selected images (export, delete).
//

import SwiftUI

struct MultiSelectToolbar: View {
    let selectedCount: Int
    let onExport: () -> Void
    let onDelete: () -> Void

    @State private var showingDeleteConfirmation = false

    var body: some View {
        HStack(spacing: 0) {
            // Selection count
            HStack {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.blue)
                Text("\(selectedCount) Selected")
                    .font(.headline)
            }
            .padding(.leading)

            Spacer()

            // Export button
            Button(action: onExport) {
                HStack {
                    Image(systemName: "square.and.arrow.up")
                    Text("Export")
                }
                .font(.subheadline)
                .foregroundColor(.blue)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color.blue.opacity(0.1))
                .cornerRadius(8)
            }
            .padding(.trailing, 8)

            // Delete button
            Button(action: {
                showingDeleteConfirmation = true
            }) {
                HStack {
                    Image(systemName: "trash")
                    Text("Delete")
                }
                .font(.subheadline)
                .foregroundColor(.red)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color.red.opacity(0.1))
                .cornerRadius(8)
            }
            .padding(.trailing)
        }
        .frame(height: 60)
        .background(.ultraThinMaterial)
        .overlay(
            Rectangle()
                .frame(height: 0.5)
                .foregroundColor(.gray.opacity(0.3)),
            alignment: .top
        )
        .confirmationDialog(
            "Delete \(selectedCount) image(s)?",
            isPresented: $showingDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                onDelete()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This action cannot be undone.")
        }
    }
}

#Preview {
    VStack {
        Spacer()
        MultiSelectToolbar(
            selectedCount: 5,
            onExport: { print("Export") },
            onDelete: { print("Delete") }
        )
    }
}
