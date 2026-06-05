import { requireNativeModule } from 'expo';

import type {
  Histogram,
  ProcessParams,
  ProcessResult,
  UserAdjustParams,
  FrameDetectionResult,
} from './AiImageProcessing.types';

/**
 * The native side of the module. The methods here mirror exactly the
 * `AsyncFunction(...)` definitions in:
 *   - ios/AiImageProcessingModule.swift
 *   - android/src/main/java/expo/modules/aiimageprocessing/AiImageProcessingModule.kt
 *
 * Both register `Name("AiImageProcessing")`, so `requireNativeModule`
 * resolves the same module on either platform.
 */
export interface AiImageProcessingNativeModule {
  processNegative(inputUri: string, params: ProcessParams): Promise<ProcessResult>;
  analyzeHistogram(uri: string): Promise<Histogram>;
  // Task #10 additions — additive:
  applyUserAdjustments(
    baseUri: string,
    params: Required<UserAdjustParams>,
  ): Promise<ProcessResult>;
  detectFilmFrame(uri: string): Promise<FrameDetectionResult>;
}

// `requireNativeModule` is re-exported from `expo` in SDK 56 (the convention
// used by first-party modules such as `expo-image`).
export default requireNativeModule<AiImageProcessingNativeModule>('AiImageProcessing');
