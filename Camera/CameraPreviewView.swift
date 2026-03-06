//
//  CameraPreviewView.swift
//  AnalogIntelligence
//
//  SwiftUI wrapper for AVCaptureVideoPreviewLayer
//

import SwiftUI
import AVFoundation

/// SwiftUI view that displays camera preview
struct CameraPreviewView: UIViewRepresentable {
    let previewLayer: AVCaptureVideoPreviewLayer?

    func makeUIView(context: Context) -> PreviewLayerView {
        let view = PreviewLayerView()
        return view
    }

    func updateUIView(_ uiView: PreviewLayerView, context: Context) {
        uiView.setPreviewLayer(previewLayer)
    }
}

/// UIView container for the preview layer
class PreviewLayerView: UIView {
    private var previewLayer: AVCaptureVideoPreviewLayer?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func setPreviewLayer(_ layer: AVCaptureVideoPreviewLayer?) {
        // Remove old layer
        previewLayer?.removeFromSuperlayer()

        // Add new layer
        self.previewLayer = layer

        if let layer = layer {
            layer.frame = bounds
            layer.videoGravity = .resizeAspectFill
            self.layer.addSublayer(layer)
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
    }
}
