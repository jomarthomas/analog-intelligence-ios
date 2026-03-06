//
//  CalibrationSettingsView.swift
//  AnalogIntelligence
//
//  Created by Analog Intelligence
//

import SwiftUI

struct CalibrationSettingsView: View {
    @AppStorage("lockFocus") private var lockFocus = true
    @AppStorage("lockExposure") private var lockExposure = true
    @AppStorage("lockWhiteBalance") private var lockWhiteBalance = true

    var body: some View {
        Form {
            Section(header: Text("Lock Settings During Calibration")) {
                Toggle("Lock Focus", isOn: $lockFocus)
                Toggle("Lock Exposure", isOn: $lockExposure)
                Toggle("Lock White Balance", isOn: $lockWhiteBalance)
            }

            Section(footer: Text("These settings determine which camera parameters are locked during the calibration step to ensure consistent captures.")) {
                EmptyView()
            }
        }
        .navigationTitle("Calibration")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    CalibrationSettingsView()
}
