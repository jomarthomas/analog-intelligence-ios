/**
 * src/camera/index.ts
 *
 * Public surface of the camera layer. The Scan screen / orchestrator should
 * import from here.
 */

export { CameraScanView } from './CameraScanView';
export type { CameraScanViewProps, CaptureMeta } from './CameraScanView';

export { FilmGuideOverlay } from './FilmGuideOverlay';
export type { FilmGuideOverlayProps } from './FilmGuideOverlay';

export { LivePositiveOverlay } from './LivePositiveOverlay';
export type { LivePositiveOverlayProps } from './LivePositiveOverlay';

export { useLivePositivePreview } from './useLivePositivePreview';
export type { LivePositivePreview } from './useLivePositivePreview';

export {
  buildInvertPreviewMatrix,
  INVERT_PREVIEW_MATRIX,
  DEFAULT_INVERT_PREVIEW_PARAMS,
} from './invertMatrix';
export type { InvertPreviewParams } from './invertMatrix';

export { autoCropToFilmFrame } from './autoCrop';
export type { AutoCropResult } from './autoCrop';

export {
  useCaptureGuidance,
  captureHint,
  frameGuidance,
} from './useCaptureGuidance';
export type {
  CaptureHint,
  ExposureStats,
  FrameCoverage,
  FrameGuidance,
  FrameGuideState,
} from './useCaptureGuidance';

export { useCameraPermissions } from './useCameraPermissions';
export type {
  CameraPermissionStatus,
  CameraPermissionsResult,
} from './useCameraPermissions';

export { capturePhoto } from './capturePhoto';
export type { CaptureOptions } from './capturePhoto';

export {
  useFrameProcessors,
  FRAME_PROCESSORS_AVAILABLE,
} from './useFrameProcessors';
export type {
  FrameProcessorsResult,
  FocusPeakingOptions,
  DetectedFrame,
} from './useFrameProcessors';

export * from './types';
