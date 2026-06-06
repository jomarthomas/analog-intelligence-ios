/**
 * src/features/adjust/index.ts
 *
 * Public surface of the Adjust-screen UI components.
 * Mounted by src/app/adjust/[id].tsx.
 */

export { AdjustPreview } from './AdjustPreview';
export type { AdjustPreviewProps } from './AdjustPreview';

export { AdjustSlider } from './AdjustSlider';
export type { AdjustSliderProps } from './AdjustSlider';

export { AIToggleRow } from './AIToggleRow';
export type { AIToggleRowProps } from './AIToggleRow';

export { FilmProfilePicker } from './FilmProfilePicker';

export { BeforeAfterCompare } from './BeforeAfterCompare';

export { AdvancedSection } from './AdvancedSection';
export type { AdvancedSectionProps } from './AdvancedSection';

export {
  FailedConversionBanner,
  isFailedConversion,
  extremePileFraction,
  DEGENERATE_EXTREME_FRACTION,
  DEGENERATE_MIN_OCCUPIED_RANGE,
} from './FailedConversionBanner';
export type { FailedConversionBannerProps } from './FailedConversionBanner';
