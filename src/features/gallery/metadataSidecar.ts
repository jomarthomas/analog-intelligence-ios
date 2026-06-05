/**
 * src/features/gallery/metadataSidecar.ts
 *
 * Metadata "sidecar" export for the Gallery.
 *
 * Photographers cataloguing film expect the shot/roll metadata to travel with
 * the image. True EXIF/XMP embedding requires a native library we don't have in
 * the Expo SDK 56 managed surface (expo-image-manipulator strips/normalises
 * metadata and exposes no EXIF write API). Until that native capability exists,
 * we write a *sidecar*:
 *
 *   • a per-frame JSON file        →  <name>.json   (alongside one image)
 *   • a per-roll JSON manifest     →  <roll>.metadata.json
 *   • a per-roll CSV manifest      →  <roll>.csv     (spreadsheet-friendly)
 *
 * Files are written to the cache directory and then handed to the system share
 * sheet via expo-sharing, so the user can drop them next to the exported image
 * (Files app, AirDrop, cloud, etc.).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO(native-exif): Replace/augment this with real in-file metadata embedding.
 *   Embedding EXIF (DateTimeOriginal, ISOSpeedRatings, FNumber, ExposureTime,
 *   FocalLength, Make/Model) + XMP (roll name, film stock, notes) directly into
 *   the exported JPEG/TIFF needs a native module — e.g. a tiny Expo module
 *   wrapping libexif / ExifInterface (Android) + CGImageDestination /
 *   ImageIO `kCGImagePropertyExifDictionary` (iOS), or a JS lib such as
 *   piexifjs operating on the JPEG bytes before write. When that lands, map the
 *   FrameMetadataSidecar / RollMetadataSidecar fields onto EXIF/XMP tags and
 *   keep this sidecar as an optional extra. See exportImage.ts for the call site.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  METADATA_SIDECAR_VERSION,
  type FrameMetadataSidecar,
  type MetadataSidecar,
  type RollMetadataSidecar,
  type ScanSession,
  type ScannedImage,
} from '@/storage';

const GENERATOR = 'AnalogIntelligence/metadata-sidecar';

// ---------------------------------------------------------------------------
// Pure builders (no I/O) — exported for testing / reuse
// ---------------------------------------------------------------------------

/**
 * Project a ScannedImage onto the export-friendly frame block.
 * @param frameNumber 1-based index of the frame within its roll, when known.
 */
export function buildFrameSidecar(
  image: ScannedImage,
  frameNumber?: number,
): FrameMetadataSidecar {
  const m = image.captureMetadata;
  return {
    id: image.id,
    frameNumber,
    createdAt: image.createdAt,
    note: image.frameNote,
    exposureTime: m.exposureTime,
    iso: m.iso,
    focalLength: m.focalLength,
    aperture: m.aperture,
    format: m.format,
    isProcessed: image.isProcessed,
    isRaw: image.isRaw,
  };
}

/** Project a ScanSession onto the export-friendly roll block. */
export function buildRollSidecar(
  session: ScanSession,
  frameCount: number,
): RollMetadataSidecar {
  return {
    id: session.id,
    name: session.name,
    notes: session.notes,
    filmType: session.filmType,
    filmBrand: session.filmBrand,
    filmSpeed: session.filmSpeed,
    exposureIndex: session.exposureIndex,
    camera: session.camera,
    lens: session.lens,
    shotDate: session.shotDate,
    createdAt: session.createdAt,
    frameCount,
  };
}

/** Build a single-frame sidecar document. */
export function buildFrameSidecarDocument(
  image: ScannedImage,
  session: ScanSession | undefined,
  frameNumber?: number,
): MetadataSidecar {
  return {
    schemaVersion: METADATA_SIDECAR_VERSION,
    generator: GENERATOR,
    generatedAt: new Date().toISOString(),
    roll: session ? buildRollSidecar(session, session.imageIds.length) : undefined,
    frame: buildFrameSidecar(image, frameNumber),
  };
}

/**
 * Build a roll-manifest sidecar document (roll + every frame).
 * `images` should be in roll order; the index becomes the 1-based frameNumber.
 */
export function buildRollSidecarDocument(
  session: ScanSession,
  images: ScannedImage[],
): MetadataSidecar {
  return {
    schemaVersion: METADATA_SIDECAR_VERSION,
    generator: GENERATOR,
    generatedAt: new Date().toISOString(),
    roll: buildRollSidecar(session, images.length),
    frames: images.map((img, i) => buildFrameSidecar(img, i + 1)),
  };
}

// ---------------------------------------------------------------------------
// CSV serialisation (pure)
// ---------------------------------------------------------------------------

const CSV_COLUMNS: readonly (keyof FrameMetadataSidecar)[] = [
  'frameNumber',
  'id',
  'createdAt',
  'note',
  'exposureTime',
  'iso',
  'focalLength',
  'aperture',
  'format',
  'isProcessed',
  'isRaw',
];

/** RFC-4180-ish field escaping: quote when the value contains , " or newline. */
function csvField(value: unknown): string {
  if (value === undefined || value === null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialise a roll's frames to CSV. The first commented line carries roll-level
 * metadata so the single file is self-describing; the second line is the header.
 */
export function buildRollCsv(
  session: ScanSession,
  images: ScannedImage[],
): string {
  const roll = buildRollSidecar(session, images.length);
  const rollSummary =
    `# Roll: ${roll.name}` +
    (roll.filmBrand ? ` | Stock: ${roll.filmBrand}` : '') +
    (roll.filmSpeed !== undefined ? ` | ISO: ${roll.filmSpeed}` : '') +
    (roll.exposureIndex !== undefined ? ` | EI: ${roll.exposureIndex}` : '') +
    (roll.camera ? ` | Camera: ${roll.camera}` : '') +
    (roll.lens ? ` | Lens: ${roll.lens}` : '') +
    (roll.shotDate ? ` | Shot: ${roll.shotDate}` : '');

  const header = CSV_COLUMNS.join(',');
  const rows = images.map((img, i) => {
    const frame = buildFrameSidecar(img, i + 1);
    return CSV_COLUMNS.map((col) => csvField(frame[col])).join(',');
  });

  return [rollSummary, header, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Filename helpers (pure)
// ---------------------------------------------------------------------------

/** Make a filesystem-safe slug from a roll name (fallback to id). */
export function slugify(name: string, fallback: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug.length > 0 ? slug : fallback;
}

// ---------------------------------------------------------------------------
// I/O — write + share
// ---------------------------------------------------------------------------

/** Lazily ensure + return the sidecar staging directory under the cache. */
function sidecarDir(): Directory {
  const dir = new Directory(Paths.cache, 'metadata-sidecars');
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

/**
 * Write `contents` to `<sidecarDir>/<filename>` (overwriting) and return its
 * file:// URI.
 */
export function writeSidecarFile(filename: string, contents: string): string {
  const file = new File(sidecarDir(), filename);
  file.write(contents);
  return file.uri;
}

export type SidecarResult =
  | { ok: true; uri: string }
  | { ok: false; reason: 'unavailable' | 'failed'; message: string };

/** Open the system share sheet for a previously-written sidecar file. */
async function shareFile(uri: string, mimeType: string): Promise<SidecarResult> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    return { ok: false, reason: 'unavailable', message: 'Sharing is not available on this device.' };
  }
  await Sharing.shareAsync(uri, { mimeType, UTI: mimeType === 'text/csv' ? 'public.comma-separated-values-text' : 'public.json' });
  return { ok: true, uri };
}

/**
 * Write + share a per-frame JSON sidecar for a single image.
 */
export async function exportFrameSidecar(
  image: ScannedImage,
  session: ScanSession | undefined,
  frameNumber?: number,
): Promise<SidecarResult> {
  try {
    const doc = buildFrameSidecarDocument(image, session, frameNumber);
    const base = slugify(session?.name ?? 'frame', image.id);
    const filename = `${base}-frame-${frameNumber ?? image.id.slice(0, 8)}.json`;
    const uri = writeSidecarFile(filename, JSON.stringify(doc, null, 2));
    return await shareFile(uri, 'application/json');
  } catch (err) {
    return { ok: false, reason: 'failed', message: err instanceof Error ? err.message : 'Failed to write sidecar.' };
  }
}

/**
 * Write + share a roll-level JSON manifest (roll + every frame).
 */
export async function exportRollSidecarJson(
  session: ScanSession,
  images: ScannedImage[],
): Promise<SidecarResult> {
  try {
    const doc = buildRollSidecarDocument(session, images);
    const filename = `${slugify(session.name, session.id)}.metadata.json`;
    const uri = writeSidecarFile(filename, JSON.stringify(doc, null, 2));
    return await shareFile(uri, 'application/json');
  } catch (err) {
    return { ok: false, reason: 'failed', message: err instanceof Error ? err.message : 'Failed to write manifest.' };
  }
}

/**
 * Write + share a roll-level CSV manifest (spreadsheet-friendly).
 */
export async function exportRollSidecarCsv(
  session: ScanSession,
  images: ScannedImage[],
): Promise<SidecarResult> {
  try {
    const csv = buildRollCsv(session, images);
    const filename = `${slugify(session.name, session.id)}.csv`;
    const uri = writeSidecarFile(filename, csv);
    return await shareFile(uri, 'text/csv');
  } catch (err) {
    return { ok: false, reason: 'failed', message: err instanceof Error ? err.message : 'Failed to write CSV.' };
  }
}
