/**
 * src/camera/index.ts
 *
 * Public surface of the camera layer. The Scan screen / orchestrator should
 * import from here.
 */

export { CameraScanView } from './CameraScanView';
export type { CameraScanViewProps } from './CameraScanView';

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
