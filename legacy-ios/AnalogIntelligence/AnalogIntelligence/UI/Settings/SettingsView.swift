//
//  SettingsView.swift
//  AnalogIntelligence
//
//  Created by Analog Intelligence
//

import SwiftUI

struct SettingsView: View {
    @StateObject private var purchaseManager = PurchaseManager.shared
    @AppStorage("captureFormat") private var captureFormat = CaptureFormat.heic
    @AppStorage("enableRAW") private var enableRAW = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                // Pro Status Section
                Section {
                    HStack {
                        Text("Status")
                        Spacer()
                        if purchaseManager.isPro {
                            Text("Pro")
                                .foregroundColor(.blue)
                                .bold()
                        } else {
                            Button("Upgrade to Pro") {
                                purchaseManager.purchasePro()
                            }
                        }
                    }
                }

                // Capture Settings
                Section(header: Text("Capture Settings")) {
                    Picker("Format", selection: $captureFormat) {
                        Text("HEIC").tag(CaptureFormat.heic)
                        Text("JPEG").tag(CaptureFormat.jpeg)
                    }

                    if purchaseManager.isPro {
                        Toggle("Enable RAW (DNG)", isOn: $enableRAW)
                    }
                }

                // Processing Settings
                Section(header: Text("Processing")) {
                    NavigationLink("Calibration") {
                        CalibrationSettingsView()
                    }
                }

                // About Section
                Section(header: Text("About")) {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.0")
                            .foregroundColor(.gray)
                    }

                    Link("Privacy Policy", destination: URL(string: "https://analogintelligence.app/privacy")!)
                    Link("Terms of Service", destination: URL(string: "https://analogintelligence.app/terms")!)
                }

                // Support Section
                Section(header: Text("Support")) {
                    Link("Contact Support", destination: URL(string: "mailto:support@analogintelligence.app")!)
                    Button("Restore Purchases") {
                        purchaseManager.restorePurchases()
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

#Preview {
    SettingsView()
}
