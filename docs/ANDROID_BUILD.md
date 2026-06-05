# Building & running the Android app

Verified on 2026-06-04: the app **builds, installs, and runs on an Android
emulator** (Pixel AVD, API 36). The Scan screen (camera, frame-detection overlay,
manual controls, dock simulation, AdMob test banner) and the Settings screen all
render. Getting there required the fixes below — some are committed to the repo,
some are environment/dependency workarounds that must be re-applied after a clean
`npm install` or `expo prebuild` (because `android/` and `node_modules/` are
git-ignored and regenerated).

## Committed fixes (in the repo)

- **`app.json`**
  - `react-native-google-mobile-ads` props renamed `android_app_id`/`ios_app_id`
    → **`androidAppId`/`iosAppId`** (the plugin only reads the camelCase keys; with
    the wrong names the AdMob App ID never reaches `AndroidManifest.xml` and the
    Google Mobile Ads SDK **hard-crashes on launch**).
  - `expo-build-properties` `ios.deploymentTarget` `15.1` → **`16.4`** (vision-camera's
    podspec requires ≥ 16.4; the iOS validation runs even for Android prebuild).
- **`modules/ai-image-processing/android/.../AiImageProcessingModule.kt`** — three
  bugs that made the Android engine fail to compile (it had never been built before):
  1. Header comment contained `legacy-ios/Processing/Pipeline/*`; Kotlin supports
     **nested block comments**, so that `/*` opened a comment that ran to EOF
     ("Unclosed comment"). Reworded to drop the `/*`.
  2. `val resolver get() = …` — illegal local-property getter; made a plain `val`.
  3. `decodeBitmap` declared `val decoded: Bitmap?` but `?: return null` guarantees
     non-null; changed to `Bitmap` so it satisfies `applyExifOrientation(Bitmap)`.

## Environment prerequisites

- **JDK 17 *and* 21.** The Gradle 9.3.1 wrapper runs on 21, but the RN/AGP toolchain
  compiles with **JDK 17**. Install it (no sudo): `brew install openjdk@17`.
- Android SDK with platform/build-tools 35–36, an emulator + an AVD.
- `JAVA_HOME` set to a JDK (21 is fine to *launch* Gradle).

## Dependency workarounds (re-apply after `npm install`)

`node_modules/` is git-ignored, so these don't persist — re-apply (ideally wire up
[`patch-package`](https://github.com/ds300/patch-package); the auto-generated
patches were too large to commit here because the installed bleeding-edge builds
don't match their npm-published copies).

1. **vision-camera config plugin is missing.** `react-native-vision-camera@5.0.10`
   ships **no `app.plugin.js`**, so `expo prebuild`/`expo config` fall back to its
   `lib/index.js` whose extensionless ESM imports crash Node (`ERR_MODULE_NOT_FOUND`).
   Create `node_modules/react-native-vision-camera/app.plugin.js` exporting a
   config plugin that injects the camera (and optional microphone) permission via
   `@expo/config-plugins` (`withInfoPlist` + `AndroidConfig.Permissions.withPermissions`,
   wrapped in `createRunOncePlugin`).

2. **foojay toolchain resolver crashes on Gradle 9.** `node_modules/@react-native/
   gradle-plugin/settings.gradle.kts` applies
   `org.gradle.toolchains.foojay-resolver-convention` **0.5.0**, whose
   `DistributionsKt` references `JvmVendorSpec.IBM_SEMERU` — a field Gradle 9
   removed — so settings evaluation dies with `NoSuchFieldError`. Comment that
   `plugins { … }` line out. With JDK 17 + 21 installed locally there's nothing to
   auto-provision, so the resolver isn't needed.

3. **Use local JDKs, don't download.** In `~/.gradle/gradle.properties` (global, so it
   survives `expo prebuild` regenerating `android/`):
   ```properties
   org.gradle.java.installations.auto-download=false
   org.gradle.java.installations.paths=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home,/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home
   ```

## Run

```bash
npm install
# (re-apply the two node_modules workarounds above)
emulator -avd <your-avd> &            # boot a device
npx expo prebuild --platform android  # generates android/
npx expo run:android                  # build + install + launch + Metro
```

## Known runtime notes

- **Camera preview is black on the emulator** and a one-time toast appears:
  `PhotoContainerFormat "heic" is not supported on this Device!` — the emulated
  camera doesn't support the HEIC photo container (the Scan screen's HEIC toggle).
  Real devices support it. **Robustness improvement worth making:** catch the
  unsupported-format error in the capture path and fall back to JPEG instead of an
  uncaught promise rejection.
- **RevenueCat** logs `API key is a placeholder — purchases unavailable` and
  degrades gracefully (expected with the committed placeholder keys).
- **AdMob** shows a Google **test** banner — replace the test App ID / unit IDs with
  real ones before release.
