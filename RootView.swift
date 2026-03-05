import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            CameraScreen()
                .tabItem { Label("Camera", systemImage: "camera") }

            GalleryScreen()
                .tabItem { Label("Gallery", systemImage: "photo.on.rectangle") }

            SettingsScreen()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}

struct CameraScreen: View {
    var body: some View {
        Text("Camera Screen")
            .font(.largeTitle)
    }
}

struct GalleryScreen: View {
    var body: some View {
        Text("Gallery Screen")
            .font(.largeTitle)
    }
}

struct SettingsScreen: View {
    var body: some View {
        VStack(spacing: 20) {
            Text("Settings")
                .font(.largeTitle)
            Text("Pro unlock coming soon!")
                .foregroundColor(.secondary)
        }
        .padding()
    }
}

#Preview {
    RootView()
}
