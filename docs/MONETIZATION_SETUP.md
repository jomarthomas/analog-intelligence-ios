# Monetization setup — going from TEST to REAL

The plumbing is done: `app.config.ts` reads every key from the environment with
TEST/placeholder fallbacks, and `src/monetization/config.ts` exposes
`IS_ADMOB_CONFIGURED` / `IS_REVENUECAT_CONFIGURED` flags that flip to `true`
automatically once real values are present. You just create the accounts and set
the secrets — no code changes.

> The app keeps working with no keys (Google test ads + Pro disabled), so you can
> do this whenever. The "Test mode" banner you saw = the AdMob test unit.

---

## 1. AdMob (ads)
1. Create an account: https://admob.google.com → **Apps → Add app** (one for
   iOS, one for Android) with package `com.analogintelligence.app`.
2. For each app, create a **Banner** ad unit.
3. You now have 4 values: the two **App IDs** (`ca-app-pub-…~…`) and the two
   **banner ad-unit IDs** (`ca-app-pub-…/…`).
4. In AdMob → **Privacy & messaging**, set up a **GDPR (UMP) message** and (iOS)
   an **ATT message** — the app already calls `AdsConsent.gatherConsent()`.

## 2. RevenueCat (Pro purchase)
1. Create the IAP product first:
   - **App Store Connect** → your app → **In-App Purchases** → create the Pro
     product (e.g. a non-consumable `pro_lifetime` or an auto-renewing sub).
   - **Play Console** → **Monetize → Products** → matching product.
2. https://app.revenuecat.com → new project → add the iOS and Android apps.
3. Create an **Entitlement** with id `pro` and attach your store product(s).
4. Create an **Offering** id `default` and add the product as a package.
5. Copy the two **public SDK keys** (`appl_…` for iOS, `goog_…` for Android).
   - The app already expects entitlement `pro` + offering `default` (see
     `app.json` extra `revenueCatEntitlementId` / `revenueCatOfferingId`).

## 3. Set the secrets (don't commit them — this repo is public)
Local dev — copy `.env.example` to `.env` (gitignored) and fill it in. For
release builds, use EAS secrets:
```bash
eas secret:create --scope project --name ADMOB_IOS_APP_ID        --value ca-app-pub-XXXX~YYYY
eas secret:create --scope project --name ADMOB_ANDROID_APP_ID    --value ca-app-pub-XXXX~ZZZZ
eas secret:create --scope project --name ADMOB_BANNER_IOS        --value ca-app-pub-XXXX/AAAA
eas secret:create --scope project --name ADMOB_BANNER_ANDROID    --value ca-app-pub-XXXX/BBBB
eas secret:create --scope project --name REVENUECAT_IOS_KEY      --value appl_XXXXXXXX
eas secret:create --scope project --name REVENUECAT_ANDROID_KEY  --value goog_XXXXXXXX
```

## 4. Verify
- Locally: `npx expo config --json | grep -i admob` should show your real app IDs
  (not `3940256099942544`).
- In the app: with real keys, the banner serves real ads (no "Test mode" label),
  and the paywall shows your `default` offering. `IS_ADMOB_CONFIGURED` /
  `IS_REVENUECAT_CONFIGURED` both become `true`.
- Build: `eas build --platform ios --profile production` (EAS injects the
  secrets at build time).

> **Want me to set these for you?** Paste the 6 values and I'll wire them into a
> local `.env` (gitignored) and/or run the `eas secret:create` commands.
