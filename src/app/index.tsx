/**
 * Root index — redirects to the Scan tab.
 *
 * expo-router requires a route at "/" when the root layout is a Stack.
 * This file immediately redirects to (tabs)/scan, which is the app entry point.
 */

import { Redirect } from 'expo-router';

export default function RootIndex() {
  return <Redirect href="/(tabs)/scan" />;
}
