/**
 * src/camera/capturePhoto.ts
 *
 * Capture orchestration: takes a VisionCamera `CameraPhotoOutput`, captures in
 * the requested container format, writes the original bytes to the app cache,
 * and returns a `file://` URI + dimensions for the Pipeline/Storage layers.
 *
 * Key VisionCamera v5 details handled here:
 *   • `Photo` objects are in-memory and MUST be `dispose()`'d.
 *   • `Photo.saveToFileAsync(path)` / `capturePhotoToFile()` return FILESYSTEM
 *     paths (NOT `file://` URLs) — we normalize to `file://` for downstream.
 *   • RAW/DNG: on Android, in-memory photos for RAW are unreliable, so we use
 *     `capturePhotoToFile()`. On iOS we try `'dng'` and fall back to HEIC if the
 *     device/session rejects it (graceful fallback per task #5).
 *
 * Ported from legacy CameraManager.capturePhoto() + CaptureMode mapping.
 */

import { Directory, File, Paths } from 'expo-file-system';
import type {
  CameraPhotoOutput,
  CapturePhotoSettings,
  Photo,
} from 'react-native-vision-camera';

import { CAPTURE_FORMATS, type CaptureFormat, type CaptureResult } from '@/camera/types';

/** Sub-directory of the cache where original captures land. */
const SCANS_DIRNAME = 'scans';

export interface CaptureOptions {
  format: CaptureFormat;
  flashMode: 'off' | 'on' | 'auto';
  /** Whether the device/session is believed to support RAW (gates DNG). */
  supportsRaw: boolean;
}

/**
 * Capture a photo and persist the original to the app cache.
 *
 * @throws if the capture itself fails for a non-format reason (e.g. session not
 *         ready). Format-unsupported DNG is caught internally and downgraded.
 */
export async function capturePhoto(
  photoOutput: CameraPhotoOutput,
  options: CaptureOptions,
): Promise<CaptureResult> {
  const wantsDng = options.format === 'dng' && options.supportsRaw;
  const settings: CapturePhotoSettings = {
    flashMode: options.flashMode,
    enableShutterSound: true,
  };

  const scansDir = ensureScansDir();

  // RAW path: prefer capture-to-file (required on Android, fine on iOS).
  if (wantsDng) {
    try {
      return await captureRawToFile(photoOutput, settings, scansDir);
    } catch (err) {
      // Graceful fallback: device/session rejected RAW — capture HEIC instead.
      if (__DEV__) {
        console.warn('[capturePhoto] RAW capture failed, falling back to HEIC:', err);
      }
      return await captureProcessed(photoOutput, settings, scansDir, 'heic');
    }
  }

  // Processed path (HEIC / JPEG). A DNG request that reached here means RAW is
  // unsupported on this device — downgrade to HEIC (graceful fallback).
  const processedFormat: Exclude<CaptureFormat, 'dng'> =
    options.format === 'dng' ? 'heic' : options.format;
  return await captureProcessed(photoOutput, settings, scansDir, processedFormat);
}

// ---------------------------------------------------------------------------
// Processed (HEIC / JPEG) capture
// ---------------------------------------------------------------------------

async function captureProcessed(
  photoOutput: CameraPhotoOutput,
  settings: CapturePhotoSettings,
  scansDir: Directory,
  format: Exclude<CaptureFormat, 'dng'>,
): Promise<CaptureResult> {
  // Note: the container format (HEIC/JPEG) is configured on the photo OUTPUT
  // via usePhotoOutput({ containerFormat }) in CameraScanView — VisionCamera v5
  // sets it at the output level, not per-capture — so it is not passed here.
  let photo: Photo | undefined;
  try {
    photo = await photoOutput.capturePhoto({ ...settings }, {});
    const ext = CAPTURE_FORMATS[format].fileExtension;
    const target = uniqueFile(scansDir, ext);
    // saveToFileAsync wants a filesystem path (no file://) for a not-yet-existing file.
    await photo.saveToFileAsync(toFsPath(target.uri));
    return {
      uri: target.uri,
      format,
      width: photo.width,
      height: photo.height,
      isRaw: false,
    };
  } finally {
    photo?.dispose();
  }
}

// ---------------------------------------------------------------------------
// RAW (DNG) capture — capture-to-file
// ---------------------------------------------------------------------------

async function captureRawToFile(
  photoOutput: CameraPhotoOutput,
  settings: CapturePhotoSettings,
  scansDir: Directory,
): Promise<CaptureResult> {
  // The photo output is already configured with `containerFormat: 'dng'`
  // (set in CameraScanView via usePhotoOutput). We use capturePhotoToFile here
  // because VisionCamera v5 notes that in-memory RAW Photos are unreliable on
  // Android (CameraX limitation); capture-to-file is the safe RAW path on both
  // platforms. We then relocate the temp file into our managed scans dir.
  const photoFile = await photoOutput.capturePhotoToFile({ ...settings }, {});
  const sourcePath = photoFile.filePath; // filesystem path, no file://
  const source = new File(toFileUri(sourcePath));

  const target = uniqueFile(scansDir, CAPTURE_FORMATS.dng.fileExtension);
  // Move the temp capture into our managed scans directory.
  source.moveSync(target);

  return {
    uri: target.uri,
    format: 'dng',
    // Dimensions are not returned by capturePhotoToFile; left as 0 — the
    // Pipeline reads true dimensions when it decodes the DNG.
    width: 0,
    height: 0,
    isRaw: true,
  };
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/** Ensure (and return) the cache/scans directory. */
function ensureScansDir(): Directory {
  const dir = new Directory(Paths.cache, SCANS_DIRNAME);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

/** A unique, not-yet-existing File in `dir` with the given extension. */
function uniqueFile(dir: Directory, extension: string): File {
  const name = `scan_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${extension}`;
  return new File(dir, name);
}

/** Convert a `file://` URI to a bare filesystem path. */
function toFsPath(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

/** Convert a bare filesystem path to a `file://` URI (idempotent). */
function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}
