/**
 * Analog Intelligence design tokens.
 *
 * Dark-first film/darkroom aesthetic:
 *   - Deep neutral backgrounds (#141418 main, #1E1E28 card)
 *   - Warm amber/orange accent (#FF9933) — darkroom safelight + film orange mask
 *   - Light mode retains the brand but brightens surfaces
 */

import '@/global.css';

import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Brand palette (raw values — prefer using Colors or AnalogColors below)
// ---------------------------------------------------------------------------
export const Palette = {
  /** Primary orange accent — Kodak/film orange mask, darkroom safelight */
  amber: '#FF9933',
  amberDim: '#CC7A28',
  amberMuted: '#3D2910',

  // Dark-mode surfaces
  darkBg: '#141418',
  darkCard: '#1E1E28',
  darkOverlay: 'rgba(0,0,0,0.60)',
  darkBorder: '#2C2C38',

  // Light-mode surfaces
  lightBg: '#F5F4F0',
  lightCard: '#FFFFFF',
  lightBorder: '#E0DDD8',

  // Neutrals
  white: '#FFFFFF',
  black: '#000000',
  charcoal: '#212225',
  ash: '#B0B4BA',
  smoke: '#60646C',

  // Status
  success: '#34C759',
  warning: '#FF9F0A',
  danger: '#FF453A',

  // Pro badge
  proBadgeBg: '#FF9933',
  proBadgeText: '#000000',
} as const;

// ---------------------------------------------------------------------------
// Semantic color tokens (light + dark)
// These extend the original Colors shape so existing consumers keep working.
// ---------------------------------------------------------------------------
export const Colors = {
  light: {
    // Kept for backwards-compat with ThemedText / ThemedView
    text: '#1A1A1A',
    background: Palette.lightBg,
    backgroundElement: Palette.lightCard,
    backgroundSelected: '#E8E5DF',
    textSecondary: Palette.smoke,

    // Analog Intelligence additions
    backgroundCard: Palette.lightCard,
    border: Palette.lightBorder,
    accent: Palette.amber,
    accentDim: Palette.amberDim,
    accentMuted: '#F5E6C8',
    tabBar: '#FFFFFF',
    tabBarBorder: Palette.lightBorder,
    tabIconActive: Palette.amber,
    tabIconInactive: Palette.smoke,
    overlay: 'rgba(255,255,255,0.80)',
    proText: Palette.proBadgeText,
    proBadge: Palette.proBadgeBg,
  },
  dark: {
    // Kept for backwards-compat
    text: Palette.white,
    background: Palette.darkBg,
    backgroundElement: Palette.darkCard,
    backgroundSelected: '#2A2A38',
    textSecondary: Palette.ash,

    // Analog Intelligence additions
    backgroundCard: Palette.darkCard,
    border: Palette.darkBorder,
    accent: Palette.amber,
    accentDim: Palette.amberDim,
    accentMuted: Palette.amberMuted,
    tabBar: '#0F0F13',
    tabBarBorder: Palette.darkBorder,
    tabIconActive: Palette.amber,
    tabIconInactive: Palette.ash,
    overlay: Palette.darkOverlay,
    proText: Palette.proBadgeText,
    proBadge: Palette.proBadgeBg,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Convenience alias used by src/theme/* components
export type AnalogColors = (typeof Colors)['dark'];

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------
export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** Typography scale (matches legacy Swift app: 20/17/15/13) */
export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  display: 32,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const LineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
} as const;

// ---------------------------------------------------------------------------
// Spacing (8-pt grid — extends original)
// ---------------------------------------------------------------------------
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
  // Named aliases for readability
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ---------------------------------------------------------------------------
// Border radii
// ---------------------------------------------------------------------------
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------
export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.20,
    shadowRadius: 8,
    elevation: 4,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
