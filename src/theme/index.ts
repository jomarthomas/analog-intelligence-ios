/**
 * src/theme/index.ts
 *
 * Central export for the Analog Intelligence design system.
 * Import shared components and tokens from here.
 */

// Design tokens (re-exported from constants for convenience)
export {
  Colors,
  Palette,
  Fonts,
  FontSize,
  FontWeight,
  LineHeight,
  Spacing,
  Radius,
  Shadow,
  BottomTabInset,
  MaxContentWidth,
} from '@/constants/theme';
export type { ThemeColor, AnalogColors } from '@/constants/theme';

// Shared presentational components
export { Screen } from './screen';
export { Button } from './button';
export { Card } from './card';
export { ListRow } from './list-row';
export { SectionHeader } from './section-header';
export { PlaceholderScreen } from './placeholder-screen';
export { ProBadge } from './pro-badge';
