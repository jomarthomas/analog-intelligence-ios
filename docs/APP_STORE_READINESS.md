# App Store / Production Readiness

Status: **engineering-complete, not yet submittable.** The code, config, privacy
manifest, and consent flow are in place. Shipping is blocked on things only the
account owner can provide — a paid developer account, real monetization keys,
legal URLs, and store metadata. This doc is the exact runway.

---

## 🚧 Hard blockers — only you can do these

### 1. Paid Apple Developer Program — **required, $99/year**
The app is currently signed with a **free Personal Team** (`KW7MG747G3`). Free
teams can install on your own device for 7 days but **cannot submit to the App
Store**. You must enroll: https://developer.apple.com/programs/enroll/
- After enrolling you get a real **Team ID** — put it in `eas.json` (`submit.production.ios.appleTeamId`) and use it for the production build's signing.
- Google Play: a one-time **$25** Play Console account — https://play.google.com/console/signup

### 2. Real monetization keys (placeholders/test IDs today)
Everything is wired to read these from the environment; you just create the
accounts and set the secrets. **Do not paste real keys into `app.json` — this
repo is public.** Use EAS secrets:
- **AdMob** (https://admob.google.com): create the app + a banner ad unit, then
  `eas secret:create --name ADMOB_IOS_APP_ID --value ca-app-pub-XXXX~YYYY`
  (and `ADMOB_ANDROID_APP_ID`, `ADMOB_BANNER_IOS`, `ADMOB_BANNER_ANDROID`).
- **RevenueCat** (https://app.revenuecat.com): create the project + a `pro`
  entitlement + a `default` offering, then `eas secret:create --name REVENUECAT_IOS_KEY --value appl_...` (and `REVENUECAT_ANDROID_KEY`).
- You must also create the **In-App Purchase products** in App Store Connect /
  Play Console and attach them to the RevenueCat offering.

### 3. Legal URLs (App Store requires both)
- **Privacy policy URL** (mandatory). Must state: scans are processed on-device;
  the free tier shows AdMob ads and uses UMP consent; no scan data leaves the
  device; RevenueCat handles purchases.
- **Terms of Use / EULA URL** (required because there's a subscription/IAP).
- Host them anywhere (a simple GitHub Pages site is fine).

### 4. App Store Connect / Play Console listing (you author)
- App record with bundle id `com.analogintelligence.app`.
- **Screenshots** (6.7" + 6.5" iPhone, and iPad since `supportsTablet: true`).
- Name, subtitle, description, keywords, category (Photo & Video), age rating,
  support URL. (Draft copy: see "Store copy" below.)
- **App Privacy** questionnaire — answers in "Privacy answers" below.

---

## ✅ Done in code/config (this session)

- **UMP (GDPR) consent** before ad init — `src/monetization/consent.ts`
  (`AdsConsent.gatherConsent()`), wired ahead of `mobileAds().initialize()` in
  `ads.ts`. Guarded so it can never crash launch.
- **App Tracking Transparency string** (`NSUserTrackingUsageDescription`) added
  via `app.config.ts`. *(The ATT system prompt itself still needs the
  `expo-tracking-transparency` dep — see TODO below. Until then iOS ads serve
  non-personalised, which is compliant.)*
- **Env-based secrets** — `app.config.ts` injects all keys from the environment
  with TEST/placeholder fallbacks, so real keys never touch this public repo.
- **Privacy manifest** declared in `app.config.ts` (`ios.privacyManifests`) so
  it survives `expo prebuild` (UserDefaults / FileTimestamp / DiskSpace /
  BootTime reasons) + `ITSAppUsesNonExemptEncryption: false`.
- **EAS build/submit profiles** — `eas.json` (development / preview / production
  + submit placeholders).
- **Crash/error telemetry seam** — `src/lib/telemetry.ts` (`setTelemetryClient()`
  is Sentry-ready; just add a DSN and the client).
- **Pro gating + watermark** verified on-device (free tier shows the watermark
  and a test banner).

---

## 🔬 Quality gates before you submit

- [ ] **Verify the negative→positive pipeline on REAL film negatives** (color C-41
      and B&W) on both iOS and Android. The white-out you saw is expected for a
      non-negative photo, but real negatives still need an on-device A/B for
      color/tone (see `modules/ai-image-processing/PARITY.md`).
- [ ] **Add `expo-tracking-transparency`** and call `requestTrackingPermissionsAsync()`
      before `gatherAdsConsent()` so the iOS ATT prompt actually shows. (Needs a
      dependency install; left out here to preserve the local native patches.)
- [ ] **Wire a real crash reporter** (Sentry DSN → `setTelemetryClient`).
- [x] iOS app icon: `ios.icon` → `./assets/expo.icon` is a valid Icon Composer
      `.icon` bundle (Assets + icon.json). Just confirm it renders opaque (no
      alpha) in the final build — App Store rejects a transparent icon.
- [ ] Run on the smallest supported device + a tablet; check safe-area + the
      paywall layout.
- [ ] Add a basic test pass (no `jest` is installed yet) for the pure pipeline
      math and the suggestion/insights logic.

---

## 🛠 How to cut a store build (after blockers 1–2)

```bash
npm install -g eas-cli && eas login
# one-time, set your real keys:
eas secret:create --name REVENUECAT_IOS_KEY --value appl_xxx   # …and the rest
# iOS App Store build (EAS manages the paid-team signing):
eas build --platform ios --profile production
eas submit --platform ios --latest
# Google Play:
eas build --platform android --profile production
eas submit --platform android --latest
```

EAS runs `expo prebuild` from `app.config.ts`, so ATT/privacy-manifest/version
land automatically. (Locally the project's `ios/`+`android/` are gitignored and
carry dev-only patches; EAS builds clean from config.)

---

## 📋 App Privacy answers (App Store Connect questionnaire)

- **Camera / Photos**: used for app functionality (scanning); not linked to
  identity; not used for tracking.
- **Identifiers (advertising)**: collected by AdMob for third-party advertising;
  *Used for Tracking* = Yes only if you ship ATT + personalised ads (otherwise
  No). Linked to the user: per AdMob's disclosure.
- **Purchases**: RevenueCat/StoreKit — app functionality, not tracking.
- **No scan/image upload**: all processing is on-device — declare *no* data
  collection for the photos themselves.

## ✍️ Store copy (draft — edit freely)

- **Subtitle:** "Scan film negatives, on your phone."
- **Description:** Turn photos of your film negatives into finished positives —
  C-41 color, B&W, and slides. On-device processing (nothing leaves your phone),
  orange-mask removal, film-stock looks (Frontier/Portra/Gold…), a live
  histogram with one-tap fixes, before/after compare, and roll organization.
  One-time Pro unlocks full-resolution export, no watermark, and Insights.
- **Keywords:** film, negative, scanner, 35mm, analog, darkroom, C-41, positive,
  convert, photography.
