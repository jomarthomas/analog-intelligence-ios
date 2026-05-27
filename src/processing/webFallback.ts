/**
 * src/processing/webFallback.ts
 *
 * Pure-TS reference inversion for web/dev when the native module is
 * unavailable (expo go, web preview, CI snapshots).
 *
 * GUARDED — never imported at runtime on iOS/Android. Import pattern:
 *
 *   import { getProcessingBackend } from '@/processing/webFallback';
 *   const backend = getProcessingBackend();
 *   const result = await backend.processNegative(uri, params);
 *
 * The inversion is a best-effort approximation:
 *   - On native: delegates straight to the real ai-image-processing module.
 *   - On web/unavailable: returns the original URI unchanged (identity pass)
 *     so UI development can proceed without a native build.
 *
 * The histogram stub returns a flat distribution so histogram-dependent UI
 * renders without crashing.
 *
 * This file does NOT affect the native processing path and must never be
 * imported from pipeline.ts or usePipeline.ts directly.
 */

import { Platform } from 'react-native';
import type { Histogram, ProcessParams, ProcessResult } from './types';

// ---------------------------------------------------------------------------
// Backend interface
// ---------------------------------------------------------------------------

export interface ProcessingBackend {
  processNegative(uri: string, params: ProcessParams): Promise<ProcessResult>;
  analyzeHistogram(uri: string): Promise<Histogram>;
  isNative: boolean;
}

// ---------------------------------------------------------------------------
// Native backend — thin wrapper over the real module
// ---------------------------------------------------------------------------

function createNativeBackend(): ProcessingBackend {
  // Dynamic require so this file can be parsed on web without crashing at
  // module evaluation time. The require is only reached on native platforms.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../../modules/ai-image-processing') as {
    processNegative: (uri: string, params: ProcessParams) => Promise<ProcessResult>;
    analyzeHistogram: (uri: string) => Promise<Histogram>;
  };

  return {
    isNative: true,
    processNegative: (uri, params) => mod.processNegative(uri, params),
    analyzeHistogram: (uri) => mod.analyzeHistogram(uri),
  };
}

// ---------------------------------------------------------------------------
// Web/stub backend — identity pass-through
// ---------------------------------------------------------------------------

/** Flat 256-bin histogram (uniform distribution, zero clip). */
function flatHistogram(): Histogram {
  const flat = Array.from<number>({ length: 256 }).fill(1 / 256);
  return {
    r: flat,
    g: flat,
    b: flat,
    luma: flat,
    shadowClipPct: 0,
    highlightClipPct: 0,
  };
}

function createWebBackend(): ProcessingBackend {
  return {
    isNative: false,

    /**
     * Identity pass: returns the input URI as the "processed" output.
     * Dimensions are 0x0 — web consumers should treat zero dimensions as
     * "unknown" and size their canvases from the image element directly.
     */
    processNegative: async (uri: string): Promise<ProcessResult> => {
      console.warn(
        '[processing/webFallback] Native module unavailable. ' +
          'Returning original URI as processed output (identity pass).',
      );
      return { uri, width: 0, height: 0 };
    },

    analyzeHistogram: async (_uri: string): Promise<Histogram> => {
      console.warn(
        '[processing/webFallback] Native module unavailable. ' +
          'Returning flat histogram stub.',
      );
      return flatHistogram();
    },
  };
}

// ---------------------------------------------------------------------------
// Public: getProcessingBackend
// ---------------------------------------------------------------------------

let _backend: ProcessingBackend | null = null;

/**
 * Returns the appropriate ProcessingBackend for the current platform.
 * Result is memoised — safe to call repeatedly.
 *
 * Consumers:
 *   - Dev tooling, Storybook, web preview: receives the stub backend.
 *   - iOS/Android production: receives the native backend.
 *
 * Note: usePipeline.ts and pipeline.ts import from ai-image-processing
 * directly and do NOT use this helper — it is purely for dev/test consumers.
 */
export function getProcessingBackend(): ProcessingBackend {
  if (_backend) return _backend;

  const isWeb = Platform.OS === 'web';
  // Check whether the native module is actually available at runtime.
  // The native module's AiImageProcessingModule is undefined on web.
  let moduleUnavailable = isWeb;

  if (!isWeb) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../../modules/ai-image-processing/src/AiImageProcessingModule');
      // The module exports a default that is null/undefined when the native
      // binary is missing (e.g. Expo Go, Jest without native mocks).
      moduleUnavailable = mod?.default == null;
    } catch {
      moduleUnavailable = true;
    }
  }

  _backend = moduleUnavailable ? createWebBackend() : createNativeBackend();
  return _backend;
}

/**
 * Reset the cached backend (useful in tests that mock the native module).
 */
export function _resetBackendCache(): void {
  _backend = null;
}
