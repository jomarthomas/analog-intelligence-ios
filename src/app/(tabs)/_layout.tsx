/**
 * (tabs)/_layout.tsx — Analog Intelligence tab navigator.
 *
 * Four tabs: Scan · Gallery · Insights (Pro) · Settings
 *
 * Uses expo-router <Tabs> (standard navigator) rather than
 * NativeTabs/unstable-native-tabs because the unstable API is not yet
 * reliable on SDK 56 for all four tabs with typed routes.
 *
 * Tab icons: expo-symbols SF Symbols on iOS; text-based fallbacks on
 * Android/web. We do NOT rely on assets/images/tabIcons PNGs.
 */

import { Platform, StyleSheet, Text, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Tab icon helper
// ---------------------------------------------------------------------------
type TabIconProps = {
  /** SF Symbol name — must be a valid SFSymbol literal */
  symbolName: SFSymbol;
  /** Text/emoji fallback for Android / web */
  fallbackChar: string;
  focused: boolean;
  color: ColorValue;
  size: number;
};

function TabIcon({ symbolName, fallbackChar, focused, color, size }: TabIconProps) {
  return (
    <SymbolView
      name={symbolName}
      tintColor={color}
      size={size}
      weight={focused ? 'semibold' : 'regular'}
      fallback={
        <Text
          style={{
            color,
            fontSize: Platform.OS === 'android' ? size * 0.7 : size * 0.8,
          }}>
          {fallbackChar}
        </Text>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.tabIconActive,
        tabBarInactiveTintColor: theme.tabIconInactive,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: {
          fontSize: FontSize.xs,
          fontWeight: FontWeight.medium,
          marginBottom: Platform.OS === 'ios' ? 0 : 4,
        },
        tabBarIconStyle: {
          marginTop: Platform.OS === 'ios' ? 0 : 4,
        },
      }}>

      {/* ── Scan ── */}
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              symbolName="camera.fill"
              fallbackChar="📷"
              focused={focused}
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* ── Gallery ── */}
      <Tabs.Screen
        name="gallery"
        options={{
          title: 'Gallery',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              symbolName="photo.on.rectangle.angled"
              fallbackChar="🖼"
              focused={focused}
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* ── Insights (Pro) ── */}
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              symbolName="waveform.path.ecg"
              fallbackChar="📊"
              focused={focused}
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* ── Settings ── */}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              symbolName="gearshape.fill"
              fallbackChar="⚙️"
              focused={focused}
              color={color}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
