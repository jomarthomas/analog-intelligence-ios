/**
 * src/processing/index.ts
 *
 * Public barrel for the Pipeline workstream.
 *
 * Consumers import from '@/processing' — not from sub-modules directly.
 * This keeps internal restructuring transparent to other workstreams.
 */

// Shared types
export type {
  FilmMode,
  ProcessParams,
  ProcessResult,
  Histogram,
  FullProcessParams,
  PipelineResult,
} from './types';
export { PipelineError, toNativeParams, toSnapshot, fromSnapshot } from './types';

// Defaults
export {
  DEFAULT_FULL_PROCESS_PARAMS,
  DEFAULT_BW_PROCESS_PARAMS,
  PARAM_RANGES,
  clampParam,
} from './defaults';

// Film-stock / lab-scanner looks
export {
  FILM_PROFILES,
  NEUTRAL_PROFILE_ID,
  getFilmProfile,
  applyFilmProfile,
} from './filmProfiles';
export type { FilmProfile, FilmProfileGroup, ProfileParams } from './filmProfiles';

// Pipeline orchestration (non-React)
export { runPipeline, previewParams, isPipelineFallback } from './pipeline';

// React hook
export { usePipeline } from './usePipeline';
export type { UsePipelineOptions, UsePipelineReturn } from './usePipeline';
