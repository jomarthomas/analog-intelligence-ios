/**
 * src/features/gallery/exportImage.ts
 *
 * Export helper for the Gallery: takes a processed (or original) ScannedImage,
 * applies free-tier resolution clamping, then either saves it to the Photos
 * library (expo-media-library) or opens the system share sheet (expo-sharing).
 *
 * Free-tier rules (from @/monetization):
 *   • clampResolution(size) downscales the export to HD for non-Pro users.
 *   • buildExportWatermarkParams() returns a watermark descriptor for free
 *     users. NOTE: expo-image-manipulator cannot draw text, and no native
 *     watermark-bake helper is wired into modules/ yet, so the watermark is
 *     currently only rendered as a UI overlay (WatermarkOverlay) on previews.
 *     Baking it into the exported file is a P0 follow-up — see the TODO below.
 *
 * Every export is recorded in the image's audit trail via addExportRecord().
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

import {
  buildExportWatermarkParams,
  clampResolution,
  getProStatusSync,
} from '@/monetization';
import { addExportRecord } from '@/storage';
import type { ScannedImage } from '@/storage';

export type ExportDestination = 'photos' | 'share';

export type ExportResultStatus =
  | { ok: true; uri: string; destination: ExportDestination }
  | { ok: false; reason: 'no-image' | 'permission-denied' | 'unavailable' | 'failed'; message: string };

/**
 * Resolve the best source URI for export: the processed positive when present,
 * else the original capture (e.g. user exports before processing).
 */
function sourceUriFor(image: ScannedImage): string | null {
  return image.processedUri ?? image.originalUri ?? null;
}

/**
 * Render the export file: applies resolution clamping for the free tier and
 * re-encodes as JPEG into a temp file. Returns the temp URI + final size.
 *
 * The watermark descriptor (free tier) is computed here so the bake step can
 * be slotted in once a native/Skia text compositor is available (P0 follow-up).
 */
async function renderExportFile(sourceUri: string): Promise<{ uri: string }> {
  // First render at native size to learn the true pixel dimensions.
  const baseRef = await ImageManipulator.manipulate(sourceUri).renderAsync();
  const original = { width: baseRef.width, height: baseRef.height };

  // Free-tier clamp (Pro returns the original size unchanged).
  const target = clampResolution(original);

  const ctx = ImageManipulator.manipulate(sourceUri);
  if (target.width !== original.width || target.height !== original.height) {
    ctx.resize({ width: target.width, height: target.height });
  }
  const rendered = await ctx.renderAsync();

  // TODO(P0 / orchestrator): bake the free-tier watermark into the file.
  // expo-image-manipulator has no text-drawing API and no native watermark
  // helper exists in modules/ yet. buildExportWatermarkParams() already
  // describes the desired overlay; a Skia or native compositor should consume
  // it here before saveAsync. For now non-Pro exports are clamped but not
  // watermarked at the file level (the UI overlay still applies on previews).
  const watermark = buildExportWatermarkParams();
  void watermark;

  const result = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: getProStatusSync() ? 0.95 : 0.85,
  });

  return { uri: result.uri };
}

/**
 * Export a single image to the Photos library or the share sheet.
 *
 * @param image       The ScannedImage to export.
 * @param destination 'photos' (save to camera roll) or 'share' (share sheet).
 */
export async function exportImage(
  image: ScannedImage,
  destination: ExportDestination,
): Promise<ExportResultStatus> {
  const sourceUri = sourceUriFor(image);
  if (sourceUri === null) {
    return { ok: false, reason: 'no-image', message: 'This frame has no image to export.' };
  }

  try {
    const { uri } = await renderExportFile(sourceUri);

    if (destination === 'photos') {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        return {
          ok: false,
          reason: 'permission-denied',
          message: 'Photos access is needed to save exports.',
        };
      }
      await MediaLibrary.saveToLibraryAsync(uri);
    } else {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        return { ok: false, reason: 'unavailable', message: 'Sharing is not available on this device.' };
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg' });
    }

    // Record the export in the image's audit trail (best-effort).
    try {
      await addExportRecord(image.id, {
        exportType: destination === 'photos' ? 'photos' : 'shareSheet',
        resolution: getProStatusSync() ? 'full' : 'free',
        destination,
      });
    } catch {
      // Audit failure must not fail the export itself.
    }

    return { ok: true, uri, destination };
  } catch (err) {
    return {
      ok: false,
      reason: 'failed',
      message: err instanceof Error ? err.message : 'Export failed.',
    };
  }
}

/**
 * Export several images in sequence to the Photos library.
 * Returns the count of successful saves and the first error (if any).
 */
export async function exportImagesToPhotos(
  images: ScannedImage[],
): Promise<{ saved: number; failed: number; firstError?: string }> {
  // Request permission once up-front for the batch.
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) {
    return { saved: 0, failed: images.length, firstError: 'Photos access is needed to save exports.' };
  }

  let saved = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const image of images) {
    const result = await exportImage(image, 'photos');
    if (result.ok) {
      saved += 1;
    } else {
      failed += 1;
      firstError ??= result.message;
    }
  }

  return { saved, failed, firstError };
}
