/**
 * Root layout — Analog Intelligence app shell.
 *
 * Sets up:
 *   - expo-router Stack navigator with two groups:
 *       (tabs)   — the four main tabs (scan, gallery, insights, settings)
 *       adjust   — the adjust/[id] modal stack
 *   - expo-router ThemeProvider wired to the Analog Intelligence dark-first theme
 *   - Animated splash overlay (kept from scaffold)
 */

import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ErrorBoundary } from '@/components/error-boundary';
import { initTelemetry } from '@/lib/telemetry';
import { initAds, initPurchases } from '@/monetization';
import { useGalleryStore } from '@/state/galleryStore';

/**
 * Dark-first: we always prefer the dark navigation theme for Analog Intelligence,
 * but keep respecting the system scheme so accessibility / forced-light mode works.
 */
function useNavigationTheme() {
  const scheme = useColorScheme();
  // Analog Intelligence is dark-first; only flip to light when OS explicitly requests it
  return scheme === 'light' ? DefaultTheme : DarkTheme;
}

export default function RootLayout() {
  const navTheme = useNavigationTheme();

  // One-time app bootstrap: initialise RevenueCat (Pro entitlement sync) and
  // load the persisted gallery (sessions + images) into the zustand store.
  // Both are safe to call when their native modules are unconfigured — they
  // log a warning and resolve gracefully (see purchases.ts / galleryStore.ts).
  useEffect(() => {
    initTelemetry();
    void initPurchases();
    void initAds();
    void useGalleryStore.getState().loadGallery();
  }, []);

  return (
    <ErrorBoundary>
    <ThemeProvider value={navTheme}>
      {/* Splash fade-out overlay */}
      <AnimatedSplashOverlay />

      <Stack screenOptions={{ headerShown: false }}>
        {/* Main tab navigator */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* Adjust screen — presented as a modal (card) over the tabs */}
        <Stack.Screen
          name="adjust/[id]"
          options={{
            presentation: 'modal',
            headerShown: false,
            // Prevent accidental swipe-down dismissal during active editing
            gestureEnabled: true,
          }}
        />

        {/* Gallery detail — full-frame view pushed from the gallery grid */}
        <Stack.Screen
          name="gallery/[id]"
          options={{
            headerShown: false,
            presentation: 'card',
          }}
        />
      </Stack>

      <StatusBar style="light" />
    </ThemeProvider>
    </ErrorBoundary>
  );
}
