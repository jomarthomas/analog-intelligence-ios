import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            ScanView()
                .tabItem { Label("Scan", systemImage: "camera") }

            GalleryView()
                .tabItem { Label("Gallery", systemImage: "photo.on.rectangle") }

            InsightsView()
                .tabItem { Label("Insights", systemImage: "chart.bar") }
        }
    }
}

#Preview {
    RootView()
}
