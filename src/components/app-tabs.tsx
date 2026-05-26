/**
 * app-tabs.tsx — legacy NativeTabs wrapper (NOT USED).
 *
 * NOTE: This component is no longer used as the primary tab navigator.
 * The Analog Intelligence tab shell is now driven by:
 *   src/app/(tabs)/_layout.tsx  (expo-router <Tabs>)
 *
 * Kept as a stub. Not imported by any active screen — safe to delete in a
 * future cleanup pass once the (tabs)/_layout.tsx approach is confirmed stable.
 *
 * If NativeTabs becomes stable in a future SDK, this can be revived and
 * promoted back to the root layout.
 */

import { View } from 'react-native';

/**
 * Stub — the real tab navigator lives in src/app/(tabs)/_layout.tsx.
 * This module is intentionally empty so that any accidental import
 * does not break the build.
 */
export default function AppTabs() {
  return <View />;
}
