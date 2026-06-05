/**
 * (tabs)/_layout.tsx — Analog Intelligence tab navigator.
 *
 * Four tabs: Scan · Gallery · Insights (Pro) · Settings
 *
 * Uses expo-router <Tabs> (standard navigator) rather than
 * NativeTabs/unstable-native-tabs because the unstable API is not yet
 * reliable on SDK 56 for all four tabs with typed routes.
 *
 * Tab icons: SF Symbols on iOS; monochrome SVG line glyphs as the
 * cross-platform fallback (the app is black & white, so emoji — which render in
 * full colour — are not used).
 */

import { ReactElement } from 'react';
import { Platform, StyleSheet, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight } from '@/constants/theme';
import {
  CameraGlyph,
  GalleryGlyph,
  InsightsGlyph,
  SettingsGlyph,
} from '@/components/tab-icons';

// ---------------------------------------------------------------------------
// Tab icon helper
// ---------------------------------------------------------------------------
type GlyphComponent = (props: {
  color: ColorValue;
  size: number;
  focused?: boolean;
}) => ReactElement;

type TabIconProps = {
  /** SF Symbol name — must be a valid SFSymbol literal */
  symbolName: SFSymbol;
  /** Monochrome SVG fallback for Android / web */
  Glyph: GlyphComponent;
  focused: boolean;
  color: ColorValue;
  size: number;
};

function TabIcon({ symbolName, Glyph, focused, color, size }: TabIconProps) {
  return (
    <SymbolView
      name={symbolName}
      tintColor={color}
      size={size}
      weight={focused ? 'semibold' : 'regular'}
      fallback={<Glyph color={color} size={size} focused={focused} />}
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
          letterSpacing: 0.2,
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
              Glyph={CameraGlyph}
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
              Glyph={GalleryGlyph}
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
              Glyph={InsightsGlyph}
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
              Glyph={SettingsGlyph}
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
