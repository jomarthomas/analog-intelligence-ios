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
  // Black & white app — there is no colour accent. Emphasis is pure contrast:
  // white on black (dark) / black on white (light). `ink`/`paper` are the two
  // poles; everything else is a calibrated grey.
  ink: '#FFFFFF', // the "bright" pole (used as accent on dark surfaces)
  paper: '#000000', // the "dark" pole (used as accent on light surfaces)

  // Legacy accent aliases — the app was amber-accented before going black & white.
  // Repointed to monochrome so existing `Palette.amber*` call-sites render greyscale
  // (they all sit on the app's dark camera/gallery surfaces, where white is correct).
  // Prefer `theme.accent` (mode-aware) or `Palette.ink` in new code.
  amber: '#FFFFFF',
  amberDim: '#C7C7C7',
  amberMuted: 'rgba(255,255,255,0.12)',

  // Dark-mode surfaces — true black, OLED, editorial contrast
  darkBg: '#000000',
  darkCard: '#0E0E0E',
  darkElevated: '#171717',
  darkOverlay: 'rgba(0,0,0,0.66)',
  darkBorder: '#262626',
  darkDivider: 'rgba(255,255,255,0.10)',

  // Light-mode surfaces — clean near-white paper, white cards
  lightBg: '#F5F5F4',
  lightCard: '#FFFFFF',
  lightElevated: '#FFFFFF',
  lightBorder: '#E4E4E2',
  lightDivider: 'rgba(0,0,0,0.09)',

  // Neutral greys (mode-agnostic)
  white: '#FFFFFF',
  offWhite: '#F3F3F3',
  black: '#000000',
  charcoal: '#161616',
  ash: '#8E8E93', // secondary text
  smoke: '#6B6B70',

  // Status — the only functional colour kept (destructive actions); everything
  // else is monochrome. Used sparingly.
  success: '#FFFFFF',
  warning: '#FFFFFF',
  danger: '#E5484D',

  // Pro badge fallback (used by a few inline badges on dark surfaces). The
  // shared <ProBadge> component is theme-aware; these statics stay light-on-dark.
  proBadgeBg: '#FFFFFF',
  proBadgeText: '#000000',
} as const;

// ---------------------------------------------------------------------------
// Semantic color tokens (light + dark)
// These extend the original Colors shape so existing consumers keep working.
// ---------------------------------------------------------------------------
export const Colors = {
  light: {
    // Kept for backwards-compat with ThemedText / ThemedView
    text: Palette.black,
    background: Palette.lightBg,
    backgroundElement: Palette.lightCard,
    backgroundSelected: '#ECECEA',
    textSecondary: '#6E6E73',

    // Analog Intelligence additions
    textTertiary: '#9A9A9E',
    backgroundCard: Palette.lightCard,
    backgroundElevated: Palette.lightElevated,
    border: Palette.lightBorder,
    divider: Palette.lightDivider,
    // Monochrome "accent" = the dark pole; accentText = what sits on it.
    accent: Palette.paper,
    accentText: Palette.white,
    accentDim: '#2E2E2E',
    accentMuted: 'rgba(0,0,0,0.06)',
    tabBar: 'rgba(255,255,255,0.92)',
    tabBarBorder: Palette.lightDivider,
    tabIconActive: Palette.paper,
    tabIconInactive: '#8E8E93',
    overlay: 'rgba(255,255,255,0.82)',
    proText: Palette.white,
    proBadge: Palette.paper,
  },
  dark: {
    // Kept for backwards-compat
    text: Palette.white,
    background: Palette.darkBg,
    backgroundElement: Palette.darkCard,
    backgroundSelected: '#1C1C1C',
    textSecondary: Palette.ash,

    // Analog Intelligence additions
    textTertiary: '#5A5A5E',
    backgroundCard: Palette.darkCard,
    backgroundElevated: Palette.darkElevated,
    border: Palette.darkBorder,
    divider: Palette.darkDivider,
    // Monochrome "accent" = the bright pole; accentText = what sits on it.
    accent: Palette.ink,
    accentText: Palette.black,
    accentDim: '#C7C7C7',
    accentMuted: 'rgba(255,255,255,0.10)',
    tabBar: 'rgba(8,8,8,0.92)',
    tabBarBorder: Palette.darkDivider,
    tabIconActive: Palette.ink,
    tabIconInactive: Palette.ash,
    overlay: Palette.darkOverlay,
    proText: Palette.black,
    proBadge: Palette.ink,
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
