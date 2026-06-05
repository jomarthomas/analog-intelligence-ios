/**
 * src/storage/imageRepository.ts
 *
 * CRUD layer for ScannedImage:
 *   • SQLite metadata via expo-sqlite (openDatabase from db.ts)
 *   • Image files in expo-file-system (SDK 56 new File/Directory API)
 *     — originals  → Documents/originals/
 *     — processed  → Documents/processed/
 *     — thumbnails → Cache/thumbnails/   (regeneratable)
 *   • Thumbnail generation via expo-image-manipulator
 *
 * All public functions are async and throw StorageError on failure.
 * None of them mutate the zustand store — the store calls these functions
 * and updates its own state (see galleryStore.ts).
 */

import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { openDatabase, type ImageRow, type SessionRow } from './db';
import type {
  CaptureMetadata,
  ExportRecord,
  ExposureMetrics,
  ProcessParamsSnapshot,
  ScanSession,
  ScannedImage,
  SessionStats,
  StorageStats,
} from './models';

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

/**
 * Lazily initialises and returns a Directory, creating it if absent.
 * Uses the SDK 56 `File / Directory` API (not the legacy FileSystem module).
 */
function ensureDir(parent: Directory, name: string): Directory {
  const dir = new Directory(parent, name);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

/** Returns and ensures the originals directory under Documents. */
function originalsDir(): Directory {
  return ensureDir(Paths.document, 'originals');
}

/** Returns and ensures the processed-images directory under Documents. */
function processedDir(): Directory {
  return ensureDir(Paths.document, 'processed');
}

/** Returns and ensures the thumbnails directory under Cache. */
function thumbnailsDir(): Directory {
  return ensureDir(Paths.cache, 'thumbnails');
}

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------

function imageExtension(format: ScannedImage['captureMetadata']['format']): string {
  switch (format) {
    case 'heic': return 'heic';
    case 'jpeg': return 'jpg';
    case 'raw':  return 'dng';
    case 'png':  return 'png';
  }
}

function generateImageFilename(id: string, format: ScannedImage['captureMetadata']['format']): string {
  return `${id}.${imageExtension(format)}`;
}

function generateThumbnailFilename(id: string): string {
  return `thumb_${id}.jpg`;
}

// ---------------------------------------------------------------------------
// Row → Model mappers
// ---------------------------------------------------------------------------

function rowToImage(row: ImageRow): ScannedImage {
  const captureMetadata = safeJsonParse<CaptureMetadata>(row.capture_metadata, {
    whiteBalance: 'auto',
    format: 'jpeg',
    focusLocked: false,
    exposureLocked: false,
    whiteBalanceLocked: false,
  });
  const exportHistory = safeJsonParse<ExportRecord[]>(row.export_history, []);
  const processParams = row.process_params
    ? safeJsonParse<ProcessParamsSnapshot>(row.process_params, undefined)
    : undefined;
  const exposureMetrics = row.exposure_metrics
    ? safeJsonParse<ExposureMetrics>(row.exposure_metrics, undefined)
    : undefined;

  return {
    id: row.id,
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    originalUri: row.original_uri,
    processedUri: row.processed_uri ?? undefined,
    thumbnailUri: row.thumbnail_uri ?? undefined,
    isProcessed: row.is_processed === 1,
    isRaw: row.is_raw === 1,
    wasProAtCapture: row.was_pro_at_capture === 1,
    captureMetadata,
    frameNote: row.frame_note ?? undefined,
    processParams,
    exposureMetrics,
    exportHistory,
  };
}

function rowToSession(row: SessionRow): ScanSession {
  const imageIds = safeJsonParse<string[]>(row.image_ids, []);
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    notes: row.notes ?? undefined,
    filmType: (row.film_type as ScanSession['filmType']) ?? undefined,
    filmBrand: row.film_brand ?? undefined,
    filmSpeed: row.film_speed ?? undefined,
    exposureIndex: row.exposure_index ?? undefined,
    camera: row.camera ?? undefined,
    lens: row.lens ?? undefined,
    shotDate: row.shot_date ?? undefined,
    sessionState: row.session_state as ScanSession['sessionState'],
    imageIds,
  };
}

function safeJsonParse<T>(json: string, fallback: T): T;
function safeJsonParse<T>(json: string, fallback: undefined): T | undefined;
function safeJsonParse<T>(json: string, fallback: T | undefined): T | undefined {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'IMAGE_NOT_FOUND'
      | 'SESSION_NOT_FOUND'
      | 'FILE_WRITE_FAILED'
      | 'FILE_READ_FAILED'
      | 'THUMBNAIL_FAILED'
      | 'NO_ACTIVE_SESSION'
      | 'INSUFFICIENT_STORAGE',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

// ---------------------------------------------------------------------------
// ScannedImage CRUD
// ---------------------------------------------------------------------------

/**
 * Persist a new ScannedImage record: writes the original file to disk,
 * generates a thumbnail, and inserts a row into SQLite.
 *
 * @param params.imageBase64 Base64-encoded image data (no data-URI prefix).
 * @param params.format      Image format — drives file extension.
 * @param params.sessionId   The owning session ID.
 * @param params.captureMetadata Camera settings at capture time.
 * @param params.processParams  Initial (possibly default) process params.
 * @param params.wasProAtCapture Pro status at time of capture.
 * @param params.id          Caller-supplied UUID string (default: random).
 * @returns The newly persisted ScannedImage.
 */
export async function saveImage(params: {
  imageBase64: string;
  format: CaptureMetadata['format'];
  sessionId: string;
  captureMetadata: CaptureMetadata;
  processParams?: ProcessParamsSnapshot;
  wasProAtCapture?: boolean;
  id?: string;
}): Promise<ScannedImage> {
  const {
    imageBase64,
    format,
    sessionId,
    captureMetadata,
    processParams,
    wasProAtCapture = false,
    id = generateUUID(),
  } = params;

  // Write original file to disk
  const filename = generateImageFilename(id, format);
  const originalFile = new File(originalsDir(), filename);

  try {
    originalFile.write(imageBase64, { encoding: 'base64' });
  } catch (err) {
    throw new StorageError(
      `Failed to write original image for ${id}`,
      'FILE_WRITE_FAILED',
      err,
    );
  }

  const originalUri = originalFile.uri;

  // Generate thumbnail
  let thumbnailUri: string | undefined;
  try {
    thumbnailUri = await generateThumbnail(originalUri, id);
  } catch {
    // Thumbnail failure is non-fatal; the gallery will show a placeholder.
    thumbnailUri = undefined;
  }

  const now = nowIso();
  const image: ScannedImage = {
    id,
    sessionId,
    createdAt: now,
    updatedAt: now,
    originalUri,
    processedUri: undefined,
    thumbnailUri,
    isProcessed: false,
    isRaw: format === 'raw',
    wasProAtCapture,
    captureMetadata,
    processParams,
    exposureMetrics: undefined,
    exportHistory: [],
  };

  await insertImageRow(image);
  return image;
}

/**
 * Persist a processed-positive URI for an existing image.
 * Updates the DB row and returns the updated ScannedImage.
 */
export async function saveProcessedImage(params: {
  imageId: string;
  processedUri: string;
  processParams: ProcessParamsSnapshot;
}): Promise<ScannedImage> {
  const { imageId, processedUri, processParams } = params;
  const db = await openDatabase();
  const now = nowIso();

  const result = await db.runAsync(
    `UPDATE images SET
       processed_uri = ?,
       is_processed  = 1,
       process_params = ?,
       updated_at    = ?
     WHERE id = ?`,
    [processedUri, JSON.stringify(processParams), now, imageId],
  );

  if (result.changes === 0) {
    throw new StorageError(`Image not found: ${imageId}`, 'IMAGE_NOT_FOUND');
  }

  const updated = await getImage(imageId);
  if (!updated) {
    throw new StorageError(`Image not found after update: ${imageId}`, 'IMAGE_NOT_FOUND');
  }
  return updated;
}

/**
 * Copy a processed-positive file from the pipeline cache into the permanent
 * processed/ directory, then call saveProcessedImage to update the DB.
 *
 * @param imageId       The ScannedImage to update.
 * @param sourceCacheUri file:// URI of the rendered positive (e.g. from processNegative).
 * @param processParams  The ProcessParamsSnapshot that produced this render.
 */
export async function commitProcessedImage(params: {
  imageId: string;
  sourceCacheUri: string;
  processParams: ProcessParamsSnapshot;
}): Promise<ScannedImage> {
  const { imageId, sourceCacheUri, processParams } = params;

  // Copy from cache into permanent processed directory
  const destFilename = `${imageId}.jpg`;
  const destFile = new File(processedDir(), destFilename);

  const sourceFile = new File(sourceCacheUri);
  if (!sourceFile.exists) {
    throw new StorageError(
      `Source cache file not found: ${sourceCacheUri}`,
      'FILE_READ_FAILED',
    );
  }

  try {
    await sourceFile.copy(destFile, { overwrite: true });
  } catch (err) {
    throw new StorageError(
      `Failed to copy processed image for ${imageId}`,
      'FILE_WRITE_FAILED',
      err,
    );
  }

  return saveProcessedImage({
    imageId,
    processedUri: destFile.uri,
    processParams,
  });
}

/**
 * Update the ProcessParamsSnapshot for an image (user changed sliders without
 * re-running the full pipeline).
 */
export async function updateProcessParams(
  imageId: string,
  processParams: ProcessParamsSnapshot,
): Promise<void> {
  const db = await openDatabase();
  const now = nowIso();

  const result = await db.runAsync(
    `UPDATE images SET process_params = ?, updated_at = ? WHERE id = ?`,
    [JSON.stringify(processParams), now, imageId],
  );

  if (result.changes === 0) {
    throw new StorageError(`Image not found: ${imageId}`, 'IMAGE_NOT_FOUND');
  }
}

/**
 * Store ExposureMetrics for an image (called by the Insights agent after
 * histogram analysis).
 */
export async function saveExposureMetrics(
  imageId: string,
  metrics: ExposureMetrics,
): Promise<void> {
  const db = await openDatabase();
  const now = nowIso();

  const result = await db.runAsync(
    `UPDATE images SET exposure_metrics = ?, updated_at = ? WHERE id = ?`,
    [JSON.stringify(metrics), now, imageId],
  );

  if (result.changes === 0) {
    throw new StorageError(`Image not found: ${imageId}`, 'IMAGE_NOT_FOUND');
  }
}

/**
 * Update the free-text note attached to a single frame.
 * Pass `undefined` (or an empty string) to clear the note.
 */
export async function updateImageNote(
  imageId: string,
  note: string | undefined,
): Promise<void> {
  const db = await openDatabase();
  const now = nowIso();
  const value = note && note.trim().length > 0 ? note : null;

  const result = await db.runAsync(
    `UPDATE images SET frame_note = ?, updated_at = ? WHERE id = ?`,
    [value, now, imageId],
  );

  if (result.changes === 0) {
    throw new StorageError(`Image not found: ${imageId}`, 'IMAGE_NOT_FOUND');
  }
}

/**
 * Append an export record to an image's audit trail.
 */
export async function addExportRecord(
  imageId: string,
  record: Omit<ExportRecord, 'id' | 'exportDate'>,
): Promise<void> {
  const image = await getImage(imageId);
  if (!image) {
    throw new StorageError(`Image not found: ${imageId}`, 'IMAGE_NOT_FOUND');
  }

  const newRecord: ExportRecord = {
    id: generateUUID(),
    exportDate: nowIso(),
    ...record,
  };

  const updatedHistory = [...image.exportHistory, newRecord];
  const db = await openDatabase();
  const now = nowIso();

  await db.runAsync(
    `UPDATE images SET export_history = ?, updated_at = ? WHERE id = ?`,
    [JSON.stringify(updatedHistory), now, imageId],
  );
}

/**
 * Fetch one ScannedImage by ID, or null if not found.
 */
export async function getImage(imageId: string): Promise<ScannedImage | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<ImageRow>(
    'SELECT * FROM images WHERE id = ?',
    [imageId],
  );
  return row ? rowToImage(row) : null;
}

/**
 * Fetch all images belonging to a session, sorted newest-first.
 */
export async function getImagesBySession(
  sessionId: string,
): Promise<ScannedImage[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<ImageRow>(
    'SELECT * FROM images WHERE session_id = ? ORDER BY created_at DESC',
    [sessionId],
  );
  return rows.map(rowToImage);
}

/**
 * Fetch all images across all sessions, sorted newest-first.
 */
export async function getAllImages(): Promise<ScannedImage[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<ImageRow>(
    'SELECT * FROM images ORDER BY created_at DESC',
  );
  return rows.map(rowToImage);
}

/**
 * Multi-select helper: fetch a set of images by their IDs in one query.
 */
export async function getImagesByIds(ids: string[]): Promise<ScannedImage[]> {
  if (ids.length === 0) return [];
  const db = await openDatabase();
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.getAllAsync<ImageRow>(
    `SELECT * FROM images WHERE id IN (${placeholders}) ORDER BY created_at DESC`,
    ids,
  );
  return rows.map(rowToImage);
}

/**
 * Delete an image: removes all associated files from disk and the DB row.
 */
export async function deleteImage(imageId: string): Promise<void> {
  const image = await getImage(imageId);
  if (!image) {
    throw new StorageError(`Image not found: ${imageId}`, 'IMAGE_NOT_FOUND');
  }

  // Delete files — errors are swallowed (files may already be absent).
  deleteFileSafe(image.originalUri);
  if (image.processedUri) deleteFileSafe(image.processedUri);
  if (image.thumbnailUri) deleteFileSafe(image.thumbnailUri);

  const db = await openDatabase();
  await db.runAsync('DELETE FROM images WHERE id = ?', [imageId]);
}

/**
 * Delete multiple images. Calls deleteImage in sequence to ensure file cleanup.
 */
export async function deleteImages(imageIds: string[]): Promise<void> {
  for (const id of imageIds) {
    await deleteImage(id);
  }
}

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

/**
 * Persist a new ScanSession row.
 */
export async function saveSession(session: ScanSession): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO sessions
       (id, created_at, updated_at, name, notes, film_type, film_brand,
        film_speed, exposure_index, camera, lens, shot_date,
        session_state, image_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.createdAt,
      session.updatedAt,
      session.name,
      session.notes ?? null,
      session.filmType ?? null,
      session.filmBrand ?? null,
      session.filmSpeed ?? null,
      session.exposureIndex ?? null,
      session.camera ?? null,
      session.lens ?? null,
      session.shotDate ?? null,
      session.sessionState,
      JSON.stringify(session.imageIds),
    ],
  );
}

/**
 * Update mutable fields of an existing session.
 */
export async function updateSession(
  sessionId: string,
  patch: Partial<
    Pick<
      ScanSession,
      | 'name'
      | 'notes'
      | 'filmType'
      | 'filmBrand'
      | 'filmSpeed'
      | 'exposureIndex'
      | 'camera'
      | 'lens'
      | 'shotDate'
      | 'sessionState'
      | 'imageIds'
    >
  >,
): Promise<ScanSession> {
  const existing = await getSession(sessionId);
  if (!existing) {
    throw new StorageError(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND');
  }

  const updated: ScanSession = {
    ...existing,
    ...patch,
    updatedAt: nowIso(),
  };

  await saveSession(updated);
  return updated;
}

/**
 * Fetch one ScanSession by ID, or null if not found.
 */
export async function getSession(sessionId: string): Promise<ScanSession | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<SessionRow>(
    'SELECT * FROM sessions WHERE id = ?',
    [sessionId],
  );
  return row ? rowToSession(row) : null;
}

/**
 * Fetch all sessions, sorted by most-recently-updated first.
 */
export async function getAllSessions(): Promise<ScanSession[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<SessionRow>(
    'SELECT * FROM sessions ORDER BY updated_at DESC',
  );
  return rows.map(rowToSession);
}

/**
 * Delete a session and all its images (cascade via deleteImages).
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new StorageError(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND');
  }

  // Delete all images first (handles file cleanup).
  await deleteImages(session.imageIds);

  const db = await openDatabase();
  await db.runAsync('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

/**
 * Append an image ID to a session's imageIds list and persist.
 */
export async function addImageToSession(
  sessionId: string,
  imageId: string,
): Promise<void> {
  await updateSession(sessionId, {});
  const session = await getSession(sessionId);
  if (!session) {
    throw new StorageError(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND');
  }
  if (!session.imageIds.includes(imageId)) {
    await updateSession(sessionId, { imageIds: [...session.imageIds, imageId] });
  }
}

/**
 * Remove an image ID from a session's imageIds list and persist.
 */
export async function removeImageFromSession(
  sessionId: string,
  imageId: string,
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  await updateSession(sessionId, {
    imageIds: session.imageIds.filter((id) => id !== imageId),
  });
}

// ---------------------------------------------------------------------------
// Storage stats
// ---------------------------------------------------------------------------

/**
 * Compute storage usage across all managed directories.
 * Uses expo-file-system Directory.size (SDK 56).
 */
export async function getStorageStats(): Promise<StorageStats> {
  const db = await openDatabase();

  const totalRow = await db.getFirstAsync<{ count: number; processed: number }>(
    `SELECT COUNT(*) as count, SUM(is_processed) as processed FROM images`,
  );

  const totalImages = totalRow?.count ?? 0;
  const processedImages = totalRow?.processed ?? 0;

  // Sum directory sizes — Directory.size returns null if dir doesn't exist.
  const originalsSize = getDirSize(originalsDir());
  const processedSize = getDirSize(processedDir());
  const thumbsSize = getDirSize(thumbnailsDir());
  const totalBytes = originalsSize + processedSize + thumbsSize;

  return {
    totalBytes,
    formattedSize: formatBytes(totalBytes),
    totalImages,
    processedImages,
    unprocessedImages: totalImages - processedImages,
  };
}

/**
 * Return session-level stats.
 */
export async function getSessionStats(): Promise<SessionStats> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{ session_state: string; count: number }>(
    `SELECT session_state, COUNT(*) as count FROM sessions GROUP BY session_state`,
  );

  let active = 0;
  let completed = 0;
  let archived = 0;

  for (const row of rows) {
    if (row.session_state === 'active') active = row.count;
    else if (row.session_state === 'completed') completed = row.count;
    else if (row.session_state === 'archived') archived = row.count;
  }

  return {
    totalSessions: active + completed + archived,
    activeSessions: active,
    completedSessions: completed,
    archivedSessions: archived,
  };
}

// ---------------------------------------------------------------------------
// Thumbnail generation
// ---------------------------------------------------------------------------

/** Max dimension for thumbnails (matches legacy FileSystemHelper). */
const THUMBNAIL_MAX_DIMENSION = 200;

/**
 * Generate a 200 px thumbnail via expo-image-manipulator and save it to
 * the thumbnails cache directory.
 *
 * @param sourceUri file:// URI of the original image.
 * @param imageId   Used to name the thumbnail file.
 * @returns file:// URI of the thumbnail.
 */
export async function generateThumbnail(
  sourceUri: string,
  imageId: string,
): Promise<string> {
  try {
    const ctx = ImageManipulator.manipulate(sourceUri);
    ctx.resize({ width: THUMBNAIL_MAX_DIMENSION });
    const imageRef = await ctx.renderAsync();
    const result = await imageRef.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.75,
    });

    // Copy from the manipulator's temp location into our thumbnails dir
    const thumbFilename = generateThumbnailFilename(imageId);
    const destFile = new File(thumbnailsDir(), thumbFilename);
    const srcFile = new File(result.uri);
    await srcFile.copy(destFile, { overwrite: true });

    return destFile.uri;
  } catch (err) {
    throw new StorageError(
      `Thumbnail generation failed for ${imageId}`,
      'THUMBNAIL_FAILED',
      err,
    );
  }
}

/**
 * Regenerate thumbnails for all images that are missing one.
 * Useful after cache purge or first-run migration.
 */
export async function regenerateMissingThumbnails(): Promise<void> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<Pick<ImageRow, 'id' | 'original_uri'>>(
    `SELECT id, original_uri FROM images WHERE thumbnail_uri IS NULL`,
  );

  for (const row of rows) {
    try {
      const thumbUri = await generateThumbnail(row.original_uri, row.id);
      const now = nowIso();
      await db.runAsync(
        `UPDATE images SET thumbnail_uri = ?, updated_at = ? WHERE id = ?`,
        [thumbUri, now, row.id],
      );
    } catch {
      // Silently continue — one failure should not block the rest.
    }
  }
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

/**
 * Clear all thumbnails from the cache directory.
 * The DB rows are updated to unset thumbnail_uri so they will be regenerated
 * on next access.
 */
export async function clearThumbnailCache(): Promise<void> {
  const dir = thumbnailsDir();
  const items = dir.exists ? dir.list() : [];

  for (const item of items) {
    try {
      item.delete();
    } catch {
      // best-effort
    }
  }

  const db = await openDatabase();
  await db.execAsync(
    `UPDATE images SET thumbnail_uri = NULL, updated_at = '${nowIso()}' WHERE thumbnail_uri IS NOT NULL`,
  );
}

/**
 * Delete ALL app data (factory reset).
 * Removes all files and clears the database tables.
 */
export async function deleteAllData(): Promise<void> {
  // Delete all files
  deleteDirectoryContentsSafe(originalsDir());
  deleteDirectoryContentsSafe(processedDir());
  deleteDirectoryContentsSafe(thumbnailsDir());

  const db = await openDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync('DELETE FROM images');
    await txn.execAsync('DELETE FROM sessions');
  });
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function insertImageRow(image: ScannedImage): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    `INSERT INTO images
       (id, session_id, created_at, updated_at, original_uri, processed_uri,
        thumbnail_uri, is_processed, is_raw, was_pro_at_capture,
        capture_metadata, process_params, exposure_metrics, export_history,
        frame_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      image.id,
      image.sessionId,
      image.createdAt,
      image.updatedAt,
      image.originalUri,
      image.processedUri ?? null,
      image.thumbnailUri ?? null,
      image.isProcessed ? 1 : 0,
      image.isRaw ? 1 : 0,
      image.wasProAtCapture ? 1 : 0,
      JSON.stringify(image.captureMetadata),
      image.processParams ? JSON.stringify(image.processParams) : null,
      image.exposureMetrics ? JSON.stringify(image.exposureMetrics) : null,
      JSON.stringify(image.exportHistory),
      image.frameNote ?? null,
    ],
  );
}

function deleteFileSafe(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // best-effort
  }
}

function deleteDirectoryContentsSafe(dir: Directory): void {
  if (!dir.exists) return;
  try {
    const items = dir.list();
    for (const item of items) {
      try {
        item.delete();
      } catch {
        // continue
      }
    }
  } catch {
    // best-effort
  }
}

function getDirSize(dir: Directory): number {
  if (!dir.exists) return 0;
  return dir.size ?? 0;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(1)} ${units[i] ?? 'B'}`;
}

/**
 * UUID v4 generator using the Web Crypto API (available in Hermes JS engine
 * on RN 0.73+ / Expo SDK 50+).
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: Math.random-based (acceptable for IDs, not security).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export { generateUUID };
