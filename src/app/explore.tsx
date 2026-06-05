/**
 * explore.tsx — deprecated demo screen.
 *
 * This file is kept as a stub so any deep-link or legacy route to "/explore"
 * does not produce a 404. It redirects to the Gallery tab.
 *
 * Safe to delete once all routing references are confirmed removed.
 */

import { Redirect } from 'expo-router';

export default function ExploreRedirect() {
  return <Redirect href="/(tabs)/gallery" />;
}
