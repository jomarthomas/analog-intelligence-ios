//
//  GalleryImageCell.swift
//  AnalogIntelligence
//
//  Created by Analog Intelligence
//

import SwiftUI

struct GalleryImageCell: View {
    let image: ScannedImage

    var body: some View {
        ZStack {
            if let uiImage = image.thumbnailImage {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 100, height: 100)
                    .clipped()
                    .cornerRadius(8)
            } else {
                Rectangle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 100, height: 100)
                    .cornerRadius(8)
                    .overlay(
                        Image(systemName: "photo")
                            .foregroundColor(.gray)
                    )
            }
        }
    }
}
